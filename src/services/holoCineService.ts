/**
 * HoloCine Service
 *
 * Manages conversion of story data to HoloCine format for multi-shot video generation.
 * Handles scene organization, character mapping, and prompt building.
 */

import {
  HoloCineCharacterRef,
  HoloCineScene,
  HoloCineSceneExport,
  HoloCineExport,
  HoloCineSceneConfig,
  HoloCineGenerationSettings,
  DEFAULT_HOLOCINE_CONFIG,
  DEFAULT_HOLOCINE_GENERATION_SETTINGS,
  buildRawPromptString,
  estimateTokenCount,
  checkTokenLimits,
} from '../types/holocineTypes';
import { Shot, Character, StoryLocation, StoryPart, Story } from '../store/useStore';
import { debugService } from './debugService';

class HoloCineService {
  private config: HoloCineSceneConfig;
  private generationSettings: HoloCineGenerationSettings;

  constructor() {
    this.config = { ...DEFAULT_HOLOCINE_CONFIG };
    this.generationSettings = { ...DEFAULT_HOLOCINE_GENERATION_SETTINGS };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<HoloCineSceneConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Update generation settings
   */
  setGenerationSettings(settings: Partial<HoloCineGenerationSettings>): void {
    this.generationSettings = { ...this.generationSettings, ...settings };
  }

  /**
   * Build character reference map - assigns [character1], [character2], etc.
   * Characters are ordered by importance level (highest first)
   */
  buildCharacterMap(characters: Character[]): Map<string, HoloCineCharacterRef> {
    const map = new Map<string, HoloCineCharacterRef>();

    // Sort by importance level (highest first)
    const sortedCharacters = [...characters].sort((a, b) => {
      const aLevel = a.importance_level || 3;
      const bLevel = b.importance_level || 3;
      return bLevel - aLevel;
    });

    sortedCharacters.forEach((char, index) => {
      const refNumber = index + 1;
      const charId = char.id || `char_${char.name}_${index}`;

      map.set(charId, {
        id: charId,
        holoCineRef: `[character${refNumber}]`,
        refNumber,
        name: char.name,
        description: this.buildCharacterDescription(char),
        visualPrompt: char.visualPrompt,
      });
    });

    debugService.info('holocine', `Built character map with ${map.size} characters`);
    return map;
  }

  /**
   * Build a concise character description for the global caption
   */
  private buildCharacterDescription(char: Character): string {
    const parts: string[] = [];

    // Age and gender
    if (char.age_range) parts.push(char.age_range);
    if (char.gender) parts.push(char.gender);

    // Physical description
    if (char.physical_description) {
      parts.push(char.physical_description);
    }

    // Clothing
    if (char.clothing) {
      parts.push(`wearing ${char.clothing}`);
    }

    // Distinctive features
    if (char.distinctiveFeatures && char.distinctiveFeatures.length > 0) {
      parts.push(`with ${char.distinctiveFeatures.slice(0, 2).join(' and ')}`);
    }

    return parts.join(', ');
  }

  /**
   * Create scenes from story parts
   * By default, each story part becomes one HoloCine scene
   */
  createScenesFromParts(
    storyParts: StoryPart[],
    shots: Shot[],
    characters: Character[],
    locations: StoryLocation[]
  ): HoloCineScene[] {
    const characterMap = this.buildCharacterMap(characters);
    const scenes: HoloCineScene[] = [];

    // If no story parts, treat all shots as one scene
    if (!storyParts || storyParts.length === 0) {
      const scene = this.createSceneFromShots(
        shots,
        characterMap,
        locations,
        1,
        'Full Scene'
      );
      if (scene) scenes.push(scene);
      return scenes;
    }

    // Create one scene per story part
    storyParts.forEach((part, index) => {
      // Handle both camelCase (partNumber) and snake_case (part_number) from AI responses
      const partNum = part.partNumber || (part as any).part_number;

      // Get shots for this part
      const partShots = shots.filter(shot => shot.partNumber === partNum);

      if (partShots.length === 0) {
        debugService.warn('holocine', `No shots found for part ${partNum}`);
        return;
      }

      // Extract scene_setting from the first shot's metadata if available (set during shot generation)
      const sceneSetting = (partShots[0] as any)?.scene_setting || (partShots[0] as any)?.sceneSetting;

      const scene = this.createSceneFromShots(
        partShots,
        characterMap,
        locations,
        index + 1,
        part.title || (part as any).title,
        partNum,
        sceneSetting
      );

      if (scene) {
        // Check if scene needs to be split
        if (this.config.autoSplitLongScenes && scene.estimatedDuration > this.config.maxSceneDuration) {
          const splitScenes = this.splitSceneByDuration(scene, this.config.maxSceneDuration);
          scenes.push(...splitScenes);
        } else {
          scenes.push(scene);
        }
      }
    });

    debugService.info('holocine', `Created ${scenes.length} scenes from ${storyParts.length} parts`);
    return scenes;
  }

  /**
   * Create a single scene from a set of shots
   */
  private createSceneFromShots(
    shots: Shot[],
    characterMap: Map<string, HoloCineCharacterRef>,
    locations: StoryLocation[],
    sceneNumber: number,
    title: string,
    partNumber?: number,
    sceneSetting?: string
  ): HoloCineScene | null {
    if (shots.length === 0) return null;

    // Get characters in these shots
    const sceneCharacterNames = new Set<string>();
    shots.forEach(shot => {
      (shot.characters || []).forEach(name => sceneCharacterNames.add(name));
    });

    // Map character names to our character refs
    const sceneCharacters: HoloCineCharacterRef[] = [];
    characterMap.forEach((ref, id) => {
      if (sceneCharacterNames.has(ref.name)) {
        sceneCharacters.push(ref);
      }
    });

    // Get primary location
    const locationNames = shots.flatMap(s => s.locations || []);
    const primaryLocationName = this.getMostCommonItem(locationNames) || 'Unknown Location';
    const primaryLocation = locations.find(l => l.name === primaryLocationName);

    // Build global caption - use sceneSetting if available (AI-generated for HoloCine)
    const globalCaption = this.buildGlobalCaption(
      sceneCharacters,
      primaryLocation,
      title,
      sceneSetting
    );

    // Build shot captions
    const shotCaptions = shots.map(shot =>
      this.buildShotCaption(shot, characterMap)
    );

    // Calculate duration
    const estimatedDuration = this.calculateSceneDuration(shots);

    // Calculate shot cut frames (evenly distributed)
    const shotCutFrames = this.calculateShotCutFrames(shots, this.generationSettings.numFrames);

    const scene: HoloCineScene = {
      id: `scene_${Date.now()}_${sceneNumber}_${Math.random().toString(36).substr(2, 9)}`,
      sceneNumber,
      title,
      globalCaption,
      shotCaptions,
      shotCutFrames,
      numFrames: this.generationSettings.numFrames,
      resolution: this.generationSettings.resolution,
      fps: 16,
      characters: sceneCharacters,
      primaryLocation: primaryLocationName,
      locationDescription: primaryLocation?.description || '',
      estimatedDuration,
      shotIds: shots.map(s => s.id),
      partNumber,
      partTitle: title,
      status: 'draft',
    };

    // Check token limits
    const tokenCheck = checkTokenLimits(globalCaption, shotCaptions);
    if (!tokenCheck.isValid) {
      debugService.warn('holocine', `Scene ${sceneNumber} exceeds token limit by ${tokenCheck.excess} tokens`);
    }

    return scene;
  }

  /**
   * Build the global caption for a scene
   * Includes scene description, setting, and character appearances
   * If sceneSetting is provided (from AI), it takes priority for the environment description
   */
  buildGlobalCaption(
    characters: HoloCineCharacterRef[],
    location: StoryLocation | undefined,
    sceneTitle: string,
    sceneSetting?: string
  ): string {
    const parts: string[] = [];

    // Scene context - prefer AI-generated sceneSetting if available
    if (sceneSetting) {
      // Use the AI-optimized scene setting directly
      parts.push(sceneSetting);
    } else if (location) {
      parts.push(`The scene takes place in ${location.name}.`);

      // Add atmosphere/time of day if available
      if (location.timeOfDay) {
        parts.push(`It is ${location.timeOfDay}.`);
      }

      // Add brief location description
      if (location.description) {
        // Truncate if too long
        const desc = location.description.length > 100
          ? location.description.substring(0, 100) + '...'
          : location.description;
        parts.push(desc);
      }
    } else {
      parts.push(`Scene: ${sceneTitle}.`);
    }

    // Character descriptions
    characters.forEach(char => {
      parts.push(`${char.holoCineRef} is ${char.name}, ${char.description}.`);
    });

    return parts.join(' ');
  }

  /**
   * Convert a shot description to HoloCine shot caption format
   * Prefers the holocine_caption field if available, otherwise builds from description
   * Replaces character names with [characterX] references
   */
  buildShotCaption(
    shot: Shot,
    characterMap: Map<string, HoloCineCharacterRef>
  ): string {
    // Prefer the AI-generated holocine_caption if available (optimized for HoloCine)
    let caption = (shot as any).holocine_caption || (shot as any).holocineCaption || shot.description;

    // Replace character names with references
    characterMap.forEach((ref, id) => {
      // Replace the name with the reference (case insensitive)
      const regex = new RegExp(`\\b${ref.name}\\b`, 'gi');
      caption = caption.replace(regex, ref.holoCineRef);
    });

    // Only add camera info if not already present and using description fallback
    if (!(shot as any).holocine_caption && !(shot as any).holocineCaption) {
      const cameraInfo = shot.camera || shot.shotType;
      if (cameraInfo && !caption.toLowerCase().includes(cameraInfo.toLowerCase())) {
        caption = `${cameraInfo} of ${caption}`;
      }
    }

    // Truncate if too long (target ~50 tokens = ~200 chars)
    if (caption.length > 200) {
      caption = caption.substring(0, 197) + '...';
    }

    return caption;
  }

  /**
   * Calculate the total duration of shots in a scene
   */
  calculateSceneDuration(shots: Shot[]): number {
    return shots.reduce((total, shot) => total + (shot.duration || 2), 0);
  }

  /**
   * Calculate frame positions for shot cuts
   * Distributes cuts based on shot durations
   */
  calculateShotCutFrames(shots: Shot[], totalFrames: number): number[] {
    if (shots.length <= 1) return [];

    const totalDuration = this.calculateSceneDuration(shots);
    const frames: number[] = [];
    let accumulatedDuration = 0;

    // Calculate frame position for each shot transition (except the last shot)
    for (let i = 0; i < shots.length - 1; i++) {
      accumulatedDuration += shots[i].duration || 2;
      const framePosition = Math.round((accumulatedDuration / totalDuration) * totalFrames);
      frames.push(framePosition);
    }

    return frames;
  }

  /**
   * Split a scene into multiple scenes if it exceeds max duration
   */
  splitSceneByDuration(scene: HoloCineScene, maxDuration: number): HoloCineScene[] {
    if (scene.estimatedDuration <= maxDuration) {
      return [scene];
    }

    const scenes: HoloCineScene[] = [];
    let currentShots: string[] = [];
    let currentCaptions: string[] = [];
    let currentDuration = 0;
    let sceneIndex = 0;

    // We need the original shots to calculate durations
    // For now, we'll split based on caption count as a proxy
    const avgShotDuration = scene.estimatedDuration / scene.shotCaptions.length;

    scene.shotCaptions.forEach((caption, index) => {
      const shotDuration = avgShotDuration;

      if (currentDuration + shotDuration > maxDuration && currentCaptions.length > 0) {
        // Create a new scene with current accumulated shots
        scenes.push({
          ...scene,
          id: `${scene.id}_${sceneIndex}`,
          sceneNumber: scene.sceneNumber + sceneIndex * 0.1,
          title: `${scene.title} (Part ${sceneIndex + 1})`,
          shotCaptions: [...currentCaptions],
          shotIds: [...currentShots],
          estimatedDuration: currentDuration,
          shotCutFrames: undefined, // Will be recalculated
        });

        currentShots = [];
        currentCaptions = [];
        currentDuration = 0;
        sceneIndex++;
      }

      currentShots.push(scene.shotIds[index]);
      currentCaptions.push(caption);
      currentDuration += shotDuration;
    });

    // Add remaining shots as final scene
    if (currentCaptions.length > 0) {
      scenes.push({
        ...scene,
        id: `${scene.id}_${sceneIndex}`,
        sceneNumber: scene.sceneNumber + sceneIndex * 0.1,
        title: sceneIndex > 0 ? `${scene.title} (Part ${sceneIndex + 1})` : scene.title,
        shotCaptions: currentCaptions,
        shotIds: currentShots,
        estimatedDuration: currentDuration,
        shotCutFrames: undefined,
      });
    }

    debugService.info('holocine', `Split scene into ${scenes.length} parts`);
    return scenes;
  }

  /**
   * Merge two adjacent scenes into one
   */
  mergeScenes(scene1: HoloCineScene, scene2: HoloCineScene): HoloCineScene {
    // Combine characters (deduplicate)
    const combinedCharacters = [...scene1.characters];
    scene2.characters.forEach(char => {
      if (!combinedCharacters.find(c => c.id === char.id)) {
        combinedCharacters.push(char);
      }
    });

    // Update global caption to include all characters
    const globalCaption = this.mergeGlobalCaptions(scene1.globalCaption, scene2.globalCaption);

    return {
      ...scene1,
      id: `${scene1.id}_merged`,
      title: `${scene1.title} + ${scene2.title}`,
      globalCaption,
      shotCaptions: [...scene1.shotCaptions, ...scene2.shotCaptions],
      shotIds: [...scene1.shotIds, ...scene2.shotIds],
      characters: combinedCharacters,
      estimatedDuration: scene1.estimatedDuration + scene2.estimatedDuration,
      shotCutFrames: undefined, // Will be recalculated
    };
  }

  /**
   * Merge two global captions, avoiding redundancy
   */
  private mergeGlobalCaptions(caption1: string, caption2: string): string {
    // Simple merge - in practice, might want AI to rewrite
    // For now, keep the first caption if they're similar
    if (caption1.length >= caption2.length) {
      return caption1;
    }
    return caption2;
  }

  /**
   * Export a single scene to HoloCine format
   */
  exportScene(scene: HoloCineScene): HoloCineSceneExport {
    const rawString = buildRawPromptString(scene.globalCaption, scene.shotCaptions);

    return {
      sceneNumber: scene.sceneNumber,
      title: scene.title,
      rawString,
      structured: {
        global_caption: scene.globalCaption,
        shot_captions: scene.shotCaptions,
        num_frames: scene.numFrames,
        shot_cut_frames: scene.shotCutFrames,
      },
      duration: scene.estimatedDuration,
      shotCount: scene.shotCaptions.length,
      characters: scene.characters.map(c => c.name),
      location: scene.primaryLocation,
    };
  }

  /**
   * Export all scenes from a story
   */
  exportAllScenes(story: Story): HoloCineExport {
    const scenes = story.holoCineScenes || [];

    return {
      format: 'structured',
      scenes: scenes.map(scene => this.exportScene(scene)),
      negativePrompt: this.buildNegativePrompt(),
      generationSettings: this.generationSettings,
      metadata: {
        storyId: story.id,
        storyTitle: story.title,
        totalScenes: scenes.length,
        totalDuration: scenes.reduce((sum, s) => sum + s.estimatedDuration, 0),
        exportedAt: new Date(),
      },
    };
  }

  /**
   * Build a standard negative prompt for HoloCine
   */
  buildNegativePrompt(): string {
    return 'blurry, low quality, distorted, deformed, bad anatomy, extra limbs, ' +
      'missing limbs, bad hands, extra fingers, watermark, text, logo, ' +
      'oversaturated, underexposed, cartoon, anime, illustration';
  }

  /**
   * Create scenes from a complete story (convenience method)
   */
  createScenesFromStory(story: Story): HoloCineScene[] {
    const storyParts = story.storyParts || [];
    const shots = story.shots || [];
    const characters = story.characters || [];
    const locations = story.locations || [];

    // If no story parts, create from shots directly
    if (storyParts.length === 0 && shots.length > 0) {
      // Group shots by partNumber if available
      const partNumbers = Array.from(new Set(shots.map(s => s.partNumber).filter(Boolean)));

      if (partNumbers.length > 0) {
        // Create pseudo-parts from shot groupings
        const pseudoParts: StoryPart[] = partNumbers.map((partNum, index) => ({
          partNumber: partNum!,
          title: `Part ${partNum}`,
          content: '',
          narrativePurpose: 'development' as const,
          durationEstimate: shots
            .filter(s => s.partNumber === partNum)
            .reduce((sum, s) => sum + (s.duration || 2), 0),
        }));

        return this.createScenesFromParts(pseudoParts, shots, characters, locations);
      }

      // No part info at all - create single scene
      const scene = this.createSceneFromShots(
        shots,
        this.buildCharacterMap(characters),
        locations,
        1,
        story.title || 'Scene 1'
      );

      return scene ? [scene] : [];
    }

    return this.createScenesFromParts(storyParts, shots, characters, locations);
  }

  /**
   * Get the most common item in an array
   */
  private getMostCommonItem<T>(items: T[]): T | undefined {
    if (items.length === 0) return undefined;

    const counts = new Map<T, number>();
    items.forEach(item => {
      counts.set(item, (counts.get(item) || 0) + 1);
    });

    let maxCount = 0;
    let mostCommon: T | undefined;
    counts.forEach((count, item) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = item;
      }
    });

