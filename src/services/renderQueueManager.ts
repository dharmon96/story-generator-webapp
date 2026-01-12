/**
 * Render Queue Manager Service
 *
 * Manages the video render queue, assigning jobs to available ComfyUI nodes
 * and tracking progress. Works with both dedicated ComfyUI nodes and unified
 * nodes that have dual capabilities (Ollama + ComfyUI).
 *
 * Features:
 * - Automatic job assignment to available nodes
 * - Independent tracking per node capability
 * - WebSocket-based progress monitoring
 * - Retry on failure with configurable attempts
 * - Priority-based job ordering
 */

import { useStore, RenderJob, StoryConfig } from '../store/useStore';
import { nodeDiscoveryService, OllamaNode } from './nodeDiscovery';
import { debugService } from './debugService';
import { HoloCineScene, buildRawPromptString } from '../types/holocineTypes';
import { buildWorkflowForRenderJob } from './comfyUIWorkflowBuilder';
import { ComfyUINodeAssignment } from '../types/comfyuiTypes';

interface NodeRenderStatus {
  nodeId: string;
  currentJobId: string | null;
  wsConnection: WebSocket | null;
  lastActivity: Date;
}

class RenderQueueManager {
  private isProcessing: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private pollIntervalMs: number = 2000;  // Check for new jobs every 2 seconds
  private nodeStatus: Map<string, NodeRenderStatus> = new Map();
  private wsConnections: Map<string, WebSocket> = new Map();
  private statusCheckInterval: NodeJS.Timeout | null = null;
  private statusCheckIntervalMs: number = 10000;  // Check rendering jobs every 10 seconds
  private syncInterval: NodeJS.Timeout | null = null;
  private syncIntervalMs: number = 5000;  // Sync node status every 5 seconds

  /**
   * Start the render queue processing loop
   */
  start(): void {
    if (this.isProcessing) {
      debugService.warn('renderQueue', 'Queue manager already running');
      return;
    }

    debugService.info('renderQueue', '🚀 Starting render queue manager');
    this.isProcessing = true;
    this.pollInterval = setInterval(() => this.processQueue(), this.pollIntervalMs);

    // Start status checking for rendering jobs (fallback for disconnected WebSockets)
    this.statusCheckInterval = setInterval(() => this.checkRenderingJobsStatus(), this.statusCheckIntervalMs);

    // Start node status sync (cleans up stale busy states)
    this.syncInterval = setInterval(() => this.syncNodeStatus(), this.syncIntervalMs);

    // Do an immediate check
    this.processQueue();

    // Also check for any jobs that might have completed while we were offline
    this.checkRenderingJobsStatus();

    // Initial sync
    this.syncNodeStatus();
  }

  /**
   * Stop the render queue processing
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
      this.statusCheckInterval = null;
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.isProcessing = false;

    // Close all WebSocket connections
    this.wsConnections.forEach((ws, nodeId) => {
      debugService.info('renderQueue', `Closing WS connection for ${nodeId}`);
      ws.close();
    });
    this.wsConnections.clear();
    this.nodeStatus.clear();

    debugService.info('renderQueue', '⏹️ Render queue manager stopped');
  }

  /**
   * Check if the manager is currently running
   */
  isRunning(): boolean {
    return this.isProcessing;
  }

  /**
   * Main queue processing loop
   * POOL MODE: Assigns jobs to ALL available nodes, not just one
   */
  private async processQueue(): Promise<void> {
    const store = useStore.getState();

    // Check if auto-render is enabled
    if (!store.renderQueueEnabled) {
      return;
    }

    // Get all queued jobs
    const queuedJobs = store.renderQueue.filter(j => j.status === 'queued');
    if (queuedJobs.length === 0) {
      return;  // No queued jobs
    }

    // Find ALL available ComfyUI nodes
    const availableNodes = this.findAllAvailableRenderNodes();
    if (availableNodes.length === 0) {
      return;  // All nodes busy
    }

    debugService.info('renderQueue', `🔄 Pool processing: ${queuedJobs.length} queued jobs, ${availableNodes.length} available nodes`);

    // Assign jobs to available nodes (up to the number of available nodes)
    const assignmentPromises: Promise<void>[] = [];
    const jobsToAssign = queuedJobs.slice(0, availableNodes.length);

    for (let i = 0; i < jobsToAssign.length; i++) {
      const job = jobsToAssign[i];
      const node = availableNodes[i];

      // Mark node as busy IMMEDIATELY to prevent race conditions
      nodeDiscoveryService.markNodeBusy(node.id, 'comfyui');
      this.nodeStatus.set(node.id, {
        nodeId: node.id,
        currentJobId: job.id,
        wsConnection: null,
        lastActivity: new Date()
      });

      debugService.info('renderQueue', `📤 Assigning job ${job.id} (${job.title}) to node ${node.name}`);
      assignmentPromises.push(this.assignJobToNode(job, node));
    }

    // Wait for all assignments to complete
    await Promise.allSettled(assignmentPromises);
  }

