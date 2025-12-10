/**
 * ComfyUI Workflow Builder Service
 *
 * Builds ComfyUI API-compatible workflow JSON for different video generation models.
 * Uses the actual workflow JSON templates from comfyui workflows/ folder and injects
 * dynamic parameters (prompt, seed, resolution, etc.).
 *
 * Supported Workflows (from comfyui workflows/ folder):
 * - Hunyuan Video 1.5 720p T2V
 * - Wan 2.2 14B T2V (with LightX2V acceleration)
 * - HoloCine (multi-shot with character consistency)
 *
 * ComfyUI API Format:
 * The /prompt endpoint expects: { client_id: string, prompt: { [nodeId]: NodeData } }
 * where NodeData is { class_type: string, inputs: { ... } }
 */

import { debugService } from './debugService';
import { PREDEFINED_WORKFLOWS, getWorkflowById } from '../types/comfyuiTypes';
import { RenderJob } from '../store/useStore';

/**
 * Workflow templates loaded from comfyui workflows/ folder.
 * These are embedded directly in the code to avoid runtime file loading issues.
 * When you update the workflow JSON files, update these templates accordingly.
 */

// Hunyuan Video 1.5 720p T2V workflow template
// Source: comfyui workflows/video_hunyuan_video_1.5_720p_t2v_api.json
const hunyuanWorkflow: Record<string, any> = {
  "8": {
    "inputs": { "samples": ["127", 0], "vae": ["10", 0] },
    "class_type": "VAEDecode",
    "_meta": { "title": "VAE Decode" }
  },
  "10": {
    "inputs": { "vae_name": "hunyuanvideo15_vae_fp16.safetensors" },
    "class_type": "VAELoader",
    "_meta": { "title": "Load VAE" }
  },
  "11": {
    "inputs": {
      "clip_name1": "qwen_2.5_vl_7b_fp8_scaled.safetensors",
      "clip_name2": "byt5_small_glyphxl_fp16.safetensors",
      "type": "hunyuan_video_15",
      "device": "default"
    },
    "class_type": "DualCLIPLoader",
    "_meta": { "title": "DualCLIPLoader" }
  },
  "12": {
    "inputs": { "unet_name": "hunyuanvideo1.5_720p_t2v_fp16.safetensors", "weight_dtype": "default" },
    "class_type": "UNETLoader",
    "_meta": { "title": "Load Diffusion Model" }
  },
  "44": {
    "inputs": { "text": "", "clip": ["11", 0] },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "CLIP Text Encode (Positive Prompt)" }
  },
  "93": {
    "inputs": { "text": "", "clip": ["11", 0] },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "CLIP Text Encode (Negative Prompt)" }
  },
  "101": {
    "inputs": { "fps": 24, "images": ["8", 0] },
    "class_type": "CreateVideo",
    "_meta": { "title": "Create Video" }
  },
  "102": {
    "inputs": { "filename_prefix": "video/hunyuan_video_1.5", "format": "auto", "codec": "h264", "video": ["101", 0] },
    "class_type": "SaveVideo",
    "_meta": { "title": "Save Video" }
  },
  "124": {
    "inputs": { "width": 1280, "height": 720, "length": 121, "batch_size": 1 },
    "class_type": "EmptyHunyuanVideo15Latent",
    "_meta": { "title": "Empty HunyuanVideo 1.5 Latent" }
  },
  "127": {
    "inputs": { "noise": ["129", 0], "guider": ["131", 0], "sampler": ["130", 0], "sigmas": ["128", 0], "latent_image": ["124", 0] },
    "class_type": "SamplerCustomAdvanced",
    "_meta": { "title": "SamplerCustomAdvanced" }
  },
  "128": {
    "inputs": { "scheduler": "simple", "steps": 20, "denoise": 1, "model": ["12", 0] },
    "class_type": "BasicScheduler",
    "_meta": { "title": "BasicScheduler" }
  },
  "129": {
    "inputs": { "noise_seed": 0 },
    "class_type": "RandomNoise",
    "_meta": { "title": "RandomNoise" }
  },
  "130": {
    "inputs": { "sampler_name": "euler" },
    "class_type": "KSamplerSelect",
    "_meta": { "title": "KSamplerSelect" }
  },
  "131": {
    "inputs": { "cfg": 6, "model": ["132", 0], "positive": ["44", 0], "negative": ["93", 0] },
    "class_type": "CFGGuider",
    "_meta": { "title": "CFGGuider" }
  },
  "132": {
    "inputs": { "shift": 7, "model": ["12", 0] },
    "class_type": "ModelSamplingSD3",
    "_meta": { "title": "ModelSamplingSD3" }
  }
};

