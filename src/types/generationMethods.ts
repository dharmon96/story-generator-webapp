/**
 * Generation Methods
 *
 * Defines different video generation pipelines based on the target model.
 * Each method has its own workflow optimized for the underlying video generation system.
 */

/**
 * Available generation methods
 */
export type GenerationMethodId =
  | 'holocine'      // HoloCine: Scene-based multi-shot generation
  | 'wan22'         // Wan 2.2: Shot-by-shot generation
  | 'kling'         // Kling: Shot-by-shot generation
  | 'cogvideox'     // CogVideoX: Shot-by-shot generation
  | 'custom';       // Custom: User-defined pipeline

/**
 * Pipeline type determines the primary output structure
 */
export type PipelineType = 'scene-based' | 'shot-based';

/**
 * Generation method definition
 */
export interface GenerationMethod {
  id: GenerationMethodId;
  name: string;
  description: string;
  pipelineType: PipelineType;

  // Visual representation
  icon: string;              // Icon name or emoji
  previewImage?: string;     // Path to preview/thumbnail image
  color: string;             // Theme color for the card

  // Capabilities
  features: {
    multiShot: boolean;              // Can generate multiple shots in one go
    characterConsistency: boolean;   // Maintains character appearance across shots
    maxDuration: number;             // Max clip duration in seconds
    maxShots?: number;               // Max shots per generation (scene-based)
    resolutions: string[];           // Supported resolutions
    fps: number[];                   // Supported frame rates
  };

  // Pipeline configuration
  pipeline: {
    steps: GenerationStep[];         // Ordered list of pipeline steps
    skipSteps?: string[];            // Steps to skip from base pipeline
    requiredSteps: string[];         // Steps that must run for this method
  };

  // Model info
  model: {
    name: string;                    // e.g., "HoloCine", "Wan Video 2.2"
    type: 'local' | 'api' | 'comfyui';
    endpoint?: string;               // API endpoint or ComfyUI workflow
    defaultParams?: Record<string, any>;
  };

  // Status
  available: boolean;                // Is this method currently available
  comingSoon?: boolean;              // Show as "coming soon"
}

/**
 * Individual step in a generation pipeline
 */
export interface GenerationStep {
  id: string;
  name: string;
  description: string;
  required: boolean;
  dependencies: string[];

  // For scene-based vs shot-based handling
  outputType?: 'scenes' | 'shots' | 'both';

  // Task type for queue manager
  taskType: string;
}

/**
 * HoloCine Pipeline Steps
 * Story → Segments → HoloCine Scenes (skip individual shots)
 */
export const HOLOCINE_PIPELINE: GenerationStep[] = [
  {
    id: 'story',
    name: 'Story Generation',
    description: 'Create the narrative structure',
    required: true,
    dependencies: [],
    taskType: 'story'
  },
  {
    id: 'segments',
    name: 'Story Segmentation',
    description: 'Divide story into parts for multi-video production',
    required: true,
    dependencies: ['story'],
    taskType: 'segments'
  },
  {
    id: 'characters',
    name: 'Character Analysis',
    description: 'Extract character descriptions for visual consistency',
    required: true,
    dependencies: ['story'],
    taskType: 'characters'
  },
  {
    id: 'holocine_scenes',
    name: 'HoloCine Scene Creation',
    description: 'Create multi-shot scenes with character references',
    required: true,
    dependencies: ['story', 'segments', 'characters'],
    outputType: 'scenes',
    taskType: 'holocine_scenes_direct'  // New task type: creates scenes directly from story
  },
  {
    id: 'narration',
    name: 'Narration Generation',
    description: 'Create voice-over scripts with timing',
    required: false,
    dependencies: ['holocine_scenes'],
    taskType: 'narration'
  },
  {
    id: 'music',
    name: 'Music Direction',
    description: 'Add musical cues and atmosphere',
    required: false,
    dependencies: ['holocine_scenes'],
    taskType: 'music'
  }
];

/**
 * Shot-Based Pipeline Steps (Wan 2.2, Kling, CogVideoX)
 * Story → Segments → Shots → Prompts
 */
export const SHOT_BASED_PIPELINE: GenerationStep[] = [
  {
    id: 'story',
    name: 'Story Generation',
    description: 'Create the narrative structure',
    required: true,
    dependencies: [],
    taskType: 'story'
  },
  {
    id: 'segments',
    name: 'Story Segmentation',
    description: 'Divide story into parts for multi-video production',
    required: true,
    dependencies: ['story'],
    taskType: 'segments'
  },
  {
    id: 'shots',
    name: 'Shot Breakdown',
    description: 'Create individual shot descriptions with camera directions',
    required: true,
    dependencies: ['story', 'segments'],
    outputType: 'shots',
    taskType: 'shots'
  },
  {
    id: 'characters',
    name: 'Character Analysis',
    description: 'Extract character descriptions for visual consistency',
    required: true,
    dependencies: ['story'],
    taskType: 'characters'
  },
  {
    id: 'prompts',
    name: 'Visual Prompts',
    description: 'Generate ComfyUI-ready prompts for each shot',
    required: true,
    dependencies: ['shots', 'characters'],
    taskType: 'prompts'
  },
  {
    id: 'narration',
    name: 'Narration Generation',
    description: 'Create voice-over scripts with timing',
    required: false,
    dependencies: ['shots'],
    taskType: 'narration'
  },
  {
    id: 'music',
    name: 'Music Direction',
    description: 'Add musical cues and atmosphere',
    required: false,
    dependencies: ['shots'],
    taskType: 'music'
  }
];

