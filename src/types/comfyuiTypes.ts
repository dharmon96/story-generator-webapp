/**
 * ComfyUI Types
 *
 * Types for ComfyUI workflow configuration, model management, and rendering.
 */

/**
 * Workflow types supported by the application
 */
export type ComfyUIWorkflowType = 'holocine' | 'wan22' | 'hunyuan15' | 'cogvideox' | 'custom';

/**
 * Model requirements for a workflow
 */
export interface WorkflowModelRequirement {
  type: 'checkpoint' | 'vae' | 'lora' | 'clip' | 'unet' | 'video_model';
  name: string;
  description: string;
  required: boolean;
  defaultModel?: string;
  alternatives?: string[];  // Alternative model names that are also acceptable
}

/**
 * Workflow definition
 */
export interface ComfyUIWorkflow {
  id: string;
  name: string;
  type: ComfyUIWorkflowType;
  description: string;

  // Model requirements
  requiredModels: WorkflowModelRequirement[];

  // Node requirements (ComfyUI custom nodes needed)
  requiredNodes: string[];

  // Default parameters
  defaultParams: {
    steps?: number;
    cfg?: number;
    sampler?: string;
    scheduler?: string;
    numFrames?: number;
    fps?: number;
    resolution?: string;
  };

  // Whether this workflow is available
  available: boolean;

  // File path to workflow JSON (if custom)
  workflowPath?: string;
}

/**
 * ComfyUI node assignment for a pipeline step
 */
export interface ComfyUINodeAssignment {
  stepId: string;  // e.g., 'holocine_render', 'wan_render'
  nodeId: string;  // ComfyUI node ID
  workflowId: string;  // Which workflow to use
  modelOverrides?: Record<string, string>;  // Override specific models
  paramOverrides?: Record<string, any>;  // Override workflow params
  enabled: boolean;
}

/**
 * ComfyUI configuration in settings
 */
export interface ComfyUISettings {
  // Node assignments for different steps
  nodeAssignments: ComfyUINodeAssignment[];

  // Default workflow settings
  defaultWorkflow: ComfyUIWorkflowType;

  // Model mappings (local model name -> actual file name)
  modelMappings: Record<string, string>;

  // Whether to auto-validate models before rendering
  autoValidateModels: boolean;

  // Default negative prompt
  defaultNegativePrompt: string;

  // Queue settings
  maxConcurrentRenders: number;
  autoRetryFailed: boolean;
  retryAttempts: number;
}

/**
 * Model availability check result
 */
export interface ModelValidationResult {
  workflow: string;
  isValid: boolean;
  availableModels: string[];
  missingModels: WorkflowModelRequirement[];
  missingNodes: string[];
  warnings: string[];
}

/**
 * Predefined workflows
 */
