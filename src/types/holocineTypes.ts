/**
 * HoloCine Types
 *
 * Types for integrating with HoloCine multi-shot video generation.
 * HoloCine generates coherent multi-shot videos with consistent characters
 * across shots within a scene.
 *
 * Key concepts:
 * - Scene: A coherent sequence of shots (max ~15 seconds / 241 frames)
 * - Global Caption: Describes entire scene, characters, and setting
 * - Shot Captions: Individual shot descriptions using [characterX] references
 * - Shot Cuts: Frame positions where scene transitions occur
 */

/**
 * Maps our character to a HoloCine character reference
 * HoloCine uses [character1], [character2], etc. for consistency
 */
export interface HoloCineCharacterRef {
  id: string;                    // Our character ID
  holoCineRef: string;           // e.g., "[character1]", "[character2]"
  refNumber: number;             // e.g., 1, 2, 3 for ordering
  name: string;                  // Display name (e.g., "Sarah")
  description: string;           // Physical description for global caption
  visualPrompt?: string;         // Full visual prompt from character analysis
}

/**
 * A HoloCine scene - a coherent sequence of shots that will be
 * generated as a single video clip
 */
export interface HoloCineScene {
  id: string;
  sceneNumber: number;
  title: string;

  // Core HoloCine fields
  globalCaption: string;         // Scene + character descriptions
  shotCaptions: string[];        // Per-shot descriptions using [characterX] refs
  shotCutFrames?: number[];      // Optional custom cut positions (auto-calculated if not provided)

  // Generation settings
  numFrames: 241 | 81;           // 241 = ~15s, 81 = ~5s
  resolution: HoloCineResolution;
  fps: number;                   // Typically 16 for HoloCine

  // Metadata
  characters: HoloCineCharacterRef[];  // Characters appearing in this scene
  primaryLocation: string;       // Main location name
  locationDescription: string;   // Location details for global caption
  estimatedDuration: number;     // Duration in seconds

  // Linked to our data model
  shotIds: string[];             // Our shot IDs that comprise this scene
  partNumber?: number;           // Story part this scene belongs to
  partTitle?: string;            // Story part title

  // Generation status
  status: 'draft' | 'ready' | 'generating' | 'completed' | 'failed';
  videoUrl?: string;
  thumbnailUrl?: string;
  generatedAt?: Date;
  error?: string;
}

/**
 * Supported resolutions for HoloCine generation
 */
export type HoloCineResolution =
  | '832x480'   // Landscape (recommended)
  | '480x832'   // Portrait
  | '832x832';  // Square

/**
 * Export format for HoloCine prompts
 */
export interface HoloCineExport {
  format: 'raw_string' | 'structured';
  scenes: HoloCineSceneExport[];
  negativePrompt: string;
  generationSettings: HoloCineGenerationSettings;
  metadata: {
    storyId: string;
    storyTitle: string;
    totalScenes: number;
    totalDuration: number;
    exportedAt: Date;
  };
}

/**
 * Single scene export data
 */
export interface HoloCineSceneExport {
  sceneNumber: number;
  title: string;

  // Raw string format: "[global caption] ... [per shot caption] ... [shot cut] ..."
  rawString: string;

  // Structured format for ComfyUI nodes
  structured: {
    global_caption: string;
    shot_captions: string[];
    num_frames: number;
    shot_cut_frames?: number[];
  };

  // Additional metadata
  duration: number;
  shotCount: number;
  characters: string[];
  location: string;
}

/**
 * Generation settings for HoloCine
 */
export interface HoloCineGenerationSettings {
  attention: 'full' | 'sparse';     // Full attention = better quality, Sparse = faster
  basePrecision: 'fp16' | 'fp32';   // fp32 needed for some LoRAs
  useLora?: string;                  // Optional LoRA path
  resolution: HoloCineResolution;
  numFrames: 241 | 81;
}

/**
 * Configuration for scene organization
 */
export interface HoloCineSceneConfig {
  // Duration settings
  maxSceneDuration: number;          // Max seconds per scene (default: 15)
  minSceneDuration: number;          // Min seconds per scene (default: 3)
  preferredDuration: number;         // Target duration (default: 12)

  // Grouping strategy
  groupByPart: boolean;              // Keep story parts as scenes (default: true)
  autoSplitLongScenes: boolean;      // Auto-split if exceeds max (default: true)
  allowMergeScenes: boolean;         // Allow merging adjacent scenes (default: true)

  // Character handling
  maxCharactersPerScene: number;     // Max characters for clarity (default: 4)

  // Token management
  maxGlobalCaptionTokens: number;    // Max tokens for global caption (default: 200)
  maxShotCaptionTokens: number;      // Max tokens per shot caption (default: 50)
}

/**
 * Default configuration
 */
export const DEFAULT_HOLOCINE_CONFIG: HoloCineSceneConfig = {
  maxSceneDuration: 15,
  minSceneDuration: 3,
  preferredDuration: 12,
  groupByPart: true,
  autoSplitLongScenes: true,
  allowMergeScenes: true,
  maxCharactersPerScene: 4,
  maxGlobalCaptionTokens: 200,
  maxShotCaptionTokens: 50,
};

/**
 * Default generation settings
 */
export const DEFAULT_HOLOCINE_GENERATION_SETTINGS: HoloCineGenerationSettings = {
  attention: 'full',
  basePrecision: 'fp16',
  resolution: '832x480',
  numFrames: 241,
};

/**
 * Helper to create a raw string prompt from scene data
 */
export function buildRawPromptString(
  globalCaption: string,
  shotCaptions: string[]
): string {
  let result = `[global caption] ${globalCaption}`;

  shotCaptions.forEach((caption, index) => {
    if (index === 0) {
      result += ` [per shot caption] ${caption}`;
    } else {
      result += ` [shot cut] ${caption}`;
    }
  });

  return result;
}

/**
 * Estimate token count for a string (rough approximation)
 * ~4 characters per token for English text
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Check if a scene's prompts are within token limits
 */
export function checkTokenLimits(
  globalCaption: string,
  shotCaptions: string[],
  maxTokens: number = 512
): { isValid: boolean; totalTokens: number; excess: number } {
  const globalTokens = estimateTokenCount(globalCaption);
  const shotTokens = shotCaptions.reduce((sum, caption) => sum + estimateTokenCount(caption), 0);
  const totalTokens = globalTokens + shotTokens;

  return {
    isValid: totalTokens <= maxTokens,
    totalTokens,
    excess: Math.max(0, totalTokens - maxTokens),
  };
}
