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

    // Do an immediate check
    this.processQueue();
  }

  /**
   * Stop the render queue processing
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
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
   */
  private async processQueue(): Promise<void> {
    const store = useStore.getState();

    // Check if auto-render is enabled
    if (!store.renderQueueEnabled) {
      return;
    }

    // Get next job
    const nextJob = store.getNextRenderJob();
    if (!nextJob) {
      return;  // No queued jobs
    }

    // Find an available ComfyUI node
    const availableNode = this.findAvailableRenderNode();
    if (!availableNode) {
      // All nodes busy
      return;
    }

    // Assign the job to the node
    await this.assignJobToNode(nextJob, availableNode);
  }

  /**
   * Find an available node with ComfyUI capability
   */
  private findAvailableRenderNode(): OllamaNode | null {
    // Get all nodes with ComfyUI capability
    const comfyNodes = nodeDiscoveryService.getComfyUICapableNodes();

    for (const node of comfyNodes) {
      // Check if node is busy with a render job
      const status = this.nodeStatus.get(node.id);
      if (!status || status.currentJobId === null) {
        // Node is available
        if (nodeDiscoveryService.isNodeAvailableFor(node.id, 'comfyui')) {
          return node;
        }
      }
    }

    return null;
  }

  /**
   * Assign a render job to a node and start rendering
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

    // Track node status
    this.nodeStatus.set(node.id, {
      nodeId: node.id,
      currentJobId: job.id,
      wsConnection: null,
      lastActivity: new Date()
    });

    // Mark node as busy
    nodeDiscoveryService.markNodeBusy(node.id, 'comfyui');

    try {
      // Get the endpoint for ComfyUI - prefer assigned node, fallback to discovered node
      let endpoint: string | null = null;

      if (assignment?.nodeId) {
        endpoint = nodeDiscoveryService.getNodeEndpoint(assignment.nodeId, 'comfyui');
      }

      if (!endpoint) {
        endpoint = nodeDiscoveryService.getNodeEndpoint(node.id, 'comfyui');
      }

      if (!endpoint) {
        throw new Error('Could not get ComfyUI endpoint for node');
      }

      // Build the workflow using the assignment settings
      const workflow = this.buildWorkflowForJob(job, assignment);

      // Update status to rendering
      store.updateRenderJob(job.id, { status: 'rendering' });

      debugService.info('renderQueue', `📤 Sending workflow to ${endpoint}/prompt`, {
        jobId: job.id,
        nodeCount: Object.keys(workflow).length
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
    if (!comfySettings?.nodeAssignments) return null;

    // Determine the step ID based on job type and workflow
    let stepId: string;
    if (job.type === 'holocine_scene') {
      stepId = 'holocine_render';
    } else if (job.settings.workflow === 'hunyuan15') {
      stepId = 'hunyuan_render';
    } else {
      stepId = 'wan_render';
    }

    // Find enabled assignment for this step
    const assignment = comfySettings.nodeAssignments.find(
      a => a.stepId === stepId && a.enabled && a.nodeId && a.workflowId
    );

    return assignment || null;
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
   */
  private connectWebSocket(endpoint: string, nodeId: string, jobId: string, promptId: string): void {
    const wsUrl = endpoint.replace('http://', 'ws://').replace('https://', 'wss://');
    const clientId = `render_queue_${Date.now()}`;

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

    // Progress update
    if (data.type === 'progress' && data.data?.prompt_id === promptId) {
      const progress = (data.data.value / data.data.max) * 100;
      store.updateRenderJob(jobId, { progress });
      debugService.info('renderQueue', `Job ${jobId}: ${progress.toFixed(1)}%`);
    }

    // Execution complete
    if (data.type === 'executed' && data.data?.prompt_id === promptId) {
      this.handleJobComplete(jobId, nodeId, data.data);
    }

    // Execution error
    if (data.type === 'execution_error' && data.data?.prompt_id === promptId) {
      const error = data.data.exception_message || 'Unknown execution error';
      const job = store.renderQueue.find(j => j.id === jobId);
      if (job) {
        const node = nodeDiscoveryService.getNodes().find(n => n.id === nodeId);
        this.handleJobFailure(job, node!, error);
      }
    }
  }

  /**
   * Handle successful job completion
   */
  private handleJobComplete(jobId: string, nodeId: string, data: any): void {
    const store = useStore.getState();

    // Extract output URL if available
    let outputUrl: string | undefined;
    if (data.output?.videos?.[0]) {
      const endpoint = nodeDiscoveryService.getNodeEndpoint(nodeId, 'comfyui');
      outputUrl = `${endpoint}/view?filename=${data.output.videos[0].filename}&type=output`;
    } else if (data.output?.images?.[0]) {
      const endpoint = nodeDiscoveryService.getNodeEndpoint(nodeId, 'comfyui');
      outputUrl = `${endpoint}/view?filename=${data.output.images[0].filename}&type=output`;
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
   * Get status of all render nodes
   */
  getNodeStatuses(): { nodeId: string; nodeName: string; busy: boolean; currentJob: string | null }[] {
    const nodes = nodeDiscoveryService.getComfyUICapableNodes();

    return nodes.map(node => {
      const status = this.nodeStatus.get(node.id);
      return {
        nodeId: node.id,
        nodeName: node.name,
        busy: status?.currentJobId !== null && status?.currentJobId !== undefined,
        currentJob: status?.currentJobId || null
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
