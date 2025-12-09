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

    debugService.info('renderQueue', `🎬 Assigning job ${job.id} to node ${node.name}`, {
      jobTitle: job.title,
      nodeId: node.id
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
      // Get the endpoint for ComfyUI
      const endpoint = nodeDiscoveryService.getNodeEndpoint(node.id, 'comfyui');
      if (!endpoint) {
        throw new Error('Could not get ComfyUI endpoint for node');
      }

      // Build and send the workflow
      const workflow = this.buildWorkflowForJob(job);

      // Update status to rendering
      store.updateRenderJob(job.id, { status: 'rendering' });

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

      debugService.success('renderQueue', `✅ Job ${job.id} queued in ComfyUI`, { promptId });

      // Connect WebSocket for progress
      this.connectWebSocket(endpoint, node.id, job.id, promptId);

    } catch (error: any) {
      debugService.error('renderQueue', `❌ Failed to start job ${job.id}`, { error: error.message });

      // Handle failure
      this.handleJobFailure(job, node, error.message);
    }
  }

  /**
   * Build ComfyUI workflow payload from a render job
   */
  private buildWorkflowForJob(job: RenderJob): Record<string, any> {
    // For now, return a simple structure compatible with WanVideoWrapper
    // This would be expanded based on the actual workflow requirements

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
   * Create render jobs from a story's shots (for shot-based pipelines)
   */
  createJobsFromShots(
    storyId: string,
    shots: { id: string; shotNumber: number; title: string; visualPrompt?: string; comfyUIPositivePrompt?: string }[],
    config: StoryConfig
  ): void {
    const store = useStore.getState();

    const jobs = shots
      .filter(shot => shot.comfyUIPositivePrompt || shot.visualPrompt)
      .map((shot, index) => ({
        storyId,
        type: 'shot' as const,
        targetId: shot.id,
        targetNumber: shot.shotNumber,
        title: `Shot ${shot.shotNumber}: ${shot.title || 'Untitled'}`,
        positivePrompt: shot.comfyUIPositivePrompt || shot.visualPrompt || '',
        negativePrompt: 'blurry, low quality, distorted, deformed, bad anatomy, watermark',
        settings: {
          workflow: 'wan22' as const,
          numFrames: 81,
          fps: parseInt(config.fps) || 16,
          resolution: config.aspectRatio === '9:16' ? '480x832' : '832x480',
          steps: 30,
          cfg: 7.5
        },
        status: 'queued' as const,
        progress: 0,
        maxAttempts: 3,
        priority: index
      }));

    store.addRenderJobs(jobs);
    debugService.info('renderQueue', `Added ${jobs.length} shot render jobs for story ${storyId}`);
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