export const PREDEFINED_WORKFLOWS: ComfyUIWorkflow[] = [
  {
    id: 'holocine_native',
    name: 'HoloCine Native',
    type: 'holocine',
    description: 'Multi-shot video generation with consistent characters using HoloCine/Wan 2.2',
    requiredModels: [
      {
        type: 'video_model',
        name: 'Wan 2.2 1.3B',
        description: 'Wan Video 2.2 1.3B model for HoloCine generation',
        required: true,
        defaultModel: 'wan2.1_i2v_480p_14B_bf16.safetensors',
        alternatives: ['wan2.2_t2v_1.3b.safetensors', 'wan_video_2.2.safetensors']
      },
      {
        type: 'clip',
        name: 'CLIP Text Encoder',
        description: 'UMT5-XXL text encoder for Wan',
        required: true,
        defaultModel: 'umt5_xxl_encoder_Q8_0.gguf',
        alternatives: ['umt5_xxl_encoder.safetensors', 'umt5xxl_fp16.safetensors']
      },
      {
        type: 'vae',
        name: 'Wan VAE',
        description: 'VAE for Wan video models',
        required: true,
        defaultModel: 'wan_2.1_vae.safetensors',
        alternatives: ['wan_vae.safetensors']
      }
    ],
    requiredNodes: [
      'WanVideoWrapper',
      'WanVideoSampler',
      'WanVideoVAEDecode'
    ],
    defaultParams: {
      steps: 30,
      cfg: 7.5,
      sampler: 'euler_ancestral',
      scheduler: 'normal',
      numFrames: 81,
      fps: 16,
      resolution: '832x480'
    },
    available: true
  },
  {
    id: 'wan22_5b_t2v',
    name: 'Wan 2.2 5B Text-to-Video',
    type: 'wan22',
    description: 'Text-to-video generation with Wan 2.2 5B model (lower VRAM)',
    requiredModels: [
      {
        type: 'video_model',
        name: 'Wan 2.2 5B T2V',
        description: 'Wan Video 2.2 5B text-to-video/image-to-video model',
        required: true,
        defaultModel: 'wan2.2_ti2v_5B_fp16.safetensors',
        alternatives: ['wan2.2_ti2v_5B_bf16.safetensors', 'wan2.2_5b.safetensors']
      },
      {
        type: 'clip',
        name: 'UMT5-XXL Text Encoder',
        description: 'Text encoder for Wan 2.2',
        required: true,
        defaultModel: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
        alternatives: ['umt5_xxl_encoder_Q8_0.gguf', 'umt5_xxl_encoder.safetensors']
      },
      {
        type: 'vae',
        name: 'Wan 2.2 VAE',
        description: 'VAE decoder for Wan 2.2',
        required: true,
        defaultModel: 'wan2.2_vae.safetensors',
        alternatives: ['wan_2.1_vae.safetensors']
      }
    ],
    requiredNodes: [
      'Load Diffusion Model',
      'Load CLIP',
      'Load VAE',
      'CLIP Text Encoder',
      'EmptyHunyuanLatentVideo'
    ],
    defaultParams: {
      steps: 30,
      cfg: 7.5,
      sampler: 'euler_ancestral',
      scheduler: 'normal',
      numFrames: 81,
      fps: 16,
      resolution: '832x480'
    },
    available: true
  },
  {
    id: 'wan22_14b_t2v',
    name: 'Wan 2.2 14B Text-to-Video',
    type: 'wan22',
    description: 'High-quality text-to-video with Wan 2.2 14B dual-stage model',
    requiredModels: [
      {
        type: 'video_model',
        name: 'Wan 2.2 14B High-Noise',
        description: 'High-noise stage model for initial generation',
        required: true,
        defaultModel: 'wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors',
        alternatives: ['wan2.2_t2v_high_noise_14B_fp16.safetensors', 'wan2.2_t2v_high_noise_14B_bf16.safetensors']
      },
      {
        type: 'video_model',
        name: 'Wan 2.2 14B Low-Noise',
        description: 'Low-noise stage model for refinement',
        required: true,
        defaultModel: 'wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors',
        alternatives: ['wan2.2_t2v_low_noise_14B_fp16.safetensors', 'wan2.2_t2v_low_noise_14B_bf16.safetensors']
      },
      {
        type: 'clip',
        name: 'UMT5-XXL Text Encoder',
        description: 'Text encoder for Wan 2.2',
        required: true,
        defaultModel: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
        alternatives: ['umt5_xxl_encoder_Q8_0.gguf', 'umt5_xxl_encoder.safetensors']
      },
      {
        type: 'vae',
        name: 'Wan 2.1 VAE',
        description: 'VAE decoder (14B uses 2.1 VAE)',
        required: true,
        defaultModel: 'wan_2.1_vae.safetensors',
        alternatives: ['wan2.1_vae.safetensors']
      }
    ],
    requiredNodes: [
      'Load Diffusion Model',
      'Load CLIP',
      'Load VAE',
      'CLIP Text Encoder',
      'EmptyHunyuanLatentVideo'
    ],
    defaultParams: {
      steps: 30,
      cfg: 7.0,
      sampler: 'euler_ancestral',
      scheduler: 'normal',
      numFrames: 81,
      fps: 16,
      resolution: '832x480'
    },
    available: true
  },
  {
    id: 'wan22_14b_i2v',
    name: 'Wan 2.2 14B Image-to-Video',
    type: 'wan22',
    description: 'Image-to-video generation with Wan 2.2 14B dual-stage model',
    requiredModels: [
      {
        type: 'video_model',
        name: 'Wan 2.2 14B I2V High-Noise',
        description: 'High-noise stage model for image-to-video',
        required: true,
        defaultModel: 'wan2.2_i2v_high_noise_14B_fp16.safetensors',
        alternatives: ['wan2.2_i2v_high_noise_14B_bf16.safetensors', 'wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors']
      },
      {
        type: 'video_model',
        name: 'Wan 2.2 14B I2V Low-Noise',
        description: 'Low-noise stage model for image-to-video refinement',
        required: true,
        defaultModel: 'wan2.2_i2v_low_noise_14B_fp16.safetensors',
        alternatives: ['wan2.2_i2v_low_noise_14B_bf16.safetensors', 'wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors']
      },
      {
        type: 'clip',
        name: 'UMT5-XXL Text Encoder',
        description: 'Text encoder for Wan 2.2',
        required: true,
        defaultModel: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
        alternatives: ['umt5_xxl_encoder_Q8_0.gguf', 'umt5_xxl_encoder.safetensors']
      },
      {
        type: 'vae',
        name: 'Wan 2.1 VAE',
        description: 'VAE decoder (14B uses 2.1 VAE)',
        required: true,
        defaultModel: 'wan_2.1_vae.safetensors',
        alternatives: ['wan2.1_vae.safetensors']
      }
    ],
    requiredNodes: [
      'Load Diffusion Model',
      'Load CLIP',
      'Load VAE',
      'Load Image',
      'CLIP Text Encoder',
      'Wan22ImageToVideoLatent'
    ],
    defaultParams: {
      steps: 30,
      cfg: 7.0,
      sampler: 'euler_ancestral',
      scheduler: 'normal',
      numFrames: 81,
      fps: 16,
      resolution: '832x480'
    },
    available: true
  },
  {
    id: 'wan22_14b_flf',
    name: 'Wan 2.2 14B First-Last Frame',
    type: 'wan22',
    description: 'First-to-last frame video interpolation with Wan 2.2 14B',
    requiredModels: [
      {
        type: 'video_model',
        name: 'Wan 2.2 14B FLF High-Noise',
        description: 'High-noise stage model for FLF',
        required: true,
        defaultModel: 'wan2.2_flf2v_high_noise_14B_fp16.safetensors',
        alternatives: ['wan2.2_flf2v_high_noise_14B_bf16.safetensors']
      },
      {
        type: 'video_model',
        name: 'Wan 2.2 14B FLF Low-Noise',
        description: 'Low-noise stage model for FLF refinement',
        required: true,
        defaultModel: 'wan2.2_flf2v_low_noise_14B_fp16.safetensors',
        alternatives: ['wan2.2_flf2v_low_noise_14B_bf16.safetensors']
      },
      {
        type: 'clip',
        name: 'UMT5-XXL Text Encoder',
        description: 'Text encoder for Wan 2.2',
        required: true,
        defaultModel: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
        alternatives: ['umt5_xxl_encoder_Q8_0.gguf']
      },
      {
        type: 'vae',
        name: 'Wan 2.1 VAE',
        description: 'VAE decoder',
        required: true,
        defaultModel: 'wan_2.1_vae.safetensors'
      }
    ],
    requiredNodes: [
      'Load Diffusion Model',
      'Load CLIP',
      'Load VAE',
      'Load Image',
      'WanFirstLastFrameToVideo'
    ],
    defaultParams: {
      steps: 30,
      cfg: 7.0,
      sampler: 'euler_ancestral',
      scheduler: 'normal',
      numFrames: 81,
      fps: 16,
      resolution: '832x480'
    },
    available: true
  },
  // Hunyuan Video 1.5 workflows
  {
    id: 'hunyuan15_t2v',
    name: 'Hunyuan 1.5 Text-to-Video',
    type: 'hunyuan15',
    description: 'Text-to-video generation with Hunyuan Video 1.5 (Tencent)',
    requiredModels: [
      {
        type: 'video_model',
        name: 'Hunyuan Video 1.5 T2V',
        description: 'Hunyuan Video 1.5 720p text-to-video diffusion model',
        required: true,
        defaultModel: 'hunyuan_video_1.5_t2v_720p_bf16.safetensors',
        alternatives: ['hunyuan_video_t2v_720p_bf16.safetensors', 'HunyuanVideo1.5_t2v_fp16.safetensors']
      },
      {
        type: 'clip',
        name: 'CLIP-L Text Encoder',
        description: 'CLIP-L text encoder',
        required: true,
        defaultModel: 'clip_l.safetensors',
        alternatives: ['clip-vit-large-patch14.safetensors']
      },
      {
        type: 'clip',
        name: 'LLaVA-LLaMA3 Encoder',
        description: 'LLaVA-LLaMA3 text encoder for Hunyuan',
        required: true,
        defaultModel: 'llava_llama3_fp8_scaled.safetensors',
        alternatives: ['llava-llama-3-8b-text-encoder-tokenizer.safetensors']
      },
      {
        type: 'vae',
        name: 'Hunyuan Video VAE',
        description: '3D VAE for Hunyuan Video',
        required: true,
        defaultModel: 'hunyuan_video_vae_bf16.safetensors',
        alternatives: ['hunyuan_video_vae_fp16.safetensors']
      }
    ],
    requiredNodes: [
      'DualCLIPLoader',
      'Load Diffusion Model',
      'Load VAE',
      'CLIP Text Encoder',
      'EmptyHunyuanLatentVideo'
    ],
    defaultParams: {
      steps: 30,
      cfg: 6.0,
      sampler: 'euler',
      scheduler: 'normal',
      numFrames: 129,  // ~5 seconds at 24fps
      fps: 24,
      resolution: '1280x720'
    },
    available: true
  },
  {
    id: 'hunyuan15_i2v',
    name: 'Hunyuan 1.5 Image-to-Video',
    type: 'hunyuan15',
    description: 'Image-to-video generation with Hunyuan Video 1.5',
    requiredModels: [
      {
        type: 'video_model',
        name: 'Hunyuan Video 1.5 I2V',
        description: 'Hunyuan Video 1.5 720p image-to-video diffusion model',
        required: true,
        defaultModel: 'hunyuan_video_1.5_i2v_720p_bf16.safetensors',
        alternatives: ['hunyuan_video_i2v_720p_bf16.safetensors', 'HunyuanVideo1.5_i2v_fp16.safetensors']
      },
      {
        type: 'clip',
        name: 'CLIP-L Text Encoder',
        description: 'CLIP-L text encoder',
        required: true,
        defaultModel: 'clip_l.safetensors',
        alternatives: ['clip-vit-large-patch14.safetensors']
      },
      {
        type: 'clip',
        name: 'LLaVA-LLaMA3 Encoder',
        description: 'LLaVA-LLaMA3 text encoder for Hunyuan',
        required: true,
        defaultModel: 'llava_llama3_fp8_scaled.safetensors',
        alternatives: ['llava-llama-3-8b-text-encoder-tokenizer.safetensors']
      },
      {
        type: 'vae',
        name: 'Hunyuan Video VAE',
        description: '3D VAE for Hunyuan Video',
        required: true,
        defaultModel: 'hunyuan_video_vae_bf16.safetensors',
        alternatives: ['hunyuan_video_vae_fp16.safetensors']
      }
    ],
    requiredNodes: [
      'DualCLIPLoader',
      'Load Diffusion Model',
      'Load VAE',
      'Load Image',
      'CLIP Text Encoder',
      'HunyuanImageToVideoLatent'
    ],
    defaultParams: {
      steps: 30,
      cfg: 6.0,
      sampler: 'euler',
      scheduler: 'normal',
      numFrames: 129,
      fps: 24,
      resolution: '1280x720'
    },
    available: true
  },
  {
    id: 'cogvideox_t2v',
    name: 'CogVideoX Text-to-Video',
    type: 'cogvideox',
    description: 'Text-to-video generation using CogVideoX',
    requiredModels: [
      {
        type: 'video_model',
        name: 'CogVideoX',
        description: 'CogVideoX 5B model',
        required: true,
        defaultModel: 'cogvideox_5b.safetensors',
        alternatives: ['CogVideoX_5b_fp16.safetensors']
      }
    ],
    requiredNodes: [
      'CogVideoXLoader',
      'CogVideoXSampler'
    ],
    defaultParams: {
      steps: 50,
      cfg: 6.0,
      numFrames: 49,
      fps: 8,
      resolution: '720x480'
    },
    available: false  // Not yet implemented
  }
];

