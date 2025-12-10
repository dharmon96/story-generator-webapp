/**
 * ComfyUI Workflow Builder Service
 *
 * Builds ComfyUI API-compatible workflow JSON for different video generation models.
 * Each workflow is built dynamically based on the shot/scene data and settings.
 *
 * ComfyUI API Format:
 * The /prompt endpoint expects: { client_id: string, prompt: { [nodeId]: NodeData } }
 * where NodeData is { class_type: string, inputs: { ... } }
 */

import { debugService } from './debugService';
import { PREDEFINED_WORKFLOWS, getWorkflowById } from '../types/comfyuiTypes';
import { RenderJob } from '../store/useStore';

export interface WorkflowBuildResult {
  workflow: Record<string, any>;
  workflowType: string;
  estimatedVRAM: number;  // Estimated VRAM usage in GB
  warnings: string[];
}

/**
 * Build a ComfyUI workflow based on the render job and assigned workflow
 */
export function buildWorkflowForRenderJob(
  job: RenderJob,
  workflowId: string,
  modelOverrides?: Record<string, string>
): WorkflowBuildResult {
  const workflow = getWorkflowById(workflowId);

  if (!workflow) {
    throw new Error(`Unknown workflow: ${workflowId}`);
  }

  debugService.info('workflow', `Building ${workflow.type} workflow for job ${job.id}`, {
    workflowId,
    jobType: job.type
  });

  switch (workflow.type) {
    case 'wan22':
      return buildWan22Workflow(job, workflowId, modelOverrides);
    case 'hunyuan15':
      return buildHunyuan15Workflow(job, workflowId, modelOverrides);
    case 'holocine':
      return buildHoloCineWorkflow(job, workflowId, modelOverrides);
    default:
      throw new Error(`Unsupported workflow type: ${workflow.type}`);
  }
}

/**
 * Build Wan 2.2 Text-to-Video workflow
 */
