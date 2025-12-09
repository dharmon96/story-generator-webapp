/**
 * ComfyUI Render Service
 *
 * Handles sending HoloCine scenes and shots to ComfyUI for video/image rendering.
 * Integrates with the ComfyUI API to queue generations and track progress.
 */

import { HoloCineScene, HoloCineGenerationSettings, buildRawPromptString } from '../types/holocineTypes';
import { debugService } from './debugService';
import { nodeDiscoveryService, OllamaNode } from './nodeDiscovery';
import { useStore } from '../store/useStore';

export interface ComfyUIQueueItem {
  id: string;
  sceneId: string;
  sceneNumber: number;
  title: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  promptId?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  outputUrl?: string;
}

export interface ComfyUIWorkflowPayload {
  client_id: string;
  prompt: Record<string, any>;
}

/**
 * Build a HoloCine workflow for ComfyUI
 * This creates a workflow compatible with kijai/ComfyUI-WanVideoWrapper HoloCine nodes
 * Note: This is a template for a more complete workflow - currently using simpler workflow
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildHoloCineWorkflow(
  scene: HoloCineScene,
  settings: HoloCineGenerationSettings,
  negativePrompt: string
): Record<string, any> {
  // Build the raw prompt string in HoloCine format
  const rawPrompt = buildRawPromptString(scene.globalCaption, scene.shotCaptions);

  // Calculate shot transitions based on shot count if not provided
  const numShots = scene.shotCaptions.length;
  const framesPerShot = Math.floor(scene.numFrames / numShots);
  const autoShotCuts = Array.from(
    { length: numShots - 1 },
    (_, i) => framesPerShot * (i + 1)
  );
  const finalShotCuts = scene.shotCutFrames || autoShotCuts;

  // This workflow is designed for the HoloCine nodes in ComfyUI-WanVideoWrapper
  // Node types: HoloCineLoader, WanVideoSampler, etc.
  const workflow: Record<string, any> = {
    // Checkpoint loader
    "1": {
      "class_type": "CheckpointLoaderSimple",
      "inputs": {
        "ckpt_name": "wan2.2_holocine.safetensors"
      }
    },
    // CLIP Text Encode - Positive (HoloCine format)
    "2": {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "text": rawPrompt,
        "clip": ["1", 1]
      }
    },
    // CLIP Text Encode - Negative
    "3": {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "text": negativePrompt,
        "clip": ["1", 1]
      }
    },
    // Empty Latent Video (for dimensions)
    "4": {
      "class_type": "EmptyLatentVideo",
      "inputs": {
        "width": parseInt(settings.resolution.split('x')[0]),
        "height": parseInt(settings.resolution.split('x')[1]),
        "num_frames": scene.numFrames,
        "batch_size": 1
      }
    },
    // HoloCine Scene Config
    "5": {
      "class_type": "HoloCineSceneConfig",
      "inputs": {
        "num_shots": numShots,
        "shot_cut_frames": finalShotCuts.join(','),
        "attention_mode": settings.attention
      }
    },
    // KSampler for video generation
    "6": {
      "class_type": "KSampler",
      "inputs": {
        "model": ["1", 0],
        "positive": ["2", 0],
        "negative": ["3", 0],
        "latent_image": ["4", 0],
        "seed": Math.floor(Math.random() * 1000000),
        "steps": 30,
        "cfg": 7.5,
        "sampler_name": "euler_ancestral",
        "scheduler": "normal",
        "denoise": 1.0
      }
    },
    // VAE Decode
    "7": {
      "class_type": "VAEDecode",
      "inputs": {
        "samples": ["6", 0],
        "vae": ["1", 2]
      }
    },
    // Save Video
    "8": {
      "class_type": "SaveVideo",
      "inputs": {
        "images": ["7", 0],
        "filename_prefix": `holocine_scene_${scene.sceneNumber}`,
        "fps": scene.fps
      }
    }
  };

  return workflow;
}

/**
 * Build a simpler text-to-video workflow for HoloCine
 * Uses the WanVideoWrapper nodes directly
 */
function buildSimpleHoloCineWorkflow(
  scene: HoloCineScene,
  settings: HoloCineGenerationSettings,
  negativePrompt: string
): Record<string, any> {
  const rawPrompt = buildRawPromptString(scene.globalCaption, scene.shotCaptions);

  // Simpler workflow compatible with more ComfyUI setups
  return {
    "prompt": {
      "global_caption": scene.globalCaption,
      "shot_captions": scene.shotCaptions,
      "shot_cut_frames": scene.shotCutFrames || [],
      "num_frames": scene.numFrames,
      "resolution": settings.resolution,
      "negative_prompt": negativePrompt,
      "raw_prompt": rawPrompt
    },
    "scene_metadata": {
      "scene_id": scene.id,
      "scene_number": scene.sceneNumber,
      "title": scene.title,
      "characters": scene.characters.map(c => ({
        ref: c.holoCineRef,
        name: c.name,
        description: c.description
      })),
      "location": scene.primaryLocation,
      "duration": scene.estimatedDuration
    }
  };
}