/**
 * Default ComfyUI settings
 */
export const DEFAULT_COMFYUI_SETTINGS: ComfyUISettings = {
  nodeAssignments: [],
  defaultWorkflow: 'holocine',
  modelMappings: {},
  autoValidateModels: true,
  defaultNegativePrompt: 'blurry, low quality, distorted, deformed, bad anatomy, watermark, text, logo',
  maxConcurrentRenders: 1,
  autoRetryFailed: true,
  retryAttempts: 2
};

/**
 * Get workflow by ID
 */
export function getWorkflowById(id: string): ComfyUIWorkflow | undefined {
  return PREDEFINED_WORKFLOWS.find(w => w.id === id);
}

/**
 * Get workflows by type
 */
export function getWorkflowsByType(type: ComfyUIWorkflowType): ComfyUIWorkflow[] {
  return PREDEFINED_WORKFLOWS.filter(w => w.type === type && w.available);
}

/**
 * Check if a model name matches a requirement
 */
export function modelMatchesRequirement(
  modelName: string,
  requirement: WorkflowModelRequirement
): boolean {
  const normalizedModel = modelName.toLowerCase();
  const normalizedDefault = requirement.defaultModel?.toLowerCase() || '';

  // Check exact match
  if (normalizedModel === normalizedDefault) return true;

  // Check alternatives
  if (requirement.alternatives) {
    for (const alt of requirement.alternatives) {
      if (normalizedModel === alt.toLowerCase()) return true;
      // Partial match (model name contains alternative)
      if (normalizedModel.includes(alt.toLowerCase().replace('.safetensors', ''))) return true;
    }
  }

  // Partial match on default
  const defaultBase = normalizedDefault.replace('.safetensors', '').replace('.gguf', '');
  if (defaultBase && normalizedModel.includes(defaultBase)) return true;

  return false;
}