function buildWan22Workflow(
  job: RenderJob,
  workflowId: string,
  modelOverrides?: Record<string, string>
): WorkflowBuildResult {
  const workflowDef = getWorkflowById(workflowId);
  const warnings: string[] = [];

  // Parse resolution
  const [width, height] = job.settings.resolution.split('x').map(Number);

  // Determine which Wan 2.2 variant based on workflow ID
  const is14B = workflowId.includes('14b');
  const isI2V = workflowId.includes('i2v');
  const isFLF = workflowId.includes('flf');

  // Get model names (with overrides)
  const getModel = (type: string, fallback: string) => {
    if (modelOverrides && modelOverrides[type]) {
      return modelOverrides[type];
    }
    const req = workflowDef?.requiredModels.find(m => m.type === type);
    return req?.defaultModel || fallback;
  };

  // Build the base workflow
  const workflow: Record<string, any> = {};
  let nodeId = 1;

  // 1. Load Diffusion Model (UNET)
  if (is14B) {
    // Dual-stage for 14B
    workflow[String(nodeId++)] = {
      class_type: 'UNETLoader',
      inputs: {
        unet_name: getModel('video_model', 'wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors'),
        weight_dtype: 'fp8_e4m3fn'
      }
    };
    const highNoiseModelId = nodeId - 1;

    workflow[String(nodeId++)] = {
      class_type: 'UNETLoader',
      inputs: {
        unet_name: modelOverrides?.['video_model_low'] ||
          (isI2V ? 'wan2.2_i2v_low_noise_14B_fp16.safetensors' :
            isFLF ? 'wan2.2_flf2v_low_noise_14B_fp16.safetensors' :
              'wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors'),
        weight_dtype: 'fp8_e4m3fn'
      }
    };
    const lowNoiseModelId = nodeId - 1;

    // Add model merger for dual-stage
    workflow[String(nodeId++)] = {
      class_type: 'WanDualStageModel',
      inputs: {
        high_noise_model: [String(highNoiseModelId), 0],
        low_noise_model: [String(lowNoiseModelId), 0],
        switch_step: 15
      }
    };
  } else {
    // Single model for 5B
    workflow[String(nodeId++)] = {
      class_type: 'UNETLoader',
      inputs: {
        unet_name: getModel('video_model', 'wan2.2_ti2v_5B_fp16.safetensors'),
        weight_dtype: 'default'
      }
    };
  }
  const modelNodeId = nodeId - 1;

  // 2. Load CLIP (Text Encoder)
  workflow[String(nodeId++)] = {
    class_type: 'CLIPLoader',
    inputs: {
      clip_name: getModel('clip', 'umt5_xxl_fp8_e4m3fn_scaled.safetensors'),
      type: 'sd3'  // UMT5 uses SD3-style loader
    }
  };
  const clipNodeId = nodeId - 1;

  // 3. Load VAE
  workflow[String(nodeId++)] = {
    class_type: 'VAELoader',
    inputs: {
      vae_name: getModel('vae', 'wan_2.1_vae.safetensors')
    }
  };
  const vaeNodeId = nodeId - 1;

  // 4. CLIP Text Encode - Positive
  workflow[String(nodeId++)] = {
    class_type: 'CLIPTextEncode',
    inputs: {
      text: job.positivePrompt,
      clip: [String(clipNodeId), 0]
    }
  };
  const positiveNodeId = nodeId - 1;

  // 5. CLIP Text Encode - Negative
  workflow[String(nodeId++)] = {
    class_type: 'CLIPTextEncode',
    inputs: {
      text: job.negativePrompt || 'blurry, low quality, distorted',
      clip: [String(clipNodeId), 0]
    }
  };
  const negativeNodeId = nodeId - 1;

  // 6. Empty Latent Video
  workflow[String(nodeId++)] = {
    class_type: 'EmptyHunyuanLatentVideo',
    inputs: {
      width: width,
      height: height,
      length: job.settings.numFrames,
      batch_size: 1
    }
  };
  const latentNodeId = nodeId - 1;

  // 7. KSampler
  workflow[String(nodeId++)] = {
    class_type: 'KSampler',
    inputs: {
      model: [String(modelNodeId), 0],
      positive: [String(positiveNodeId), 0],
      negative: [String(negativeNodeId), 0],
      latent_image: [String(latentNodeId), 0],
      seed: Math.floor(Math.random() * 2147483647),
      steps: job.settings.steps || 30,
      cfg: job.settings.cfg || 7.0,
      sampler_name: 'euler_ancestral',
      scheduler: 'normal',
      denoise: 1.0
    }
  };
  const samplerNodeId = nodeId - 1;

  // 8. VAE Decode
  workflow[String(nodeId++)] = {
    class_type: 'VAEDecode',
    inputs: {
      samples: [String(samplerNodeId), 0],
      vae: [String(vaeNodeId), 0]
    }
  };
  const decodeNodeId = nodeId - 1;

  // 9. Video Combine (save output)
  workflow[String(nodeId++)] = {
    class_type: 'VHS_VideoCombine',
    inputs: {
      images: [String(decodeNodeId), 0],
      frame_rate: job.settings.fps || 16,
      loop_count: 0,
      filename_prefix: `render_${job.id}`,
      format: 'video/h264-mp4',
      pingpong: false,
      save_output: true
    }
  };

  return {
    workflow,
    workflowType: 'wan22',
    estimatedVRAM: is14B ? 24 : 12,
    warnings
  };
}

/**
 * Build Hunyuan 1.5 Text-to-Video workflow
 */
