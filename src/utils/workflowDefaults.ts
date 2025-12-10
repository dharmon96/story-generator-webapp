/**
 * Workflow Defaults Utility
 *
 * Provides workflow-specific default settings based on the actual
 * ComfyUI workflow configurations from comfyui workflows/ folder.
 *
 * Supported Workflows:
 * 1. hunyuan15_t2v - Hunyuan Video 1.5 720p T2V
 * 2. wan22_14b_t2v - Wan 2.2 14B T2V (LightX2V)
 * 3. holocine_native - HoloCine Multi-Shot
 */

import { GenerationMethodId } from '../types/generationMethods';
import { WorkflowType } from '../types/shotlistTypes';

/**
 * Workflow-specific render settings
 */
export interface WorkflowRenderSettings {
  numFrames: number;
  fps: number;
  resolution: string;
  steps: number;
  cfg: number;
  workflowType: WorkflowType;
  defaultNegativePrompt: string;
}

/**
 * Get default render settings based on workflow/generation method
 */
export function getWorkflowDefaults(method: GenerationMethodId): WorkflowRenderSettings {
  switch (method) {
    case 'hunyuan15':
      // From video_hunyuan_video_1.5_720p_t2v_api.json
      return {
        numFrames: 121,    // ~5 seconds at 24fps
        fps: 24,
        resolution: '1280x720',
        steps: 20,
        cfg: 6,
        workflowType: 'shot',
        defaultNegativePrompt: '',  // Hunyuan typically doesn't need strong negatives
      };

    case 'wan22':
      // From video_wan2_2_14B_t2v_api.json
      return {
        numFrames: 81,     // ~5 seconds at 16fps
        fps: 16,
        resolution: '640x640',
        steps: 4,          // LightX2V uses only 4 steps (2+2)
        cfg: 1,            // LightX2V uses CFG 1
        workflowType: 'shot',
        // Chinese negative prompt from the workflow
        defaultNegativePrompt: '色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走，裸露，NSFW',
      };

    case 'holocine':
      // From 124201_Holocine_api.json
      return {
        numFrames: 77,     // ~4.8 seconds at 16fps
        fps: 16,
        resolution: '848x480',
        steps: 7,          // 3 high-noise + 4 low-noise
        cfg: 3.5,          // High-noise CFG (low uses 1)
        workflowType: 'scene',
        // Chinese negative prompt from the workflow
        defaultNegativePrompt: '色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走',
      };

    // Fallback defaults for unsupported/coming-soon methods
    case 'kling':
    case 'custom':
    default:
      return {
        numFrames: 81,
        fps: 16,
        resolution: '1280x720',
        steps: 30,
        cfg: 7.0,
        workflowType: 'shot',
        defaultNegativePrompt: 'blurry, low quality, distorted, deformed, bad anatomy, watermark, text, logo',
      };
  }
}

/**
 * Get available resolutions for a workflow
 */
export function getWorkflowResolutions(method: GenerationMethodId): string[] {
  switch (method) {
    case 'hunyuan15':
      return ['1280x720', '720x1280', '960x544', '544x960'];

    case 'wan22':
      return ['640x640', '832x480', '480x832', '1280x720', '720x1280'];

    case 'holocine':
      return ['848x480', '480x848', '832x832'];

    default:
      return ['1280x720', '720x1280', '832x480', '480x832', '640x640'];
  }
}

/**
 * Get available FPS options for a workflow
 */
export function getWorkflowFpsOptions(method: GenerationMethodId): number[] {
  switch (method) {
    case 'hunyuan15':
      return [24, 16, 30];

    case 'wan22':
    case 'holocine':
      return [16, 24];

    default:
      return [16, 24, 30];
  }
}

/**
 * Get recommended frame counts for a workflow
 */
export function getWorkflowFrameOptions(method: GenerationMethodId): number[] {
  switch (method) {
    case 'hunyuan15':
      return [61, 81, 97, 121, 145];  // ~2.5s, 3.4s, 4s, 5s, 6s at 24fps

    case 'wan22':
      return [41, 57, 81, 97];  // ~2.5s, 3.5s, 5s, 6s at 16fps

    case 'holocine':
      return [41, 57, 77, 97, 121];  // Various durations at 16fps

    default:
      return [41, 57, 81, 97, 121];
  }
}

/**
 * Calculate duration from frames and fps
 */
export function calculateDuration(numFrames: number, fps: number): number {
  return Math.round((numFrames / fps) * 10) / 10;  // Round to 1 decimal
}

/**
 * Get workflow-specific step options
 */
export function getWorkflowStepOptions(method: GenerationMethodId): number[] {
  switch (method) {
    case 'hunyuan15':
      return [15, 20, 25, 30];  // Default 20

    case 'wan22':
      return [4];  // LightX2V only supports 4 steps

    case 'holocine':
      return [7];  // Fixed 7 steps (3+4)

    default:
      return [20, 30, 40, 50];
  }
}

/**
 * Get workflow-specific CFG options
 */
export function getWorkflowCfgOptions(method: GenerationMethodId): number[] {
  switch (method) {
    case 'hunyuan15':
      return [4, 5, 6, 7, 8];  // Default 6

    case 'wan22':
      return [1];  // LightX2V uses CFG 1

    case 'holocine':
      return [2.5, 3, 3.5, 4, 5];  // Default 3.5

    default:
      return [5, 6, 7, 7.5, 8, 10];
  }
}

/**
 * Check if workflow supports custom steps/cfg
 */
export function workflowSupportsCustomSettings(method: GenerationMethodId): {
  steps: boolean;
  cfg: boolean;
} {
  switch (method) {
    case 'wan22':
      return { steps: false, cfg: false };  // Fixed by LightX2V

    case 'holocine':
      return { steps: false, cfg: true };   // Steps fixed, CFG adjustable

    default:
      return { steps: true, cfg: true };
  }
}

/**
 * Map workflow type to ComfyUI workflow ID for render queue
 */
export function getComfyUIWorkflowId(method: GenerationMethodId): string {
  switch (method) {
    case 'hunyuan15':
      return 'hunyuan15_t2v';
    case 'wan22':
      return 'wan22_14b_t2v';
    case 'holocine':
      return 'holocine_native';
    default:
      return 'wan22_14b_t2v';  // Default fallback
  }
}