class ComfyUIRenderService {
  private clientId: string;
  private queueItems: Map<string, ComfyUIQueueItem> = new Map();
  private wsConnections: Map<string, WebSocket> = new Map();

  constructor() {
    this.clientId = `story-generator-${Date.now()}`;
  }

  /**
   * Get all available ComfyUI nodes
   */
  getAvailableNodes(): OllamaNode[] {
    return nodeDiscoveryService.getComfyUINodes().filter(n => n.status === 'online');
  }

  /**
   * Check if ComfyUI is available for rendering
   */
  isAvailable(): boolean {
    return this.getAvailableNodes().length > 0;
  }

  /**
   * Get the assigned node for a specific render step from settings
   */
  getAssignedNode(stepId: string): OllamaNode | null {
    try {
      const settings = useStore.getState().settings;
      const assignment = settings.comfyUISettings?.nodeAssignments?.find(a => a.stepId === stepId);
      if (!assignment || !assignment.nodeId) return null;

      const nodes = this.getAvailableNodes();
      return nodes.find(n => n.id === assignment.nodeId) || null;
    } catch {
      return null;
    }
  }

  /**
   * Get the first available ComfyUI endpoint, preferring assigned nodes
   */
  getEndpoint(stepId?: string): string | null {
    // First try to get assigned node for the step
    if (stepId) {
      const assignedNode = this.getAssignedNode(stepId);
      if (assignedNode) {
        return `http://${assignedNode.host}:${assignedNode.port}`;
      }
    }

    // Fall back to first available node
    const nodes = this.getAvailableNodes();
    if (nodes.length === 0) return null;
    return `http://${nodes[0].host}:${nodes[0].port}`;
  }

  /**
   * Get ComfyUI settings from store
   */
  getComfyUISettings() {
    try {
      return useStore.getState().settings.comfyUISettings || null;
    } catch {
      return null;
    }
  }

