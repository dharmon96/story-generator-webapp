/**
 * ComfyUI Types
 *
 * Types for ComfyUI workflow configuration, model management, and rendering.
 */

/**
 * Workflow types supported by the application
 */
export type ComfyUIWorkflowType = 'holocine' | 'wan22' | 'hunyuan15' | 'custom';

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
 * Predefined workflows - Only THREE workflows are supported based on comfyui workflows/ folder:
 * 1. Hunyuan Video 1.5 720p T2V
 * 2. Wan 2.2 14B T2V (with LightX2V acceleration)
 * 3. HoloCine (multi-shot with character consistency)
 */
export const PREDEFINED_WORKFLOWS: ComfyUIWorkflow[] = [
  // ============================================
  // HoloCine - Multi-shot video with character consistency
  // Uses: 124201_Holocine_api.json
  // ============================================
  {
    id: 'holocine_native',
    name: 'HoloCine (Multi-Shot)',
    type: 'holocine',
    description: 'Multi-shot video generation with consistent characters. Uses dual-stage HoloCine models with LightX2V acceleration (7 steps: 3+4). Ideal for scenes with multiple shots and consistent characters.',
    requiredModels: [
      {
        type: 'video_model',
        name: 'HoloCine HIGH Model',
        description: 'Wan 2.2 T2V A14B HIGH HoloCine model for high-noise stage',
        required: true,
        defaultModel: 'Wan2_2-T2V-A14B-HIGH-HoloCine-full_fp8_e4m3fn_scaled_KJ.safetensors',
        alternatives: []
      },
      {
        type: 'video_model',
        name: 'HoloCine LOW Model',
        description: 'Wan 2.2 T2V A14B LOW HoloCine model for low-noise stage',
        required: true,
        defaultModel: 'Wan2_2-T2V-A14B-LOW-HoloCine-full_fp8_e4m3fn_scaled_KJ.safetensors',
        alternatives: []
      },
      {
        type: 'clip',
        name: 'UMT5-XXL Text Encoder',
        description: 'UMT5-XXL text encoder (type: wan)',
        required: true,
        defaultModel: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
        alternatives: []
      },
      {
        type: 'vae',
        name: 'Wan 2.1 VAE',
        description: 'VAE for Wan 2.x video models',
        required: true,
        defaultModel: 'wan_2.1_vae.safetensors',
        alternatives: []
      },
      {
        type: 'lora',
        name: 'LightX2V Distill LoRA',
        description: 'LightX2V CFG step distillation LoRA for acceleration',
        required: true,
        defaultModel: 'lightx2v_T2V_14B_cfg_step_distill_v2_lora_rank64_bf16.safetensors',
        alternatives: []
      }
    ],
    requiredNodes: [
      'UNETLoader',
      'CLIPLoader',
      'VAELoader',
      'CLIPTextEncode',
      'EmptyHunyuanLatentVideo',
      'KSamplerAdvanced',
      'ModelSamplingSD3',
      'LoraLoaderModelOnly',
      'VAEDecode',
      'ImageSharpen',
      'VHS_VideoCombine'
    ],
    defaultParams: {
      steps: 7,  // 3 high-noise + 4 low-noise
      cfg: 3.5,  // High-noise CFG (low-noise uses 1)
      sampler: 'euler',
      scheduler: 'simple',
      numFrames: 77,  // ~4.8 seconds at 16fps
      fps: 16,
      resolution: '848x480'
    },
    available: true
  },

  // ============================================
  // Wan 2.2 14B T2V - Fast text-to-video with LightX2V
  // Uses: video_wan2_2_14B_t2v_api.json
  // ============================================
  {
    id: 'wan22_14b_t2v',
    name: 'Wan 2.2 14B T2V (LightX2V)',
    type: 'wan22',
    description: 'Fast text-to-video with Wan 2.2 14B using LightX2V acceleration. Dual-stage sampling with only 4 steps (2+2). Good balance of quality and speed.',
    requiredModels: [
      {
        type: 'video_model',
        name: 'Wan 2.2 14B High-Noise',
        description: 'High-noise stage T2V model',
        required: true,
        defaultModel: 'wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors',
        alternatives: []
      },
      {
        type: 'video_model',
        name: 'Wan 2.2 14B Low-Noise',
        description: 'Low-noise stage T2V model',
        required: true,
        defaultModel: 'wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors',
        alternatives: []
      },
      {
        type: 'clip',
        name: 'UMT5-XXL Text Encoder',
        description: 'UMT5-XXL text encoder (type: wan)',
        required: true,
        defaultModel: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
        alternatives: []
      },
      {
        type: 'vae',
        name: 'Wan 2.1 VAE',
        description: 'VAE for Wan video models',
        required: true,
        defaultModel: 'wan_2.1_vae.safetensors',
        alternatives: []
      },
      {
        type: 'lora',
        name: 'LightX2V High-Noise LoRA',
        description: 'LightX2V 4-step LoRA for high-noise stage',
        required: true,
        defaultModel: 'wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors',
        alternatives: []
      },
      {
        type: 'lora',
        name: 'LightX2V Low-Noise LoRA',
        description: 'LightX2V 4-step LoRA for low-noise stage',
        required: true,
        defaultModel: 'wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors',
        alternatives: []
      }
    ],
    requiredNodes: [
      'UNETLoader',
      'CLIPLoader',
      'VAELoader',
      'CLIPTextEncode',
      'EmptyHunyuanLatentVideo',
      'KSamplerAdvanced',
      'ModelSamplingSD3',
      'LoraLoaderModelOnly',
      'VAEDecode',
      'CreateVideo',
      'SaveVideo'
    ],
    defaultParams: {
      steps: 4,  // 2 high-noise + 2 low-noise
      cfg: 1,  // Both stages use CFG 1
      sampler: 'euler',
      scheduler: 'simple',
      numFrames: 81,  // ~5 seconds at 16fps
      fps: 16,
      resolution: '640x640'
    },
    available: true
  },

  // ============================================
  // Hunyuan Video 1.5 720p T2V
  // Uses: video_hunyuan_video_1.5_720p_t2v_api.json
  // ============================================
  {
    id: 'hunyuan15_t2v',
    name: 'Hunyuan 1.5 720p T2V',
    type: 'hunyuan15',
    description: 'High-quality 720p text-to-video with Hunyuan Video 1.5. Uses SamplerCustomAdvanced with CFGGuider for precise control. 20 steps, 121 frames (~5s at 24fps).',
    requiredModels: [
      {
        type: 'video_model',
        name: 'Hunyuan Video 1.5 T2V',
        description: 'Hunyuan Video 1.5 720p T2V diffusion model',
        required: true,
        defaultModel: 'hunyuanvideo1.5_720p_t2v_fp16.safetensors',
        alternatives: []
      },
      {
        type: 'clip',
        name: 'Qwen 2.5 VL 7B',
        description: 'Qwen 2.5 VL 7B text encoder (clip_name1)',
        required: true,
        defaultModel: 'qwen_2.5_vl_7b_fp8_scaled.safetensors',
        alternatives: []
      },
      {
        type: 'clip',
        name: 'ByT5 Small GlyphXL',
        description: 'ByT5 Small GlyphXL text encoder (clip_name2)',
        required: true,
        defaultModel: 'byt5_small_glyphxl_fp16.safetensors',
        alternatives: []
      },
      {
        type: 'vae',
        name: 'Hunyuan Video 1.5 VAE',
        description: '3D VAE for Hunyuan Video 1.5',
        required: true,
        defaultModel: 'hunyuanvideo15_vae_fp16.safetensors',
        alternatives: []
      }
    ],
    requiredNodes: [
      'UNETLoader',
      'DualCLIPLoader',
      'VAELoader',
      'CLIPTextEncode',
      'EmptyHunyuanVideo15Latent',
      'SamplerCustomAdvanced',
      'BasicScheduler',
      'RandomNoise',
      'KSamplerSelect',
      'CFGGuider',
      'ModelSamplingSD3',
      'VAEDecode',
      'CreateVideo',
      'SaveVideo'
    ],
    defaultParams: {
      steps: 20,
      cfg: 6,
      sampler: 'euler',
      scheduler: 'simple',
      numFrames: 121,  // ~5 seconds at 24fps
      fps: 24,
      resolution: '1280x720'
    },
    available: true
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