/**
 * Validate that a ComfyUI node has the required models for a workflow
 */
export function validateWorkflowModels(
  workflowId: string,
  comfyUIData: {
    checkpoints?: string[];
    vaes?: string[];
    loras?: string[];
    clipModels?: string[];
    unets?: string[];
    customNodes?: string[];
    embeddings?: string[];
  }
): ModelValidationResult {
  const workflow = getWorkflowById(workflowId);

  if (!workflow) {
    return {
      workflow: workflowId,
      isValid: false,
      availableModels: [],
      missingModels: [{
        type: 'checkpoint',
        name: 'Workflow not found',
        description: 'The specified workflow could not be found',
        required: true
      }],
      missingNodes: [],
      warnings: [],
    };
  }

  const availableModels: string[] = [];
  const missingModels: WorkflowModelRequirement[] = [];
  const missingNodes: string[] = [];

  // Combine all available models from comfyUIData
  const allAvailableModels = [
    ...(comfyUIData.checkpoints || []),
    ...(comfyUIData.vaes || []),
    ...(comfyUIData.loras || []),
    ...(comfyUIData.clipModels || []),
    ...(comfyUIData.unets || []),
  ];

  // Check each required model
  for (const requirement of workflow.requiredModels) {
    if (!requirement.required) continue;

    const found = allAvailableModels.some(model =>
      modelMatchesRequirement(model, requirement)
    );

    if (found) {
      availableModels.push(requirement.name);
    } else {
      missingModels.push(requirement);
    }
  }

  // Check required nodes (custom nodes)
  // For now, we don't have a reliable way to check custom nodes
  // This would require checking the /object_info response for node availability

  return {
    workflow: workflowId,
    isValid: missingModels.length === 0 && missingNodes.length === 0,
    availableModels,
    missingModels,
    missingNodes,
    warnings: [],
  };
}