/**
 * Available generation methods
 */
export const GENERATION_METHODS: GenerationMethod[] = [
  {
    id: 'holocine',
    name: 'HoloCine',
    description: 'Multi-shot scenes with consistent characters. Best for storytelling with 2-6 shots per scene.',
    pipelineType: 'scene-based',
    icon: '🎬',
    color: '#7c4dff',
    features: {
      multiShot: true,
      characterConsistency: true,
      maxDuration: 15,
      maxShots: 6,
      resolutions: ['832x480', '480x832', '832x832'],
      fps: [16]
    },
    pipeline: {
      steps: HOLOCINE_PIPELINE,
      skipSteps: ['shots', 'prompts'],  // Skip individual shot breakdown
      requiredSteps: ['story', 'segments', 'characters', 'holocine_scenes']
    },
    model: {
      name: 'HoloCine',
      type: 'comfyui',
      endpoint: 'holocine_workflow',
      defaultParams: {
        numFrames: 241,
        resolution: '832x480',
        attention: 'full'
      }
    },
    available: true
  },
  {
    id: 'wan22',
    name: 'Wan Video 2.2',
    description: 'Shot-by-shot generation with high quality. Best for individual shots with precise control.',
    pipelineType: 'shot-based',
    icon: '🎥',
    color: '#00bcd4',
    features: {
      multiShot: false,
      characterConsistency: false,
      maxDuration: 5,
      resolutions: ['832x480', '480x832', '1280x720'],
      fps: [16, 24]
    },
    pipeline: {
      steps: SHOT_BASED_PIPELINE,
      skipSteps: ['holocine_scenes'],
      requiredSteps: ['story', 'segments', 'shots', 'characters', 'prompts']
    },
    model: {
      name: 'Wan Video 2.2',
      type: 'comfyui',
      endpoint: 'wan_video_workflow',
      defaultParams: {
        steps: 30,
        cfg: 7.5
      }
    },
    available: true
  },
  {
    id: 'kling',
    name: 'Kling AI',
    description: 'API-based generation with consistent style. Great for quick iterations.',
    pipelineType: 'shot-based',
    icon: '⚡',
    color: '#ff9800',
    features: {
      multiShot: false,
      characterConsistency: false,
      maxDuration: 5,
      resolutions: ['1280x720', '720x1280'],
      fps: [24]
    },
    pipeline: {
      steps: SHOT_BASED_PIPELINE,
      skipSteps: ['holocine_scenes'],
      requiredSteps: ['story', 'segments', 'shots', 'characters', 'prompts']
    },
    model: {
      name: 'Kling',
      type: 'api',
      endpoint: '/api/kling/generate'
    },
    available: false,
    comingSoon: true
  },
  {
    id: 'cogvideox',
    name: 'CogVideoX',
    description: 'Open-source video generation. Good balance of quality and speed.',
    pipelineType: 'shot-based',
    icon: '🧠',
    color: '#4caf50',
    features: {
      multiShot: false,
      characterConsistency: false,
      maxDuration: 6,
      resolutions: ['720x480', '480x720'],
      fps: [8, 16]
    },
    pipeline: {
      steps: SHOT_BASED_PIPELINE,
      skipSteps: ['holocine_scenes'],
      requiredSteps: ['story', 'segments', 'shots', 'characters', 'prompts']
    },
    model: {
      name: 'CogVideoX',
      type: 'comfyui',
      endpoint: 'cogvideox_workflow'
    },
    available: false,
    comingSoon: true
  }
];

/**
 * Get a generation method by ID
 */
export function getGenerationMethod(id: GenerationMethodId): GenerationMethod | undefined {
  return GENERATION_METHODS.find(m => m.id === id);
}

/**
 * Get available (non-coming-soon) methods
 */
export function getAvailableMethods(): GenerationMethod[] {
  return GENERATION_METHODS.filter(m => m.available && !m.comingSoon);
}

/**
 * Get pipeline steps for a method
 */
export function getPipelineSteps(methodId: GenerationMethodId): GenerationStep[] {
  const method = getGenerationMethod(methodId);
  if (!method) return SHOT_BASED_PIPELINE; // Default
  return method.pipeline.steps;
}

/**
 * Check if a step should run for a given method
 */
export function shouldRunStep(methodId: GenerationMethodId, stepId: string): boolean {
  const method = getGenerationMethod(methodId);
  if (!method) return true;

  // Check if step is in skipSteps
  if (method.pipeline.skipSteps?.includes(stepId)) {
    return false;
  }

  return true;
}