  /**
   * Queue a HoloCine scene for rendering
   */
  async queueScene(
    scene: HoloCineScene,
    settings: HoloCineGenerationSettings,
    negativePrompt?: string
  ): Promise<ComfyUIQueueItem> {
    // Use assigned HoloCine node or fall back to first available
    const endpoint = this.getEndpoint('holocine_render');
    if (!endpoint) {
      throw new Error('No ComfyUI instance available. Please configure ComfyUI in Settings.');
    }

    // Use negative prompt from settings if not provided
    const comfySettings = this.getComfyUISettings();
    const finalNegativePrompt = negativePrompt || comfySettings?.defaultNegativePrompt || 'blurry, low quality, distorted, deformed';

    const queueItem: ComfyUIQueueItem = {
      id: `render_${scene.id}_${Date.now()}`,
      sceneId: scene.id,
      sceneNumber: scene.sceneNumber,
      title: scene.title,
      status: 'queued',
      progress: 0
    };

    this.queueItems.set(queueItem.id, queueItem);

    try {
      // Build workflow payload
      const workflowPayload = buildSimpleHoloCineWorkflow(scene, settings, finalNegativePrompt);

      debugService.info('comfyui', `🎬 Queueing HoloCine scene ${scene.sceneNumber}: ${scene.title}`, {
        endpoint,
        numShots: scene.shotCaptions.length,
        numFrames: scene.numFrames,
        resolution: settings.resolution
      });

      // Send to ComfyUI queue endpoint
      const response = await fetch(`${endpoint}/prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: this.clientId,
          prompt: workflowPayload
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ComfyUI queue failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      queueItem.promptId = result.prompt_id;
      queueItem.status = 'running';
      queueItem.startedAt = new Date();

      debugService.success('comfyui', `✅ Scene ${scene.sceneNumber} queued successfully`, {
        promptId: result.prompt_id
      });

      // Connect to WebSocket for progress updates
      this.connectWebSocket(endpoint, queueItem);

      return queueItem;
    } catch (error: any) {
      queueItem.status = 'failed';
      queueItem.error = error.message;
      debugService.error('comfyui', `❌ Failed to queue scene ${scene.sceneNumber}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Queue multiple scenes for batch rendering
   */
  async queueScenes(
    scenes: HoloCineScene[],
    settings: HoloCineGenerationSettings,
    negativePrompt?: string
  ): Promise<ComfyUIQueueItem[]> {
    const results: ComfyUIQueueItem[] = [];

    for (const scene of scenes) {
      try {
        const item = await this.queueScene(scene, settings, negativePrompt);
        results.push(item);
        // Small delay between queuing to avoid overwhelming ComfyUI
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error: any) {
        debugService.error('comfyui', `Failed to queue scene ${scene.sceneNumber}`, { error: error.message });
        results.push({
          id: `failed_${scene.id}`,
          sceneId: scene.id,
          sceneNumber: scene.sceneNumber,
          title: scene.title,
          status: 'failed',
          progress: 0,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Connect to ComfyUI WebSocket for progress updates
   */
  private connectWebSocket(endpoint: string, queueItem: ComfyUIQueueItem) {
    const wsUrl = endpoint.replace('http://', 'ws://').replace('https://', 'wss://');
    const ws = new WebSocket(`${wsUrl}/ws?clientId=${this.clientId}`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'progress' && data.data?.prompt_id === queueItem.promptId) {
          queueItem.progress = (data.data.value / data.data.max) * 100;
          debugService.info('comfyui', `Scene ${queueItem.sceneNumber} progress: ${queueItem.progress.toFixed(1)}%`);
        }

        if (data.type === 'executed' && data.data?.prompt_id === queueItem.promptId) {
          queueItem.status = 'completed';
          queueItem.progress = 100;
          queueItem.completedAt = new Date();

          // Extract output URL if available
          if (data.data?.output?.videos?.[0]) {
            queueItem.outputUrl = `${endpoint}/view?filename=${data.data.output.videos[0].filename}&type=output`;
          }

          debugService.success('comfyui', `✅ Scene ${queueItem.sceneNumber} completed!`, {
            outputUrl: queueItem.outputUrl
          });

          ws.close();
        }

        if (data.type === 'execution_error' && data.data?.prompt_id === queueItem.promptId) {
          queueItem.status = 'failed';
          queueItem.error = data.data.exception_message || 'Unknown error during execution';
          debugService.error('comfyui', `❌ Scene ${queueItem.sceneNumber} failed`, { error: queueItem.error });
          ws.close();
        }
      } catch (error) {
        // Ignore parse errors from non-JSON messages
      }
    };

    ws.onerror = (error) => {
      debugService.warn('comfyui', `WebSocket error for scene ${queueItem.sceneNumber}`);
    };

    ws.onclose = () => {
      this.wsConnections.delete(queueItem.id);
    };

    this.wsConnections.set(queueItem.id, ws);
  }

  /**
   * Get status of a queued item
   */
  getQueueItem(id: string): ComfyUIQueueItem | undefined {
    return this.queueItems.get(id);
  }

  /**
   * Get all queued items
   */
  getAllQueueItems(): ComfyUIQueueItem[] {
    return Array.from(this.queueItems.values());
  }

  /**
   * Cancel a queued render
   */
  async cancelRender(id: string): Promise<boolean> {
    const item = this.queueItems.get(id);
    if (!item || !item.promptId) return false;

    const endpoint = this.getEndpoint();
    if (!endpoint) return false;

    try {
      const response = await fetch(`${endpoint}/interrupt`, {
        method: 'POST'
      });

      if (response.ok) {
        item.status = 'failed';
        item.error = 'Cancelled by user';

        // Close WebSocket if open
        const ws = this.wsConnections.get(id);
        if (ws) {
          ws.close();
        }

        return true;
      }
    } catch (error) {
      debugService.error('comfyui', 'Failed to cancel render', { id });
    }

    return false;
  }

  /**
   * Clear completed/failed items from queue
   */
  clearCompleted() {
    const toDelete: string[] = [];
    this.queueItems.forEach((item, id) => {
      if (item.status === 'completed' || item.status === 'failed') {
        toDelete.push(id);
      }
    });
    toDelete.forEach(id => this.queueItems.delete(id));
  }

  /**
   * Export scene data for manual ComfyUI import
   * Returns JSON that can be pasted into ComfyUI
   */
  exportForManualImport(
    scene: HoloCineScene,
    settings: HoloCineGenerationSettings,
    negativePrompt: string = 'blurry, low quality, distorted, deformed'
  ): string {
    const workflow = buildSimpleHoloCineWorkflow(scene, settings, negativePrompt);
    return JSON.stringify(workflow, null, 2);
  }

  /**
   * Get ComfyUI system status
   */
  async getSystemStatus(): Promise<{ queue_remaining: number; queue_running: number } | null> {
    const endpoint = this.getEndpoint();
    if (!endpoint) return null;

    try {
      const response = await fetch(`${endpoint}/queue`);
      if (response.ok) {
        const data = await response.json();
        return {
          queue_remaining: data.queue_remaining?.length || 0,
          queue_running: data.queue_running?.length || 0
        };
      }
    } catch (error) {
      debugService.warn('comfyui', 'Could not get system status');
    }

    return null;
  }
}

// Export singleton instance
export const comfyUIRenderService = new ComfyUIRenderService();
export default comfyUIRenderService;