// Wan 2.2 14B T2V workflow template (with LightX2V acceleration)
// Source: comfyui workflows/video_wan2_2_14B_t2v_api.json
const wan22Workflow: Record<string, any> = {
  "71": {
    "inputs": { "clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan", "device": "default" },
    "class_type": "CLIPLoader",
    "_meta": { "title": "Load CLIP" }
  },
  "72": {
    "inputs": { "text": "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走，裸露，NSFW", "clip": ["71", 0] },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "CLIP Text Encode (Negative Prompt)" }
  },
  "73": {
    "inputs": { "vae_name": "wan_2.1_vae.safetensors" },
    "class_type": "VAELoader",
    "_meta": { "title": "Load VAE" }
  },
  "74": {
    "inputs": { "width": 640, "height": 640, "length": 81, "batch_size": 1 },
    "class_type": "EmptyHunyuanLatentVideo",
    "_meta": { "title": "Empty HunyuanVideo 1.0 Latent" }
  },
  "75": {
    "inputs": { "unet_name": "wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors", "weight_dtype": "default" },
    "class_type": "UNETLoader",
    "_meta": { "title": "Load Diffusion Model" }
  },
  "76": {
    "inputs": { "unet_name": "wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors", "weight_dtype": "default" },
    "class_type": "UNETLoader",
    "_meta": { "title": "Load Diffusion Model" }
  },
  "78": {
    "inputs": {
      "add_noise": "disable", "noise_seed": 0, "steps": 4, "cfg": 1, "sampler_name": "euler", "scheduler": "simple",
      "start_at_step": 2, "end_at_step": 4, "return_with_leftover_noise": "disable",
      "model": ["86", 0], "positive": ["89", 0], "negative": ["72", 0], "latent_image": ["81", 0]
    },
    "class_type": "KSamplerAdvanced",
    "_meta": { "title": "KSampler (Advanced)" }
  },
  "80": {
    "inputs": { "filename_prefix": "video/ComfyUI", "format": "auto", "codec": "auto", "video": ["88", 0] },
    "class_type": "SaveVideo",
    "_meta": { "title": "Save Video" }
  },
  "81": {
    "inputs": {
      "add_noise": "enable", "noise_seed": 0, "steps": 4, "cfg": 1, "sampler_name": "euler", "scheduler": "simple",
      "start_at_step": 0, "end_at_step": 2, "return_with_leftover_noise": "enable",
      "model": ["82", 0], "positive": ["89", 0], "negative": ["72", 0], "latent_image": ["74", 0]
    },
    "class_type": "KSamplerAdvanced",
    "_meta": { "title": "KSampler (Advanced)" }
  },
  "82": {
    "inputs": { "shift": 5.000000000000001, "model": ["83", 0] },
    "class_type": "ModelSamplingSD3",
    "_meta": { "title": "ModelSamplingSD3" }
  },
  "83": {
    "inputs": { "lora_name": "wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors", "strength_model": 1.0000000000000002, "model": ["75", 0] },
    "class_type": "LoraLoaderModelOnly",
    "_meta": { "title": "LoraLoaderModelOnly" }
  },
  "85": {
    "inputs": { "lora_name": "wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors", "strength_model": 1.0000000000000002, "model": ["76", 0] },
    "class_type": "LoraLoaderModelOnly",
    "_meta": { "title": "LoraLoaderModelOnly" }
  },
  "86": {
    "inputs": { "shift": 5.000000000000001, "model": ["85", 0] },
    "class_type": "ModelSamplingSD3",
    "_meta": { "title": "ModelSamplingSD3" }
  },
  "87": {
    "inputs": { "samples": ["78", 0], "vae": ["73", 0] },
    "class_type": "VAEDecode",
    "_meta": { "title": "VAE Decode" }
  },
  "88": {
    "inputs": { "fps": 16, "images": ["87", 0] },
    "class_type": "CreateVideo",
    "_meta": { "title": "Create Video" }
  },
  "89": {
    "inputs": { "text": "", "clip": ["71", 0] },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "CLIP Text Encode (Positive Prompt)" }
  }
};

