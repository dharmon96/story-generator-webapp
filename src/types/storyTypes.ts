export interface EnhancedShot {
  id: string;
  shotNumber: number;
  title: string;
  description: string;
  duration: number;
  
  // Camera and cinematography
  cameraMovement: string;
  shotType: 'wide' | 'medium' | 'close-up' | 'extreme-close' | 'establishing' | 'tracking' | 'panning';
  angle: 'eye-level' | 'low-angle' | 'high-angle' | 'birds-eye' | 'worms-eye';
  
  // Visual elements
  visualPrompt?: string;
  comfyUIPositivePrompt?: string; // ComfyUI positive prompt for generation
  comfyUINegativePrompt?: string; // ComfyUI negative prompt for generation
  characters: string[]; // Character names appearing in this shot
  locations: string[]; // Location names used in this shot
  actions: string[]; // Descriptive actions happening
  
  // Audio elements
  narration?: string;
  dialogue?: DialogueLine[];
  musicCue?: string;
  soundEffects?: string[];
  
  // Rendering status
  renderStatus: 'pending' | 'prompt-generated' | 'rendering' | 'completed' | 'failed';
  renderUrl?: string;
  renderPrompt?: string;
  
  // Metadata
  estimatedTokens?: number;
  complexity?: 'simple' | 'moderate' | 'complex';
  createdAt: Date;
  updatedAt?: Date;
}

export interface DialogueLine {
  character: string;
  text: string;
  emotion?: string;
  timing?: number; // seconds into the shot
}

export interface EnhancedCharacter {
  id: string;
  name: string;
  role: 'protagonist' | 'antagonist' | 'supporting' | 'background';
  
  // Physical description
  physicalDescription: string;
  age: string;
  gender: string;
  height?: string;
  build?: string;
  ethnicity?: string;
  
  // Visual characteristics
  clothing: string;
  distinctiveFeatures: string[];
  colorScheme?: string[];
  
  // Personality and behavior
  personality: string;
  motivations: string[];
  backstory?: string;
  
  // Consistency tracking
  visualPrompt: string; // For consistent character generation
  referenceImages?: string[];
  appearanceInShots: string[]; // Shot IDs where this character appears
  
  // Analysis metadata
  importanceLevel: 1 | 2 | 3 | 4 | 5; // 5 being most important
  screenTime: number; // estimated seconds
  createdAt: Date;
  updatedAt?: Date;
}

export interface Location {
  id: string;
  name: string;
  type: 'interior' | 'exterior' | 'mixed';
  
  // Visual description
  description: string;
  atmosphere: string;
  lighting: 'natural' | 'artificial' | 'mixed' | 'dramatic' | 'soft';
  timeOfDay: 'dawn' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night' | 'variable';
  weather?: string;
  
  // Visual characteristics
  visualStyle: string;
  colorPalette: string[];
  keyElements: string[]; // Important visual elements to maintain
  
  // Consistency tracking
  visualPrompt: string;
  referenceImages?: string[];
  usedInShots: string[]; // Shot IDs that use this location
  
  // Metadata
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
  createdAt: Date;
  updatedAt?: Date;
}

export interface MusicCue {
  id: string;
  name: string;
  description: string;
  mood: string;
  genre: string;
  tempo: 'slow' | 'moderate' | 'fast' | 'variable';
  instruments: string[];
  duration: number;
  
  // Usage tracking
  usedInShots: string[];
  startTime?: number;
  fadeIn?: boolean;
  fadeOut?: boolean;
  
  // Generation data
  generationPrompt: string;
  audioUrl?: string;
  generationStatus: 'pending' | 'generating' | 'completed' | 'failed';
  
  createdAt: Date;
  updatedAt?: Date;
}

export interface AILogEntry {
  id: string;
  timestamp: Date;
  step: string;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
  details?: any;
  model?: string;
  processingTime?: number;
  tokensUsed?: number;
}

export interface EnhancedStory {
  id: string;
  title: string;
  content: string;
  synopsis?: string;
  genre: string;
  
  // Enhanced story elements
  shots: EnhancedShot[];
  characters: EnhancedCharacter[];
  locations: Location[];
  musicCues: MusicCue[];
  
  // Processing status
  status: 'draft' | 'processing' | 'completed' | 'failed';
  currentStep?: string;
  
  // Generation metadata
  generationConfig?: any;
  aiLogs: AILogEntry[];
  totalProcessingTime?: number;
  totalTokensUsed?: number;
  
  // File outputs
  exports?: {
    video?: string;
    audio?: string;
    script?: string;
    shotlist?: string;
  };
  
  // Timestamps
  createdAt: Date;
  updatedAt?: Date;
  completedAt?: Date;
}

export interface GenerationStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  progress: number;
  startTime?: Date;
  endTime?: Date;
  
  // Step-specific data
  model?: string;
  prompt?: string;
  output?: any;
  error?: string;
  
  // Dependencies
  dependsOn?: string[]; // IDs of steps that must complete first
  
  // Resource usage
  tokensUsed?: number;
  processingTime?: number;
  memoryUsed?: number;
}

export const PIPELINE_STEPS = {
  STORY_GENERATION: 'story_generation',
  SHOT_BREAKDOWN: 'shot_breakdown', 
  CHARACTER_ANALYSIS: 'character_analysis',
  LOCATION_ANALYSIS: 'location_analysis',
  VISUAL_PROMPT_GENERATION: 'visual_prompt_generation',
  NARRATION_PROCESSING: 'narration_processing',
  MUSIC_CUE_GENERATION: 'music_cue_generation',
  CHARACTER_RENDERING: 'character_rendering',
  LOCATION_RENDERING: 'location_rendering',
  SHOT_RENDERING: 'shot_rendering',
  FINAL_COMPILATION: 'final_compilation',
} as const;

export type PipelineStep = typeof PIPELINE_STEPS[keyof typeof PIPELINE_STEPS];