function buildHunyuan15Workflow(
  job: RenderJob,
  workflowId: string,
  modelOverrides?: Record<string, string>
): WorkflowBuildResult {
  const workflowDef = getWorkflowById(workflowId);
  const warnings: string[] = [];

  const [width, height] = job.settings.resolution.split('x').map(Number);
  const isI2V = workflowId.includes('i2v');

  const getModel = (type: string, fallback: string) => {
    if (modelOverrides && modelOverrides[type]) {
      return modelOverrides[type];
    }
    const req = workflowDef?.requiredModels.find(m => m.type === type);
    return req?.defaultModel || fallback;
  };

  const workflow: Record<string, any> = {};
  let nodeId = 1;

  // 1. Load Diffusion Model (UNET)
  workflow[String(nodeId++)] = {
    class_type: 'UNETLoader',
    inputs: {
      unet_name: getModel('video_model',
        isI2V ? 'hunyuan_video_1.5_i2v_720p_bf16.safetensors' :
          'hunyuan_video_1.5_t2v_720p_bf16.safetensors'),
      weight_dtype: 'bf16'
    }
  };
  const modelNodeId = nodeId - 1;

  // 2. Dual CLIP Loader (Hunyuan uses CLIP-L + LLaVA)
  workflow[String(nodeId++)] = {
    class_type: 'DualCLIPLoader',
    inputs: {
      clip_name1: getModel('clip', 'clip_l.safetensors'),
      clip_name2: 'llava_llama3_fp8_scaled.safetensors',
      type: 'hunyuan_video'
    }
  };
  const clipNodeId = nodeId - 1;

  // 3. Load VAE
  workflow[String(nodeId++)] = {
    class_type: 'VAELoader',
    inputs: {
      vae_name: getModel('vae', 'hunyuan_video_vae_bf16.safetensors')
    }
  };
  const vaeNodeId = nodeId - 1;

  // 4. CLIP Text Encode - Positive
  workflow[String(nodeId++)] = {
    class_type: 'CLIPTextEncode',
    inputs: {
      text: job.positivePrompt,
      clip: [String(clipNodeId), 0]
    }
  };
  const positiveNodeId = nodeId - 1;

  // 5. CLIP Text Encode - Negative
  workflow[String(nodeId++)] = {
    class_type: 'CLIPTextEncode',
    inputs: {
      text: job.negativePrompt || 'blurry, low quality, distorted',
      clip: [String(clipNodeId), 0]
    }
  };
  const negativeNodeId = nodeId - 1;

  // 6. Empty Latent Video
  workflow[String(nodeId++)] = {
    class_type: 'EmptyHunyuanLatentVideo',
    inputs: {
      width: width,
      height: height,
      length: job.settings.numFrames || 129,
      batch_size: 1
    }
  };
  const latentNodeId = nodeId - 1;

  // 7. KSampler
  workflow[String(nodeId++)] = {
    class_type: 'KSampler',
    inputs: {
      model: [String(modelNodeId), 0],
      positive: [String(positiveNodeId), 0],
      negative: [String(negativeNodeId), 0],
      latent_image: [String(latentNodeId), 0],
      seed: Math.floor(Math.random() * 2147483647),
      steps: job.settings.steps || 30,
      cfg: job.settings.cfg || 6.0,
      sampler_name: 'euler',
      scheduler: 'normal',
      denoise: 1.0
    }
  };
  const samplerNodeId = nodeId - 1;

  // 8. VAE Decode
  workflow[String(nodeId++)] = {
    class_type: 'VAEDecode',
    inputs: {
      samples: [String(samplerNodeId), 0],
      vae: [String(vaeNodeId), 0]
    }
  };
  const decodeNodeId = nodeId - 1;

  // 9. Video Combine
  workflow[String(nodeId++)] = {
    class_type: 'VHS_VideoCombine',
    inputs: {
      images: [String(decodeNodeId), 0],
      frame_rate: job.settings.fps || 24,
      loop_count: 0,
      filename_prefix: `render_${job.id}`,
      format: 'video/h264-mp4',
      pingpong: false,
      save_output: true
    }
  };

  return {
    workflow,
    workflowType: 'hunyuan15',
    estimatedVRAM: 16,
    warnings
  };
}

/**
 * Build HoloCine multi-shot workflow
 */