// HoloCine workflow template (multi-shot with character consistency)
// Source: comfyui workflows/124201_Holocine_api.json
const holocineWorkflow: Record<string, any> = {
  "6": {
    "inputs": { "text": "", "clip": ["38", 0] },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "CLIP Text Encode (Prompt)" }
  },
  "7": {
    "inputs": { "text": "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走", "clip": ["38", 0] },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "CLIP Text Encode (Prompt)" }
  },
  "8": {
    "inputs": { "samples": ["114", 0], "vae": ["39", 0] },
    "class_type": "VAEDecode",
    "_meta": { "title": "VAE Decode" }
  },
  "38": {
    "inputs": { "clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan", "device": "default" },
    "class_type": "CLIPLoader",
    "_meta": { "title": "Load CLIP" }
  },
  "39": {
    "inputs": { "vae_name": "wan_2.1_vae.safetensors" },
    "class_type": "VAELoader",
    "_meta": { "title": "Load VAE" }
  },
  "59": {
    "inputs": { "width": 848, "height": 480, "length": 77, "batch_size": 1 },
    "class_type": "EmptyHunyuanLatentVideo",
    "_meta": { "title": "Empty HunyuanVideo 1.0 Latent" }
  },
  "63": {
    "inputs": {
      "frame_rate": 16, "loop_count": 0, "filename_prefix": "holocine", "format": "video/h264-mp4",
      "pix_fmt": "yuv420p", "crf": 19, "save_metadata": true, "trim_to_audio": false,
      "pingpong": false, "save_output": true, "images": ["184", 0]
    },
    "class_type": "VHS_VideoCombine",
    "_meta": { "title": "Video Combine 🎥🅥🅗🅢" }
  },
  "113": {
    "inputs": {
      "add_noise": "enable", "noise_seed": 0, "steps": ["119", 0], "cfg": 3.5, "sampler_name": "euler", "scheduler": "simple",
      "start_at_step": 0, "end_at_step": ["120", 0], "return_with_leftover_noise": "enable",
      "model": ["154", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["59", 0]
    },
    "class_type": "KSamplerAdvanced",
    "_meta": { "title": "KSampler (Advanced)" }
  },
  "114": {
    "inputs": {
      "add_noise": "disable", "noise_seed": 0, "steps": ["119", 0], "cfg": 1, "sampler_name": "euler", "scheduler": "simple",
      "start_at_step": ["120", 0], "end_at_step": 10000, "return_with_leftover_noise": "disable",
      "model": ["155", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["113", 0]
    },
    "class_type": "KSamplerAdvanced",
    "_meta": { "title": "KSampler (Advanced)" }
  },
  "119": {
    "inputs": { "value": 7 },
    "class_type": "INTConstant",
    "_meta": { "title": "INT Constant" }
  },
  "120": {
    "inputs": { "value": 3 },
    "class_type": "INTConstant",
    "_meta": { "title": "INT Constant" }
  },
  "123": {
    "inputs": { "anything": ["8", 0] },
    "class_type": "easy cleanGpuUsed",
    "_meta": { "title": "Clean VRAM Used" }
  },
  "124": {
    "inputs": { "anything": ["113", 0] },
    "class_type": "easy cleanGpuUsed",
    "_meta": { "title": "Clean VRAM Used" }
  },
  "152": {
    "inputs": { "unet_name": "Wan2_2-T2V-A14B-HIGH-HoloCine-full_fp8_e4m3fn_scaled_KJ.safetensors", "weight_dtype": "fp8_e4m3fn" },
    "class_type": "UNETLoader",
    "_meta": { "title": "Load Diffusion Model" }
  },
  "153": {
    "inputs": { "unet_name": "Wan2_2-T2V-A14B-LOW-HoloCine-full_fp8_e4m3fn_scaled_KJ.safetensors", "weight_dtype": "fp8_e4m3fn" },
    "class_type": "UNETLoader",
    "_meta": { "title": "Load Diffusion Model" }
  },
  "154": {
    "inputs": { "shift": 6.000000000000001, "model": ["152", 0] },
    "class_type": "ModelSamplingSD3",
    "_meta": { "title": "ModelSamplingSD3" }
  },
  "155": {
    "inputs": { "shift": 6.000000000000001, "model": ["156", 0] },
    "class_type": "ModelSamplingSD3",
    "_meta": { "title": "ModelSamplingSD3" }
  },
  "156": {
    "inputs": { "lora_name": "lightx2v_T2V_14B_cfg_step_distill_v2_lora_rank64_bf16.safetensors", "strength_model": 1, "model": ["153", 0] },
    "class_type": "LoraLoaderModelOnly",
    "_meta": { "title": "LoraLoaderModelOnly" }
  },
  "184": {
    "inputs": { "sharpen_radius": 1, "sigma": 0.4, "alpha": 0.5, "image": ["8", 0] },
    "class_type": "ImageSharpen",
    "_meta": { "title": "ImageSharpen" }
  }
};

export interface WorkflowBuildResult {
  workflow: Record<string, any>;
  workflowType: string;
  estimatedVRAM: number;  // Estimated VRAM usage in GB
  warnings: string[];
}

/**
 * Supported workflow types - only these three are supported
 */
export type SupportedWorkflowType = 'hunyuan15_720p_t2v' | 'wan22_14b_t2v' | 'holocine';

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
 * Build Wan 2.2 14B Text-to-Video workflow
 *
 * Uses the exact workflow from video_wan2_2_14B_t2v_api.json
 * This workflow uses LightX2V acceleration with 4 steps (2+2 dual-stage)
 *
 * Key nodes to inject:
 * - Node 89: Positive prompt text
 * - Node 72: Negative prompt text (has Chinese default)
 * - Node 74: Latent dimensions (width, height, length)
 * - Node 81: First sampler seed
 * - Node 80: Output filename prefix
 */
function buildWan22Workflow(
  job: RenderJob,
  workflowId: string,
  modelOverrides?: Record<string, string>
): WorkflowBuildResult {
  const warnings: string[] = [];

  // Deep clone the workflow template
  const workflow = JSON.parse(JSON.stringify(wan22Workflow)) as Record<string, any>;

  // Parse resolution - default is 640x640 for this workflow
  const [width, height] = job.settings.resolution?.split('x').map(Number) || [640, 640];

  // Generate a random seed
  const seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

  // Inject dynamic parameters:

  // Node 89 - Positive Prompt
  if (workflow['89']) {
    workflow['89'].inputs.text = job.positivePrompt;
  }

  // Node 72 - Negative Prompt (keep Chinese default if not specified)
  // Default: 色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走，裸露，NSFW
  if (workflow['72'] && job.negativePrompt) {
    workflow['72'].inputs.text = job.negativePrompt;
  }

  // Node 74 - Empty Latent Video dimensions
  if (workflow['74']) {
    workflow['74'].inputs.width = width;
    workflow['74'].inputs.height = height;
    workflow['74'].inputs.length = job.settings.numFrames || 81;
  }

  // Node 81 - First KSampler seed (high noise stage)
  if (workflow['81']) {
    workflow['81'].inputs.noise_seed = seed;
  }

  // Node 78 - Second KSampler seed (low noise stage) - use same seed for consistency
  if (workflow['78']) {
    workflow['78'].inputs.noise_seed = seed;
  }

  // Node 80 - Output filename
  if (workflow['80']) {
    workflow['80'].inputs.filename_prefix = `video/wan22_${job.id}`;
  }

  // Node 88 - Video FPS
  if (workflow['88']) {
    workflow['88'].inputs.fps = job.settings.fps || 16;
  }

  // Apply model overrides if specified
  if (modelOverrides) {
    // Node 75 - High noise UNET
    if (modelOverrides['video_model_high'] && workflow['75']) {
      workflow['75'].inputs.unet_name = modelOverrides['video_model_high'];
    }
    // Node 76 - Low noise UNET
    if (modelOverrides['video_model_low'] && workflow['76']) {
      workflow['76'].inputs.unet_name = modelOverrides['video_model_low'];
    }
    // Node 71 - CLIP
    if (modelOverrides['clip'] && workflow['71']) {
      workflow['71'].inputs.clip_name = modelOverrides['clip'];
    }
    // Node 73 - VAE
    if (modelOverrides['vae'] && workflow['73']) {
      workflow['73'].inputs.vae_name = modelOverrides['vae'];
    }
  }

  debugService.info('workflow', 'Built Wan 2.2 14B T2V workflow', {
    resolution: `${width}x${height}`,
    frames: job.settings.numFrames || 81,
    seed,
    steps: '4 (2+2 dual-stage with LightX2V)'
  });

  return {
    workflow,
    workflowType: 'wan22_14b_t2v',
    estimatedVRAM: 24,
    warnings
  };
}

/**
 * Build Hunyuan 1.5 720p Text-to-Video workflow
 *
 * Uses the exact workflow from video_hunyuan_video_1.5_720p_t2v_api.json
 * This workflow uses:
 * - DualCLIPLoader with qwen_2.5_vl_7b + byt5_small_glyphxl (type: hunyuan_video_15)
 * - SamplerCustomAdvanced with CFGGuider
 * - CreateVideo + SaveVideo output nodes
 *
 * Key nodes to inject:
 * - Node 44: Positive prompt text
 * - Node 93: Negative prompt text
 * - Node 124: Latent dimensions (width, height, length)
 * - Node 129: Random seed
 * - Node 102: Output filename prefix
 */
function buildHunyuan15Workflow(
  job: RenderJob,
  workflowId: string,
  modelOverrides?: Record<string, string>
): WorkflowBuildResult {
  const warnings: string[] = [];

  // Deep clone the workflow template
  const workflow = JSON.parse(JSON.stringify(hunyuanWorkflow)) as Record<string, any>;

  // Parse resolution - default is 1280x720 for this workflow
  const [width, height] = job.settings.resolution?.split('x').map(Number) || [1280, 720];

  // Generate a random seed
  const seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

  // Inject dynamic parameters:

  // Node 44 - Positive Prompt
  if (workflow['44']) {
    workflow['44'].inputs.text = job.positivePrompt;
  }

  // Node 93 - Negative Prompt (empty by default in the workflow)
  if (workflow['93']) {
    workflow['93'].inputs.text = job.negativePrompt || '';
  }

  // Node 124 - Empty HunyuanVideo 1.5 Latent dimensions
  if (workflow['124']) {
    workflow['124'].inputs.width = width;
    workflow['124'].inputs.height = height;
    // length: 121 frames = ~5 seconds at 24fps (workflow default)
    workflow['124'].inputs.length = job.settings.numFrames || 121;
  }

  // Node 129 - RandomNoise seed
  if (workflow['129']) {
    workflow['129'].inputs.noise_seed = seed;
  }

  // Node 102 - SaveVideo filename
  if (workflow['102']) {
    workflow['102'].inputs.filename_prefix = `video/hunyuan15_${job.id}`;
  }

  // Node 101 - CreateVideo FPS
  if (workflow['101']) {
    workflow['101'].inputs.fps = job.settings.fps || 24;
  }

  // Node 128 - BasicScheduler steps (default is 20)
  if (workflow['128'] && job.settings.steps) {
    workflow['128'].inputs.steps = job.settings.steps;
  }

  // Node 131 - CFGGuider cfg (default is 6)
  if (workflow['131'] && job.settings.cfg) {
    workflow['131'].inputs.cfg = job.settings.cfg;
  }

  // Apply model overrides if specified
  if (modelOverrides) {
    // Node 12 - UNET
    if (modelOverrides['video_model'] && workflow['12']) {
      workflow['12'].inputs.unet_name = modelOverrides['video_model'];
    }
    // Node 11 - DualCLIPLoader
    if (modelOverrides['clip1'] && workflow['11']) {
      workflow['11'].inputs.clip_name1 = modelOverrides['clip1'];
    }
    if (modelOverrides['clip2'] && workflow['11']) {
      workflow['11'].inputs.clip_name2 = modelOverrides['clip2'];
    }
    // Node 10 - VAE
    if (modelOverrides['vae'] && workflow['10']) {
      workflow['10'].inputs.vae_name = modelOverrides['vae'];
    }
  }

  debugService.info('workflow', 'Built Hunyuan 1.5 720p T2V workflow', {
    resolution: `${width}x${height}`,
    frames: job.settings.numFrames || 121,
    seed,
    steps: job.settings.steps || 20,
    cfg: job.settings.cfg || 6
  });

  return {
    workflow,
    workflowType: 'hunyuan15_720p_t2v',
    estimatedVRAM: 16,
    warnings
  };
}

/**
 * Build HoloCine multi-shot workflow
 *
 * Uses the exact workflow from 124201_Holocine_api.json
 * This workflow uses:
 * - Dual-stage sampling with HIGH and LOW HoloCine models
 * - LightX2V LoRA for the low-noise stage
 * - 7 steps total (3 high-noise + 4 low-noise)
 * - ImageSharpen post-processing
 * - VHS_VideoCombine output
 *
 * HoloCine prompt format:
 * [global caption] Scene description with [character1], [character2] etc.
 * [per shot caption] Shot 1 description [shot cut] Shot 2 description...
 *
 * Key nodes to inject:
 * - Node 6: Positive prompt (HoloCine format with [global caption] and [per shot caption])
 * - Node 7: Negative prompt (has Chinese default)
 * - Node 59: Latent dimensions (width, height, length)
 * - Node 113: First sampler seed
 * - Node 63: Output settings (filename, fps)
 */
function buildHoloCineWorkflow(
  job: RenderJob,
  workflowId: string,
  modelOverrides?: Record<string, string>
): WorkflowBuildResult {
  const warnings: string[] = [];

  // Deep clone the workflow template
  const workflow = JSON.parse(JSON.stringify(holocineWorkflow)) as Record<string, any>;

  // Parse resolution - default is 848x480 for this workflow
  const [width, height] = job.settings.resolution?.split('x').map(Number) || [848, 480];

  // Generate a random seed
  const seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

  // Inject dynamic parameters:

  // Node 6 - Positive Prompt (HoloCine format)
  // Expected format: [global caption] ... [per shot caption] ... [shot cut] ...
  if (workflow['6']) {
    workflow['6'].inputs.text = job.positivePrompt;
  }

  // Node 7 - Negative Prompt (keep Chinese default if not specified)
  // Default: 色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走
  if (workflow['7'] && job.negativePrompt) {
    workflow['7'].inputs.text = job.negativePrompt;
  }

  // Node 59 - Empty Latent Video dimensions
  if (workflow['59']) {
    workflow['59'].inputs.width = width;
    workflow['59'].inputs.height = height;
    // length: 77 frames = ~4.8 seconds at 16fps (workflow default)
    workflow['59'].inputs.length = job.settings.numFrames || 77;
  }

  // Node 113 - First KSampler seed (high noise stage)
  if (workflow['113']) {
    workflow['113'].inputs.noise_seed = seed;
  }

  // Node 114 - Second KSampler seed (low noise stage) - use different seed
  if (workflow['114']) {
    workflow['114'].inputs.noise_seed = seed + 1;
  }

  // Node 63 - VHS_VideoCombine output settings
  if (workflow['63']) {
    workflow['63'].inputs.filename_prefix = `holocine_${job.id}`;
    workflow['63'].inputs.frame_rate = job.settings.fps || 16;
  }

  // CFG is set per-sampler stage:
  // Node 113 (high noise): cfg 3.5 (workflow default)
  // Node 114 (low noise): cfg 1 (workflow default)
  // We can override the high-noise CFG if needed
  if (workflow['113'] && job.settings.cfg) {
    workflow['113'].inputs.cfg = job.settings.cfg;
  }

  // Apply model overrides if specified
  if (modelOverrides) {
    // Node 152 - HIGH noise UNET
    if (modelOverrides['video_model_high'] && workflow['152']) {
      workflow['152'].inputs.unet_name = modelOverrides['video_model_high'];
    }
    // Node 153 - LOW noise UNET
    if (modelOverrides['video_model_low'] && workflow['153']) {
      workflow['153'].inputs.unet_name = modelOverrides['video_model_low'];
    }
    // Node 38 - CLIP
    if (modelOverrides['clip'] && workflow['38']) {
      workflow['38'].inputs.clip_name = modelOverrides['clip'];
    }
    // Node 39 - VAE
    if (modelOverrides['vae'] && workflow['39']) {
      workflow['39'].inputs.vae_name = modelOverrides['vae'];
    }
    // Node 156 - LightX2V LoRA
    if (modelOverrides['lora'] && workflow['156']) {
      workflow['156'].inputs.lora_name = modelOverrides['lora'];
    }
  }

  debugService.info('workflow', 'Built HoloCine workflow', {
    resolution: `${width}x${height}`,
    frames: job.settings.numFrames || 77,
    seed,
    steps: '7 (3 high-noise + 4 low-noise)',
    cfg: `${job.settings.cfg || 3.5} (high) / 1 (low)`
  });

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

const comfyUIWorkflowBuilder = {
  buildWorkflowForRenderJob,
  getWorkflowsForPipeline
};

export default comfyUIWorkflowBuilder;