    return mostCommon;
  }

  /**
   * Validate a scene's token usage
   */
  validateSceneTokens(scene: HoloCineScene): {
    isValid: boolean;
    globalTokens: number;
    shotTokens: number;
    totalTokens: number;
    maxTokens: number;
    suggestions?: string[];
  } {
    const maxTokens = 512;
    const globalTokens = estimateTokenCount(scene.globalCaption);
    const shotTokens = scene.shotCaptions.reduce(
      (sum, caption) => sum + estimateTokenCount(caption),
      0
    );
    const totalTokens = globalTokens + shotTokens;
    const isValid = totalTokens <= maxTokens;

    const suggestions: string[] = [];
    if (!isValid) {
      if (globalTokens > 200) {
        suggestions.push('Consider shortening character descriptions in global caption');
      }
      if (scene.shotCaptions.length > 6) {
        suggestions.push('Consider splitting into multiple scenes');
      }
      const avgShotTokens = shotTokens / scene.shotCaptions.length;
      if (avgShotTokens > 50) {
        suggestions.push('Shot captions are verbose - consider condensing');
      }
    }

    return {
      isValid,
      globalTokens,
      shotTokens,
      totalTokens,
      maxTokens,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }
}

// Export singleton instance
export const holoCineService = new HoloCineService();
export default holoCineService;