function buildHoloCineWorkflow(
  job: RenderJob,
  workflowId: string,
  modelOverrides?: Record<string, string>
): WorkflowBuildResult {
  const workflowDef = getWorkflowById(workflowId);
  const warnings: string[] = [];

  const [width, height] = job.settings.resolution.split('x').map(Number);

  const getModel = (type: string, fallback: string) => {
    if (modelOverrides && modelOverrides[type]) {
      return modelOverrides[type];
    }
    const req = workflowDef?.requiredModels.find(m => m.type === type);
    return req?.defaultModel || fallback;
  };

  const workflow: Record<string, any> = {};
  let nodeId = 1;

  // HoloCine uses WanVideoWrapper nodes for multi-shot generation
  // The prompt format includes [global caption] and [per shot caption] markers

  // 1. Load WanVideo Model
  workflow[String(nodeId++)] = {
    class_type: 'DownloadAndLoadWanVideoModel',
    inputs: {
      model: getModel('video_model', 'wan2.1_i2v_480p_14B_bf16.safetensors'),
      base_precision: 'bf16',
      quantization: 'disabled',
      attention_mode: 'sdpa'
    }
  };
  const modelNodeId = nodeId - 1;

  // 2. Load CLIP
  workflow[String(nodeId++)] = {
    class_type: 'DownloadAndLoadWanVideoTextEncoder',
    inputs: {
      model: getModel('clip', 'umt5_xxl_encoder_Q8_0.gguf'),
      precision: 'fp16'
    }
  };
  const clipNodeId = nodeId - 1;

  // 3. Load VAE
  workflow[String(nodeId++)] = {
    class_type: 'DownloadAndLoadWanVideoVAE',
    inputs: {
      model: getModel('vae', 'wan_2.1_vae.safetensors'),
      precision: 'bf16'
    }
  };
  const vaeNodeId = nodeId - 1;

  // 4. WanVideo Text Encode (supports HoloCine format)
  workflow[String(nodeId++)] = {
    class_type: 'WanVideoTextEncode',
    inputs: {
      prompt: job.positivePrompt,  // Should be in HoloCine format with [global caption] etc.
      text_encoder: [String(clipNodeId), 0]
    }
  };
  const positiveNodeId = nodeId - 1;

  // 5. WanVideo Text Encode - Negative
  workflow[String(nodeId++)] = {
    class_type: 'WanVideoTextEncode',
    inputs: {
      prompt: job.negativePrompt || 'blurry, low quality, distorted',
      text_encoder: [String(clipNodeId), 0]
    }
  };
  const negativeNodeId = nodeId - 1;

  // 6. Empty WanVideo Latent
  workflow[String(nodeId++)] = {
    class_type: 'WanVideoEmptyLatent',
    inputs: {
      width: width,
      height: height,
      num_frames: job.settings.numFrames || 81,
      batch_size: 1
    }
  };
  const latentNodeId = nodeId - 1;

  // 7. WanVideo Sampler
  workflow[String(nodeId++)] = {
    class_type: 'WanVideoSampler',
    inputs: {
      model: [String(modelNodeId), 0],
      positive: [String(positiveNodeId), 0],
      negative: [String(negativeNodeId), 0],
      latent: [String(latentNodeId), 0],
      seed: Math.floor(Math.random() * 2147483647),
      steps: job.settings.steps || 30,
      cfg: job.settings.cfg || 7.5,
      sampler: 'euler',
      scheduler: 'normal',
      denoise: 1.0
    }
  };
  const samplerNodeId = nodeId - 1;

  // 8. WanVideo VAE Decode
  workflow[String(nodeId++)] = {
    class_type: 'WanVideoVAEDecode',
    inputs: {
      samples: [String(samplerNodeId), 0],
      vae: [String(vaeNodeId), 0],
      enable_vae_tiling: true,
      tile_sample_min_height: 240,
      tile_sample_min_width: 240
    }
  };
  const decodeNodeId = nodeId - 1;

  // 9. Video Combine
  workflow[String(nodeId++)] = {
    class_type: 'VHS_VideoCombine',
    inputs: {
      images: [String(decodeNodeId), 0],
      frame_rate: job.settings.fps || 16,
      loop_count: 0,
      filename_prefix: `holocine_${job.id}`,
      format: 'video/h264-mp4',
      pingpong: false,
      save_output: true
    }
  };

  return {
    workflow,
    workflowType: 'holocine',
    estimatedVRAM: 24,
    warnings
  };
}

/**
 * Get available workflow types for a given pipeline
 */
export function getWorkflowsForPipeline(pipelineType: 'holocine' | 'wan22' | 'hunyuan15'): typeof PREDEFINED_WORKFLOWS {
  return PREDEFINED_WORKFLOWS.filter(w => w.type === pipelineType && w.available);
}

export default {
  buildWorkflowForRenderJob,
  getWorkflowsForPipeline
};