  /**
   * Find an available node with ComfyUI capability
   */
  private findAvailableRenderNode(): OllamaNode | null {
    const available = this.findAllAvailableRenderNodes();
    return available.length > 0 ? available[0] : null;
  }

  /**
   * Find ALL available nodes with ComfyUI capability (for pool processing)
   */
  private findAllAvailableRenderNodes(): OllamaNode[] {
    // Get all nodes with ComfyUI capability
    const comfyNodes = nodeDiscoveryService.getComfyUICapableNodes();
    const availableNodes: OllamaNode[] = [];

    for (const node of comfyNodes) {
      // Check if node is busy with a render job (local tracking)
      const status = this.nodeStatus.get(node.id);
      if (status && status.currentJobId !== null) {
        continue;  // Node is busy with a job we're tracking
      }

      // Also check nodeDiscoveryService status
      if (nodeDiscoveryService.isNodeAvailableFor(node.id, 'comfyui')) {
        availableNodes.push(node);
      }
    }

    debugService.info('renderQueue', `Found ${availableNodes.length} available ComfyUI nodes out of ${comfyNodes.length} total`, {
      available: availableNodes.map(n => n.name),
      total: comfyNodes.map(n => n.name)
    });

    return availableNodes;
  }

  /**
   * Assign a render job to a node and start rendering
   * Note: Node should already be marked busy by processQueue() before calling this
   */
  private async assignJobToNode(job: RenderJob, node: OllamaNode): Promise<void> {
    const store = useStore.getState();

    // Get workflow assignment for this job type
    const assignment = this.getWorkflowAssignment(job);

    debugService.info('renderQueue', `🎬 Assigning job ${job.id} to node ${node.name}`, {
      jobTitle: job.title,
      nodeId: node.id,
      workflowId: assignment?.workflowId || 'legacy'
    });

    // Update job status
    store.updateRenderJob(job.id, {
      status: 'assigned',
      assignedNode: node.id,
      startedAt: new Date(),
      attempts: job.attempts + 1
    });

    // Track node status (may already be set by processQueue, but ensure it's correct)
    const existingStatus = this.nodeStatus.get(node.id);
    if (!existingStatus || existingStatus.currentJobId !== job.id) {
      this.nodeStatus.set(node.id, {
        nodeId: node.id,
        currentJobId: job.id,
        wsConnection: null,
        lastActivity: new Date()
      });
    }

    // Ensure node is marked busy (idempotent - safe to call multiple times)
    nodeDiscoveryService.markNodeBusy(node.id, 'comfyui');

    try {
      // ALWAYS get endpoint directly from nodeDiscoveryService using node ID
      // This ensures we have the latest node info with agentPort for proxy routing
      const endpoint = nodeDiscoveryService.getNodeEndpoint(node.id, 'comfyui');

      // Get fresh node info for debugging
      const freshNode = nodeDiscoveryService.getNode(node.id);
      debugService.info('renderQueue', `🔍 Getting endpoint for node ${node.id}`, {
        nodeId: node.id,
        nodeName: node.name,
        passedAgentPort: node.agentPort,
        freshAgentPort: freshNode?.agentPort,
        freshComfyUIPort: freshNode?.comfyUIPort,
        endpoint
      });

      if (!endpoint) {
        throw new Error(`Could not get ComfyUI endpoint for node ${node.id}`);
      }

      // Build the workflow using the assignment settings
      const workflow = this.buildWorkflowForJob(job, assignment);

      // Update status to rendering
      store.updateRenderJob(job.id, { status: 'rendering' });

      debugService.info('renderQueue', `📤 Sending workflow to ${endpoint}/prompt`, {
        jobId: job.id,
        workflowId: assignment?.workflowId || 'legacy',
        nodeCount: Object.keys(workflow).length,
        positivePromptPreview: job.positivePrompt.substring(0, 100) + (job.positivePrompt.length > 100 ? '...' : '')
      });

      // Send to ComfyUI
      const response = await fetch(`${endpoint}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: `render_queue_${Date.now()}`,
          prompt: workflow
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ComfyUI rejected prompt: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const promptId = result.prompt_id;

      // Store the promptId on the job for fallback status checking
      store.updateRenderJob(job.id, { comfyPromptId: promptId });

      debugService.success('renderQueue', `✅ Job ${job.id} queued in ComfyUI`, {
        promptId,
        endpoint
      });

      // Connect WebSocket for progress
      this.connectWebSocket(endpoint, node.id, job.id, promptId);

    } catch (error: any) {
      debugService.error('renderQueue', `❌ Failed to start job ${job.id}`, { error: error.message });

      // Handle failure
      this.handleJobFailure(job, node, error.message);
    }
  }

  /**
   * Get the workflow assignment for a job based on its type
   */
  private getWorkflowAssignment(job: RenderJob): ComfyUINodeAssignment | null {
    const store = useStore.getState();
    const comfySettings = store.settings.comfyUISettings;

    // Determine the step ID based on job type and workflow
    let stepId: string;
    if (job.type === 'holocine_scene' || job.settings.workflow === 'holocine') {
      stepId = 'holocine_render';
    } else if (job.settings.workflow === 'hunyuan15') {
      stepId = 'hunyuan_render';
    } else {
      stepId = 'wan_render';
    }

    // Try to find configured node assignment
    if (comfySettings?.nodeAssignments) {
      const assignment = comfySettings.nodeAssignments.find(
        a => a.stepId === stepId && a.enabled && a.nodeId && a.workflowId
      );
      if (assignment) return assignment;
    }

    // If no configured assignment, create a default one based on job.settings.workflow
    // This ensures we use the correct workflow builder even without explicit node assignment
    const workflowId = this.getWorkflowIdFromSettings(job.settings.workflow);
    if (workflowId) {
      return {
        stepId,
        nodeId: '', // Will use first available node
        workflowId,
        enabled: true,
        modelOverrides: {}
      };
    }

    return null;
  }

  /**
   * Map job workflow setting to ComfyUI workflow ID
   */
  private getWorkflowIdFromSettings(workflow: string | undefined): string | null {
    switch (workflow) {
      case 'holocine':
        return 'holocine_native';
      case 'wan22':
        return 'wan22_14b_t2v';
      case 'hunyuan15':
        return 'hunyuan15_t2v';
      default:
        return null;
    }
  }

  /**
   * Build ComfyUI workflow payload from a render job
   */
  private buildWorkflowForJob(job: RenderJob, assignment?: ComfyUINodeAssignment | null): Record<string, any> {
    // If we have a workflow assignment, use the new workflow builder
    if (assignment?.workflowId) {
      try {
        const result = buildWorkflowForRenderJob(
          job,
          assignment.workflowId,
          assignment.modelOverrides
        );

        debugService.info('renderQueue', `Built ${result.workflowType} workflow`, {
          workflowId: assignment.workflowId,
          estimatedVRAM: `${result.estimatedVRAM}GB`,
          warnings: result.warnings
        });

        return result.workflow;
      } catch (error: any) {
        debugService.warn('renderQueue', `Failed to build workflow, using fallback: ${error.message}`);
        // Fall through to legacy format
      }
    }

    // Fallback: Legacy format (simple structure)
    // This may not work with all ComfyUI setups but provides backward compatibility
    debugService.warn('renderQueue', 'Using legacy workflow format (no assignment configured)');

    if (job.type === 'holocine_scene') {
      // Build HoloCine multi-shot workflow
      return {
        prompt: {
          global_caption: job.positivePrompt.split('[per shot caption]')[0].replace('[global caption]', '').trim(),
          shot_captions: this.extractShotCaptions(job.positivePrompt),
          raw_prompt: job.positivePrompt,
          negative_prompt: job.negativePrompt,
          num_frames: job.settings.numFrames,
          resolution: job.settings.resolution,
          fps: job.settings.fps
        },
        metadata: {
          job_id: job.id,
          story_id: job.storyId,
          type: job.type,
          title: job.title
        }
      };
    } else {
      // Single shot workflow
      return {
        prompt: {
          positive: job.positivePrompt,
          negative: job.negativePrompt,
          num_frames: job.settings.numFrames,
          resolution: job.settings.resolution,
          fps: job.settings.fps,
          steps: job.settings.steps || 30,
          cfg: job.settings.cfg || 7.5
        },
        metadata: {
          job_id: job.id,
          story_id: job.storyId,
          type: job.type,
          title: job.title
        }
      };
    }
  }

  /**
   * Extract shot captions from HoloCine prompt format
   */
  private extractShotCaptions(prompt: string): string[] {
    const captions: string[] = [];
    const lines = prompt.split('\n');

    for (const line of lines) {
      if (line.includes('[per shot caption]')) {
        captions.push(line.replace('[per shot caption]', '').trim());
      } else if (line.includes('[shot cut]')) {
        captions.push(line.replace('[shot cut]', '').trim());
      }
    }

    return captions;
  }

  /**
   * Connect WebSocket for real-time progress updates
   * Note: WebSocket connections must go DIRECTLY to ComfyUI, not through agent proxy
   */
  private connectWebSocket(endpoint: string, nodeId: string, jobId: string, promptId: string): void {
    // Get the DIRECT ComfyUI endpoint for WebSocket (agent doesn't proxy WebSocket)
    const directEndpoint = nodeDiscoveryService.getNodeEndpoint(nodeId, 'comfyui', false);
    if (!directEndpoint) {
      debugService.warn('renderQueue', `Could not get direct ComfyUI endpoint for WebSocket, using polling fallback`);
      return;
    }

    const wsUrl = directEndpoint.replace('http://', 'ws://').replace('https://', 'wss://');
    const clientId = `render_queue_${Date.now()}`;

    debugService.info('renderQueue', `🔌 Connecting WebSocket to ${wsUrl}/ws (direct to ComfyUI, not via agent proxy)`);

    const ws = new WebSocket(`${wsUrl}/ws?clientId=${clientId}`);

    ws.onopen = () => {
      debugService.info('renderQueue', `WS connected for job ${jobId}`);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleWebSocketMessage(data, nodeId, jobId, promptId);
      } catch {
        // Ignore non-JSON messages
      }
    };

    ws.onerror = (error) => {
      debugService.warn('renderQueue', `WS error for job ${jobId}`);
    };

    ws.onclose = () => {
      this.wsConnections.delete(nodeId);
      const status = this.nodeStatus.get(nodeId);
      if (status) {
        status.wsConnection = null;
      }
    };

    this.wsConnections.set(nodeId, ws);
    const status = this.nodeStatus.get(nodeId);
    if (status) {
      status.wsConnection = ws;
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleWebSocketMessage(
    data: any,
    nodeId: string,
    jobId: string,
    promptId: string
  ): void {
    const store = useStore.getState();

    // Log ALL WebSocket messages for debugging (at debug level to avoid spam)
    debugService.info('renderQueue', `WS message for job ${jobId}`, {
      type: data.type,
      dataPromptId: data.data?.prompt_id,
      ourPromptId: promptId,
      matches: data.data?.prompt_id === promptId,
      node: data.data?.node
    });

    // Progress update
    if (data.type === 'progress' && data.data?.prompt_id === promptId) {
      const progress = (data.data.value / data.data.max) * 100;
      store.updateRenderJob(jobId, { progress });
      debugService.info('renderQueue', `Job ${jobId}: ${progress.toFixed(1)}%`);
    }

    // ComfyUI signals completion with 'executing' type where node is null
    // This is the official way to detect when a prompt has finished
    if (data.type === 'executing' && data.data?.prompt_id === promptId && data.data?.node === null) {
      debugService.success('renderQueue', `🎉 Job ${jobId}: Execution finished, fetching output...`);
      this.fetchOutputAndComplete(jobId, nodeId, promptId);
    }

    // Also handle 'executed' for individual node completions (some workflows emit this)
    if (data.type === 'executed' && data.data?.prompt_id === promptId) {
      // Store output data for later - the final 'executing' with null node will trigger completion
      debugService.info('renderQueue', `Job ${jobId}: Node executed`, {
        nodeId: data.data.node,
        hasOutput: !!data.data.output
      });
    }

    // Execution error
    if (data.type === 'execution_error' && data.data?.prompt_id === promptId) {
      const error = data.data.exception_message || 'Unknown execution error';
      debugService.error('renderQueue', `Job ${jobId}: Execution error`, { error });
      const job = store.renderQueue.find(j => j.id === jobId);
      if (job) {
        const node = nodeDiscoveryService.getNodes().find(n => n.id === nodeId);
        this.handleJobFailure(job, node!, error);
      }
    }
  }

  /**
   * Fetch output from ComfyUI history endpoint and complete the job
   */
  private async fetchOutputAndComplete(jobId: string, nodeId: string, promptId: string): Promise<void> {
    const endpoint = nodeDiscoveryService.getNodeEndpoint(nodeId, 'comfyui');

    if (!endpoint) {
      debugService.error('renderQueue', `No endpoint for node ${nodeId} to fetch output`);
      this.handleJobComplete(jobId, nodeId, {});
      return;
    }

    debugService.info('renderQueue', `📥 Fetching output for job ${jobId}`, {
      endpoint,
      promptId,
      historyUrl: `${endpoint}/history/${promptId}`
    });

    try {
      // Fetch the history for this prompt to get output files
      const response = await fetch(`${endpoint}/history/${promptId}`);

      if (!response.ok) {
        debugService.warn('renderQueue', `Failed to fetch history for prompt ${promptId}`);
        this.handleJobComplete(jobId, nodeId, {});
        return;
      }

      const history = await response.json();
      const promptHistory = history[promptId];

      if (!promptHistory) {
        debugService.warn('renderQueue', `No history found for prompt ${promptId}`);
        this.handleJobComplete(jobId, nodeId, {});
        return;
      }

      // Extract outputs from all nodes
      const outputs = promptHistory.outputs || {};
      let outputData: any = {};

      // Find video or image outputs from any node
      for (const [nodeIdKey, nodeOutput] of Object.entries(outputs) as [string, any][]) {
        if (nodeOutput.videos?.length) {
          outputData = { output: { videos: nodeOutput.videos } };
          debugService.info('renderQueue', `Found video output from node ${nodeIdKey}`, {
            filename: nodeOutput.videos[0].filename
          });
          break;
        }
        if (nodeOutput.images?.length) {
          outputData = { output: { images: nodeOutput.images } };
          debugService.info('renderQueue', `Found image output from node ${nodeIdKey}`, {
            filename: nodeOutput.images[0].filename
          });
          break;
        }
        if (nodeOutput.gifs?.length) {
          outputData = { output: { videos: nodeOutput.gifs } };
          debugService.info('renderQueue', `Found GIF output from node ${nodeIdKey}`, {
            filename: nodeOutput.gifs[0].filename
          });
          break;
        }
      }

      this.handleJobComplete(jobId, nodeId, outputData);
    } catch (error: any) {
      debugService.error('renderQueue', `Error fetching output for job ${jobId}`, { error: error.message });
      this.handleJobComplete(jobId, nodeId, {});
    }
  }

  /**
   * Check status of rendering jobs via ComfyUI history API
   * This is a fallback for when WebSocket connections are lost (e.g., page refresh)
   */
  private async checkRenderingJobsStatus(): Promise<void> {
    const store = useStore.getState();
    const renderingJobs = store.renderQueue.filter(
      j => (j.status === 'rendering' || j.status === 'assigned') && j.comfyPromptId
    );

    if (renderingJobs.length === 0) return;

    debugService.info('renderQueue', `🔍 Status polling: checking ${renderingJobs.length} rendering job(s)`);

    for (const job of renderingJobs) {
      if (!job.comfyPromptId) continue;

      // Use the job's assigned node endpoint, or fall back to first available
      let endpoint: string | null = null;
      if (job.assignedNode) {
        endpoint = nodeDiscoveryService.getNodeEndpoint(job.assignedNode, 'comfyui');
      }
      if (!endpoint) {
        const comfyNodes = nodeDiscoveryService.getComfyUICapableNodes();
        if (comfyNodes.length > 0) {
          endpoint = nodeDiscoveryService.getNodeEndpoint(comfyNodes[0].id, 'comfyui');
        }
      }
      if (!endpoint) {
        debugService.warn('renderQueue', `No endpoint available to check job ${job.id}`);
        continue;
      }

      try {
        const response = await fetch(`${endpoint}/history/${job.comfyPromptId}`);
        if (!response.ok) continue;

        const history = await response.json();
        const promptHistory = history[job.comfyPromptId];

        if (!promptHistory) continue;

        // Check if execution completed (has outputs or status indicates completion)
        const outputs = promptHistory.outputs || {};
        const hasOutputs = Object.keys(outputs).length > 0;
        const statusMsgs = promptHistory.status?.messages || [];
        const isComplete = hasOutputs || statusMsgs.some((m: any) => m[0] === 'execution_success');
        const hasError = statusMsgs.some((m: any) => m[0] === 'execution_error');

        if (hasError) {
          const errorMsg = statusMsgs.find((m: any) => m[0] === 'execution_error');
          const errorText = errorMsg?.[1]?.exception_message || 'Execution failed';
          debugService.warn('renderQueue', `Job ${job.id} failed (detected via polling)`, { error: errorText });

          store.updateRenderJob(job.id, {
            status: 'failed',
            error: errorText,
            completedAt: new Date()
          });

          // Release the node
          if (job.assignedNode) {
            this.releaseNode(job.assignedNode);
          }
          continue;
        }

        if (isComplete) {
          debugService.info('renderQueue', `Job ${job.id} completed (detected via polling)`);

          // Extract output data
          let outputData: any = {};
          for (const [, nodeOutput] of Object.entries(outputs) as [string, any][]) {
            if (nodeOutput.videos?.length) {
              outputData = { output: { videos: nodeOutput.videos } };
              break;
            }
            if (nodeOutput.images?.length) {
              outputData = { output: { images: nodeOutput.images } };
              break;
            }
            if (nodeOutput.gifs?.length) {
              outputData = { output: { videos: nodeOutput.gifs } };
              break;
            }
          }

          // Build output URL (include subfolder if present)
          let outputUrl: string | undefined;
          if (outputData.output?.videos?.[0]) {
            const video = outputData.output.videos[0];
            const subfolder = video.subfolder ? `&subfolder=${encodeURIComponent(video.subfolder)}` : '';
            outputUrl = `${endpoint}/view?filename=${encodeURIComponent(video.filename)}&type=output${subfolder}`;
          } else if (outputData.output?.images?.[0]) {
            const image = outputData.output.images[0];
            const subfolder = image.subfolder ? `&subfolder=${encodeURIComponent(image.subfolder)}` : '';
            outputUrl = `${endpoint}/view?filename=${encodeURIComponent(image.filename)}&type=output${subfolder}`;
          }

          store.updateRenderJob(job.id, {
            status: 'completed',
            progress: 100,
            completedAt: new Date(),
            outputUrl
          });

          debugService.success('renderQueue', `✅ Job ${job.id} completed via polling!`, { outputUrl });

          // Release the node
          if (job.assignedNode) {
            this.releaseNode(job.assignedNode);
          }
        }
      } catch (error) {
        // Ignore errors - the WebSocket might handle it
      }
    }
  }

  /**
   * Handle successful job completion
   */
  private handleJobComplete(jobId: string, nodeId: string, data: any): void {
    const store = useStore.getState();

    // Extract output URL if available
    // ComfyUI output objects have: filename, subfolder (optional), type
    let outputUrl: string | undefined;
    if (data.output?.videos?.[0]) {
      const endpoint = nodeDiscoveryService.getNodeEndpoint(nodeId, 'comfyui');
      const video = data.output.videos[0];
      const subfolder = video.subfolder ? `&subfolder=${encodeURIComponent(video.subfolder)}` : '';
      outputUrl = `${endpoint}/view?filename=${encodeURIComponent(video.filename)}&type=output${subfolder}`;
    } else if (data.output?.images?.[0]) {
      const endpoint = nodeDiscoveryService.getNodeEndpoint(nodeId, 'comfyui');
      const image = data.output.images[0];
      const subfolder = image.subfolder ? `&subfolder=${encodeURIComponent(image.subfolder)}` : '';
      outputUrl = `${endpoint}/view?filename=${encodeURIComponent(image.filename)}&type=output${subfolder}`;
    }

    store.updateRenderJob(jobId, {
      status: 'completed',
      progress: 100,
      completedAt: new Date(),
      outputUrl
    });

    debugService.success('renderQueue', `✅ Job ${jobId} completed!`, { outputUrl });

    // Release node
    this.releaseNode(nodeId);
  }

  /**
   * Handle job failure
   */
  private handleJobFailure(job: RenderJob, node: OllamaNode, error: string): void {
    const store = useStore.getState();

    // Check if we should retry
    if (job.attempts < job.maxAttempts) {
      debugService.warn('renderQueue', `Job ${job.id} failed, will retry (${job.attempts}/${job.maxAttempts})`);

      // Reset to queued status for retry
      store.updateRenderJob(job.id, {
        status: 'queued',
        assignedNode: undefined,
        progress: 0,
        error: `Attempt ${job.attempts} failed: ${error}`
      });
    } else {
      // Max retries reached
      debugService.error('renderQueue', `Job ${job.id} failed after ${job.maxAttempts} attempts`);

      store.updateRenderJob(job.id, {
        status: 'failed',
        error: error,
        completedAt: new Date()
      });
    }

    // Release node
    this.releaseNode(node.id);
  }

  /**
   * Release a node (mark as available)
   */
  private releaseNode(nodeId: string): void {
    // Clear node status
    const status = this.nodeStatus.get(nodeId);
    if (status) {
      if (status.wsConnection) {
        status.wsConnection.close();
      }
      status.currentJobId = null;
      status.wsConnection = null;
    }

    // Mark node as available
    nodeDiscoveryService.markNodeAvailable(nodeId, 'comfyui');

    debugService.info('renderQueue', `Node ${nodeId} released and available`);
  }

  /**
   * Sync node status - cleans up stale busy states
   * This runs periodically to ensure local tracking matches actual state
   */
  private syncNodeStatus(): void {
    const store = useStore.getState();
    const activeJobIds = new Set(
      store.renderQueue
        .filter(j => j.status === 'rendering' || j.status === 'assigned')
        .map(j => j.id)
    );

    let cleanedCount = 0;

    // Check each tracked node
    this.nodeStatus.forEach((status, nodeId) => {
      if (status.currentJobId) {
        // If the job is no longer active, release the node
        if (!activeJobIds.has(status.currentJobId)) {
          debugService.warn('renderQueue', `🧹 Cleaning stale node status for ${nodeId} (job ${status.currentJobId} no longer active)`);
          this.releaseNode(nodeId);
          cleanedCount++;
        }
      }
    });

    // Also check for nodes that nodeDiscoveryService thinks are busy for comfyui
    // but we have no tracking for - these might be stale from a previous session
    const comfyNodes = nodeDiscoveryService.getComfyUICapableNodes();
    for (const node of comfyNodes) {
      const localStatus = this.nodeStatus.get(node.id);
      const hasActiveLocalJob = localStatus?.currentJobId && activeJobIds.has(localStatus.currentJobId);

      // If nodeDiscoveryService says busy but we have no active job, mark available
      if (node.comfyuiStatus === 'busy' && !hasActiveLocalJob) {
        debugService.warn('renderQueue', `🧹 Clearing stale comfyui busy status for ${node.name} (no active render job)`);
        nodeDiscoveryService.markNodeAvailable(node.id, 'comfyui');
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      debugService.info('renderQueue', `🧹 Sync complete: cleaned ${cleanedCount} stale status(es)`);
    }
  }

  /**
   * Force sync node status (can be called externally)
   */
  forceSync(): void {
    debugService.info('renderQueue', '🔄 Force sync requested');
    this.syncNodeStatus();
  }

  /**
   * Get status of all render nodes
   * Checks both local render job tracking AND nodeDiscoveryService status
   */
  getNodeStatuses(): { nodeId: string; nodeName: string; busy: boolean; currentJob: string | null; busyReason?: string }[] {
    const nodes = nodeDiscoveryService.getComfyUICapableNodes();

    return nodes.map(node => {
      const status = this.nodeStatus.get(node.id);
      const hasRenderJob = status?.currentJobId !== null && status?.currentJobId !== undefined;

      // Check if node is available for ComfyUI work (considers both comfyui AND ollama busy status)
      const isAvailableForComfyUI = nodeDiscoveryService.isNodeAvailableFor(node.id, 'comfyui');

      // Determine busy reason for better UI feedback
      let busyReason: string | undefined;
      if (hasRenderJob) {
        busyReason = 'Rendering';
      } else if (!isAvailableForComfyUI) {
        // Check what's making it unavailable
        if (node.comfyuiStatus === 'busy') {
          busyReason = 'ComfyUI busy';
        } else if (node.ollamaStatus === 'busy') {
          busyReason = 'Ollama busy';
        } else if (node.status === 'offline') {
          busyReason = 'Offline';
        } else {
          busyReason = 'Unavailable';
        }
      }

      return {
        nodeId: node.id,
        nodeName: node.name,
        busy: hasRenderJob || !isAvailableForComfyUI,
        currentJob: status?.currentJobId || null,
        busyReason
      };
    });
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): {
    queued: number;
    rendering: number;
    completed: number;
    failed: number;
    total: number;
  } {
    const store = useStore.getState();
    const jobs = store.renderQueue;

    return {
      queued: jobs.filter(j => j.status === 'queued' || j.status === 'assigned').length,
      rendering: jobs.filter(j => j.status === 'rendering').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      total: jobs.length
    };
  }

  /**
   * Create render jobs from a story's HoloCine scenes
   */
  createJobsFromScenes(
    storyId: string,
    scenes: HoloCineScene[],
    config: StoryConfig
  ): void {
    const store = useStore.getState();

    const jobs = scenes.map((scene, index) => {
      const rawPrompt = buildRawPromptString(scene.globalCaption, scene.shotCaptions);

      return {
        storyId,
        type: 'holocine_scene' as const,
        targetId: scene.id,
        targetNumber: scene.sceneNumber,
        title: `Scene ${scene.sceneNumber}: ${scene.title}`,
        positivePrompt: rawPrompt,
        negativePrompt: 'blurry, low quality, distorted, deformed, bad anatomy, watermark',
        settings: {
          workflow: 'holocine' as const,
          numFrames: scene.numFrames,
          fps: scene.fps || parseInt(config.fps) || 16,
          resolution: scene.resolution,
          steps: 30,
          cfg: 7.5
        },
        status: 'queued' as const,
        progress: 0,
        maxAttempts: 3,
        priority: index  // Lower index = higher priority
      };
    });

    store.addRenderJobs(jobs);
    debugService.info('renderQueue', `Added ${jobs.length} scene render jobs for story ${storyId}`);
  }

  /**
   * Get workflow settings based on generation method and config
   */
  private getWorkflowSettings(config: StoryConfig): {
    workflowType: 'wan22' | 'hunyuan15' | 'holocine';
    numFrames: number;
    fps: number;
    cfg: number;
    resolution: string;
  } {
    const generationMethod = config.generationMethod || 'wan22';
    let workflowType: 'wan22' | 'hunyuan15' | 'holocine' = 'wan22';
    let numFrames = 81;
    let fps = parseInt(config.fps) || 16;
    let cfg = 7.5;

    if (generationMethod === 'hunyuan15') {
      workflowType = 'hunyuan15';
      numFrames = 129;
      fps = 24;
      cfg = 6.0;
    } else if (generationMethod === 'holocine') {
      workflowType = 'holocine';
      numFrames = 81;
      fps = 16;
    }

    // Get resolution based on aspect ratio and workflow
    let resolution: string;
    if (workflowType === 'hunyuan15') {
      resolution = config.aspectRatio === '9:16' ? '720x1280' : '1280x720';
    } else {
      resolution = config.aspectRatio === '9:16' ? '480x832' : '832x480';
    }

    return { workflowType, numFrames, fps, cfg, resolution };
  }

  /**
   * Create a single render job from a shot (called immediately when prompt completes)
   */
  createJobFromShot(
    storyId: string,
    shot: { id: string; shotNumber: number; title?: string; visualPrompt?: string; comfyUIPositivePrompt?: string; comfyUINegativePrompt?: string; duration?: number },
    config: StoryConfig
  ): void {
    const store = useStore.getState();

    // Check if this shot already has a render job
    const existingJob = store.renderQueue.find(
      j => j.storyId === storyId && j.targetId === shot.id
    );

    if (existingJob) {
      debugService.info('renderQueue', `Shot ${shot.shotNumber} already in render queue, skipping`);
      return;
    }

    // Skip if no prompt
    if (!shot.comfyUIPositivePrompt && !shot.visualPrompt) {
      debugService.warn('renderQueue', `Shot ${shot.shotNumber} has no prompt, skipping`);
      return;
    }

    const settings = this.getWorkflowSettings(config);

    // Calculate frame count based on shot duration if available
    // Use shot duration or fallback to workflow default
    const shotDuration = shot.duration || 3; // Default 3 seconds if not specified
    const calculatedFrames = Math.round(shotDuration * settings.fps);
    // Clamp to reasonable limits based on workflow
    const minFrames = 24;
    const maxFrames = settings.workflowType === 'hunyuan15' ? 300 : 240;
    const numFrames = Math.max(minFrames, Math.min(maxFrames, calculatedFrames));

    const job = {
      storyId,
      type: 'shot' as const,
      targetId: shot.id,
      targetNumber: shot.shotNumber,
      title: `Shot ${shot.shotNumber}: ${shot.title || 'Untitled'}`,
      positivePrompt: shot.comfyUIPositivePrompt || shot.visualPrompt || '',
      negativePrompt: shot.comfyUINegativePrompt || 'blurry, low quality, distorted, deformed, bad anatomy, watermark',
      settings: {
        workflow: settings.workflowType,
        numFrames: numFrames,
        fps: settings.fps,
        resolution: settings.resolution,
        steps: 30,
        cfg: settings.cfg
      },
      status: 'queued' as const,
      progress: 0,
      maxAttempts: 3,
      priority: shot.shotNumber  // Priority by shot order
    };

    store.addRenderJob(job);
    debugService.info('renderQueue', `Added shot ${shot.shotNumber} to render queue (${settings.workflowType}, ${numFrames} frames for ${shotDuration}s)`);
  }

  /**
   * Create render jobs from a story's shots (for shot-based pipelines)
   * Note: This is now mainly used as a fallback. Shots are typically added individually
   * via createJobFromShot as prompts complete.
   */
  createJobsFromShots(
    storyId: string,
    shots: { id: string; shotNumber: number; title: string; visualPrompt?: string; comfyUIPositivePrompt?: string; comfyUINegativePrompt?: string; duration?: number }[],
    config: StoryConfig
  ): void {
    const store = useStore.getState();
    const settings = this.getWorkflowSettings(config);

    // Filter out shots that already have render jobs
    const existingJobTargetIds = new Set(
      store.renderQueue.filter(j => j.storyId === storyId).map(j => j.targetId)
    );

    const newShots = shots.filter(shot =>
      (shot.comfyUIPositivePrompt || shot.visualPrompt) &&
      !existingJobTargetIds.has(shot.id)
    );

    if (newShots.length === 0) {
      debugService.info('renderQueue', `All shots already in render queue for story ${storyId}`);
      return;
    }

    const jobs = newShots.map((shot, index) => {
      // Calculate frame count based on shot duration
      const shotDuration = shot.duration || 3;
      const calculatedFrames = Math.round(shotDuration * settings.fps);
      const minFrames = 24;
      const maxFrames = settings.workflowType === 'hunyuan15' ? 300 : 240;
      const numFrames = Math.max(minFrames, Math.min(maxFrames, calculatedFrames));

      return {
        storyId,
        type: 'shot' as const,
        targetId: shot.id,
        targetNumber: shot.shotNumber,
        title: `Shot ${shot.shotNumber}: ${shot.title || 'Untitled'}`,
        positivePrompt: shot.comfyUIPositivePrompt || shot.visualPrompt || '',
        negativePrompt: shot.comfyUINegativePrompt || 'blurry, low quality, distorted, deformed, bad anatomy, watermark',
        settings: {
          workflow: settings.workflowType,
          numFrames: numFrames,
          fps: settings.fps,
          resolution: settings.resolution,
          steps: 30,
          cfg: settings.cfg
        },
        status: 'queued' as const,
        progress: 0,
        maxAttempts: 3,
        priority: index
      };
    });

    store.addRenderJobs(jobs);
    debugService.info('renderQueue', `Added ${jobs.length} ${settings.workflowType} shot render jobs for story ${storyId}`);
  }

  /**
   * Manually trigger processing of a specific job
   */
  async processJobManually(jobId: string): Promise<void> {
    const store = useStore.getState();
    const job = store.renderQueue.find(j => j.id === jobId);

    if (!job) {
      throw new Error('Job not found');
    }

    if (job.status !== 'queued' && job.status !== 'failed') {
      throw new Error(`Job is not in a state that can be processed (status: ${job.status})`);
    }

    // Reset failed job
    if (job.status === 'failed') {
      store.updateRenderJob(jobId, { status: 'queued', error: undefined, attempts: 0 });
    }

    // Find available node
    const node = this.findAvailableRenderNode();
    if (!node) {
      throw new Error('No available render nodes');
    }

    // Process
    await this.assignJobToNode(job, node);
  }
}

// Export singleton instance
export const renderQueueManager = new RenderQueueManager();
export default renderQueueManager;
