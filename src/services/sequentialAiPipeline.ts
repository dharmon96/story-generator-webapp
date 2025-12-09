import { QueueItem, Story, ModelConfig, useStore, StepCheckpoint } from '../store/useStore';
import { nodeQueueManager } from './nodeQueueManager';
import { debugService } from './debugService';
import { validationService } from './validationService';
import { GenerationMethodId, getGenerationMethod } from '../types/generationMethods';
// Note: We don't use the imported storyDataManager directly, but define our own wrapper below
// that syncs to the Zustand store for live UI updates

/**
 * Story data manager wrapper that syncs to both in-memory cache and the store
 * This ensures live updates in the UI during generation
 */
const storyDataManager = {
  partialStories: new Map<string, Story>(),

  savePartialStory(story: Story) {
    this.partialStories.set(story.id, { ...story });

    // CRITICAL: Also sync to the actual store for live UI updates
    const store = useStore.getState();

    // Convert to store-compatible format
    const storeStory = {
      id: story.id,
      title: story.title || 'Generating...',
      content: story.content || '',
      genre: story.genre || 'Auto',
      shots: (story.shots || []).map((shot: any) => ({
        id: shot.id || `shot_${shot.shotNumber || shot.shot_number}`,
        storyId: story.id,
        shotNumber: shot.shotNumber || shot.shot_number,
        description: shot.description || '',
        duration: shot.duration || 3,
        frames: Math.floor((shot.duration || 3) * 24),
        camera: shot.cameraMovement || shot.camera || 'medium shot',
        visualPrompt: shot.visualPrompt || shot.visual_prompt || '',
        comfyUIPositivePrompt: shot.comfyUIPositivePrompt || '',
        comfyUINegativePrompt: shot.comfyUINegativePrompt || '',
        narration: shot.narration || '',
        musicCue: shot.musicCue || shot.music_cue,
        renderStatus: (shot.renderStatus || 'pending') as 'pending' | 'rendering' | 'completed',
        characters: shot.characters || [],
        locations: shot.locations || [],
        // Part reference for multi-video coherence
        partNumber: shot.partNumber || shot.part_number,
        partTitle: shot.partTitle || shot.part_title
      })),
      characters: (story.characters || []).map((char: any) => ({
        id: char.id || `char_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        name: char.name,
        role: char.role === 'protagonist' ? 'main' : (char.role === 'main' ? 'main' : 'supporting'),
        physical_description: char.physicalDescription || char.physical_description || '',
        age_range: char.age || char.age_range || '',
        gender: char.gender || 'unspecified',
        clothing: char.clothing || char.clothing_style || '',
        distinctiveFeatures: char.distinctiveFeatures || char.distinctive_features || [],
        personality: char.personality || char.personality_traits || '',
        importance_level: char.importanceLevel || char.importance_level || 3,
        screenTime: char.screenTime || char.screen_time || 0,
        visualPrompt: char.visualPrompt || char.visual_prompt || ''
      })),
      locations: (story.locations || []).map((loc: any) => ({
        id: loc.id || `loc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        name: loc.name,
        type: loc.type || loc.environment_type || 'interior',
        description: loc.description || '',
        atmosphere: loc.atmosphere || '',
        lighting: loc.lighting || loc.lighting_style || 'natural',
        timeOfDay: loc.timeOfDay || loc.time_of_day || 'day',
        weather: loc.weather || '',
        keyElements: loc.keyElements || loc.key_elements || [],
        colorPalette: loc.colorPalette || loc.color_palette || [],
        visualPrompt: loc.visualPrompt || loc.visual_prompt || '',
        usedInShots: loc.usedInShots || []
      })),
      // HoloCine scene-based pipeline fields
      holoCineScenes: story.holoCineScenes || undefined,
      holoCineCharacterMap: story.holoCineCharacterMap || undefined,
      generationMethod: story.generationMethod || undefined,
      // Story parts for multi-video architecture
      storyParts: story.storyParts || undefined,
      totalParts: story.totalParts || undefined,
      status: 'generating' as const,
      createdAt: story.createdAt || new Date(),
      updatedAt: new Date()
    };

    // Upsert to store for live UI updates
    store.upsertStory(storeStory);

    // Debug: Log the actual stories in store after update
    const storiesAfterUpdate = useStore.getState().stories;
    const matchingStory = storiesAfterUpdate.find(s => s.id === story.id);

    // Count shots with prompts for debugging
    const shotsWithPositivePrompt = storeStory.shots.filter((s: any) => s.comfyUIPositivePrompt).length;
    const shotsWithNegativePrompt = storeStory.shots.filter((s: any) => s.comfyUINegativePrompt).length;

    debugService.info('pipeline', `📊 [LIVE UPDATE] Story ${story.id} synced to store`, {
      title: storeStory.title,
      hasContent: !!storeStory.content,
      contentLength: storeStory.content?.length || 0,
      shotsCount: storeStory.shots.length,
      shotsWithPositivePrompt,
      shotsWithNegativePrompt,
      charactersCount: storeStory.characters.length,
      holoCineScenesCount: storeStory.holoCineScenes?.length || 0,
      generationMethod: storeStory.generationMethod || 'not set',
      storeHasStory: !!matchingStory,
      totalStoriesInStore: storiesAfterUpdate.length
    });

    console.log(`📊 [LIVE UPDATE] Story ${story.id} synced to store:`, {
      title: storeStory.title,
      hasContent: !!storeStory.content,
      shotsCount: storeStory.shots.length,
      charactersCount: storeStory.characters.length,
      holoCineScenesCount: storeStory.holoCineScenes?.length || 0,
      storeHasStory: !!matchingStory
    });
  },

  getPartialStory(id: string): Story | undefined {
    return this.partialStories.get(id);
  },

  clearPartialStory(id: string) {
    this.partialStories.delete(id);
  }
};

export interface SequentialProgress {
  storyId: string;
  currentStep: string;
  currentStepName: string;
  overallProgress: number;
  stepProgress: number;
  status: 'running' | 'completed' | 'failed';
  logs: Array<{
    id: string;
    timestamp: Date;
    step: string;
    level: 'info' | 'warn' | 'error' | 'success';
    message: string;
    details?: any;
  }>;
  assignedNode?: string;
  currentModel?: string;
}

interface StepDefinition {
  id: string;
  name: string;
  required: boolean;
  dependencies?: string[]; // Steps that must be completed first
  configCheck?: (config: any) => boolean;
}

class SequentialAiPipelineService {
  private activeProcesses = new Map<string, SequentialProgress>();
  private progressCallbacks = new Map<string, (progress: SequentialProgress) => void>();
  private nodeAssignments = new Map<string, { storyId: string; stepId: string; model: string; startTime: Date }>();
  private globalNodeBusyStatus = new Map<string, boolean>(); // Global tracking of node busy status
  private abortControllers = new Map<string, AbortController>(); // Track abort controllers per story
  private stepStartTimes = new Map<string, number>(); // Track step start times for duration calculation

  /**
   * Save or update a checkpoint for a story's pipeline execution
   */
  private saveStepCheckpoint(
    storyId: string,
    queueItemId: string,
    stepId: string,
    status: 'started' | 'completed' | 'failed',
    output?: any,
    error?: string
  ): void {
    const store = useStore.getState();
    const stepKey = `${storyId}_${stepId}`;

    if (status === 'started') {
      // Record step start time
      this.stepStartTimes.set(stepKey, Date.now());

      // Initialize or update checkpoint with current step
      const existing = store.checkpoints[storyId];
      if (existing) {
        store.updateCheckpointStep(storyId, stepId, {});
      } else {
        store.saveCheckpoint({
          storyId,
          queueItemId,
          completedSteps: [],
          currentStep: stepId,
          stepData: {},
          lastUpdated: new Date(),
          resumeCount: 0
        });
      }
      debugService.info('checkpoint', `📍 Checkpoint: Starting step '${stepId}' for story ${storyId}`);
    } else if (status === 'completed') {
      // Calculate duration
      const startTime = this.stepStartTimes.get(stepKey);
      const duration = startTime ? Date.now() - startTime : 0;
      this.stepStartTimes.delete(stepKey);

      // Update checkpoint with completed step
      store.updateCheckpointStep(storyId, stepId, {
        completedAt: new Date(),
        duration,
        output: output ? { type: typeof output, keys: Object.keys(output || {}).slice(0, 5) } : undefined
      });
      debugService.success('checkpoint', `✅ Checkpoint: Completed step '${stepId}' for story ${storyId} (${(duration / 1000).toFixed(1)}s)`);
    } else if (status === 'failed') {
      // Calculate duration
      const startTime = this.stepStartTimes.get(stepKey);
      const duration = startTime ? Date.now() - startTime : 0;
      this.stepStartTimes.delete(stepKey);

      // Update checkpoint with failed step
      store.updateCheckpointStep(storyId, stepId, {
        completedAt: new Date(),
        duration,
        error: error || 'Unknown error'
      });
      debugService.error('checkpoint', `❌ Checkpoint: Failed step '${stepId}' for story ${storyId}: ${error}`);
    }
  }

  /**
   * Get the checkpoint for a story to determine resume point
   */
  getCheckpoint(storyId: string): StepCheckpoint | null {
    return useStore.getState().checkpoints[storyId] || null;
  }

  /**
   * Clear checkpoint after successful completion
   */
  clearCheckpoint(storyId: string): void {
    useStore.getState().clearCheckpoint(storyId);
    debugService.info('checkpoint', `🗑️ Cleared checkpoint for story ${storyId}`);
  }

  /**
   * Resume processing from checkpoint
   * Returns the step to resume from, or null if no checkpoint exists
   */
  async resumeFromCheckpoint(
    queueItem: QueueItem,
    modelConfigs: ModelConfig[],
    onProgress?: (progress: SequentialProgress) => void
  ): Promise<Story | null> {
    const checkpoint = this.getCheckpoint(queueItem.id);
    if (!checkpoint) {
      debugService.warn('checkpoint', `No checkpoint found for story ${queueItem.id}, starting fresh`);
      return null;
    }

    debugService.info('checkpoint', `🔄 Resuming from checkpoint for story ${queueItem.id}`, {
      completedSteps: checkpoint.completedSteps,
      currentStep: checkpoint.currentStep,
      resumeCount: checkpoint.resumeCount
    });

    // Increment resume count
    useStore.getState().incrementResumeCount(queueItem.id);

    // Process with resume flag
    // The processQueueItem will need to check for checkpoint and skip completed steps
    // For now, we'll just restart - full resume implementation would require significant refactoring
    // TODO: Implement true step-skipping based on checkpoint.completedSteps
    return this.processQueueItem(queueItem, modelConfigs, onProgress);
  }

  /**
   * Restart processing from the beginning (clears checkpoint first)
   */
  async restartProcessing(
    queueItem: QueueItem,
    modelConfigs: ModelConfig[],
    onProgress?: (progress: SequentialProgress) => void
  ): Promise<Story> {
    // Clear any existing checkpoint
    this.clearCheckpoint(queueItem.id);

    debugService.info('checkpoint', `🔄 Restarting processing from beginning for story ${queueItem.id}`);

    return this.processQueueItem(queueItem, modelConfigs, onProgress);
  }

  // Stop processing a specific story
  stopProcessing(storyId: string): void {
    const abortController = this.abortControllers.get(storyId);
    if (abortController) {
      debugService.warn('pipeline', `🛑 Aborting processing for story ${storyId}`);
      abortController.abort('Processing stopped by user');
      this.abortControllers.delete(storyId);
    }
    
    // Clean up process state
    this.activeProcesses.delete(storyId);
    this.progressCallbacks.delete(storyId);
    
    // Release any assigned nodes for this story
    for (const [key, assignment] of Array.from(this.nodeAssignments.entries())) {
      if (assignment.storyId === storyId) {
        const nodeId = key.split('_')[0];
        this.globalNodeBusyStatus.set(nodeId, false);
        this.nodeAssignments.delete(key);
        debugService.info('pipeline', `🔓 Released node ${nodeId} due to processing stop`);
      }
    }
  }

  // Stop all processing
  stopAllProcessing(): void {
    debugService.warn('pipeline', '🛑 Stopping all processing');
    
    // Abort all controllers
    for (const [storyId, abortController] of Array.from(this.abortControllers.entries())) {
      abortController.abort('All processing stopped by user');
    }
    this.abortControllers.clear();
    
    // Clean up all state
    this.activeProcesses.clear();
    this.progressCallbacks.clear();
    this.nodeAssignments.clear();
    this.globalNodeBusyStatus.clear();
  }

  async processQueueItem(
    queueItem: QueueItem,
    modelConfigs: ModelConfig[],
    onProgress?: (progress: SequentialProgress) => void
  ): Promise<Story> {
    // Set model configs in nodeQueueManager
    nodeQueueManager.setModelConfigs(modelConfigs);
    
    // Create abort controller for this processing session
    const abortController = new AbortController();
    this.abortControllers.set(queueItem.id, abortController);
    
    const progress: SequentialProgress = {
      storyId: queueItem.id,
      currentStep: 'story',
      currentStepName: 'Story Generation',
      overallProgress: 0,
      stepProgress: 0,
      status: 'running',
      logs: []
    };

    this.activeProcesses.set(queueItem.id, progress);
    if (onProgress) {
      this.progressCallbacks.set(queueItem.id, onProgress);
    }

    // Check if already aborted
    if (abortController.signal.aborted) {
      throw new Error('Processing aborted before start');
    }

    try {
      // Determine generation method from config
      const generationMethod: GenerationMethodId = queueItem.config.generationMethod || 'holocine';
      const methodInfo = getGenerationMethod(generationMethod);

      debugService.info('pipeline', `🚀 Starting ${generationMethod.toUpperCase()} pipeline for: ${queueItem.config.prompt.slice(0, 50)}...`, {
        method: generationMethod,
        pipelineType: methodInfo?.pipelineType || 'unknown'
      });

      // Define processing steps based on generation method
      // SCENE-BASED (HoloCine): Story → Segments → Characters → HoloCine Scenes (skips individual shots)
      // SHOT-BASED (Wan/Kling): Story → Segments → Shots → Characters → Prompts

      let steps: StepDefinition[];

      if (methodInfo?.pipelineType === 'scene-based') {
        // HoloCine Native Pipeline - create scenes directly from story
        debugService.info('pipeline', '🎬 Using SCENE-BASED pipeline (HoloCine native)');
        steps = [
          {
            id: 'story',
            name: 'Story Generation',
            required: true,
            dependencies: []
          },
          {
            id: 'segments',
            name: 'Story Segmentation',
            required: true,
            dependencies: ['story']
          },
          {
            id: 'characters',
            name: 'Character Analysis',
            required: true,
            dependencies: ['story']
          },
          {
            // HoloCine scenes created DIRECTLY from story parts (no shot breakdown)
            id: 'holocine_scenes_direct',
            name: 'HoloCine Scene Creation',
            required: true,
            dependencies: ['story', 'segments', 'characters']
          },
          {
            id: 'narration',
            name: 'Narration Generation',
            required: false,
            dependencies: ['holocine_scenes_direct'],
            configCheck: (config) => config.narrationGeneration
          },
          {
            id: 'music',
            name: 'Music Cue Generation',
            required: false,
            dependencies: ['holocine_scenes_direct'],
            configCheck: (config) => config.musicGeneration
          }
        ];
      } else {
        // Shot-Based Pipeline (Wan 2.2, Kling, CogVideoX)
        debugService.info('pipeline', '🎥 Using SHOT-BASED pipeline (Wan/Kling)');
        steps = [
          {
            id: 'story',
            name: 'Story Generation',
            required: true,
            dependencies: []
          },
          {
            id: 'segments',
            name: 'Story Segmentation',
            required: true,
            dependencies: ['story']
          },
          {
            id: 'shots',
            name: 'Shot Breakdown',
            required: true,
            dependencies: ['story', 'segments']
          },
          {
            id: 'characters',
            name: 'Character Analysis',
            required: true,
            dependencies: ['story']
          },
          {
            id: 'prompts',
            name: 'Visual Prompts (ComfyUI)',
            required: true,
            dependencies: ['shots', 'characters']
          },
          {
            id: 'narration',
            name: 'Narration Generation',
            required: false,
            dependencies: ['shots'],
            configCheck: (config) => config.narrationGeneration
          },
          {
            id: 'music',
            name: 'Music Cue Generation',
            required: false,
            dependencies: ['shots'],
            configCheck: (config) => config.musicGeneration
          }
        ];
      }

      // Filter steps based on configuration
      const activeSteps = steps.filter(step => {
        if (step.required) return true;
        return step.configCheck ? step.configCheck(queueItem.config) : false;
      });

      debugService.info('pipeline', `📋 Processing ${activeSteps.length} steps: ${activeSteps.map(s => s.name).join(', ')}`);

      let story: any = null;
      let storyParts: any[] = [];
      let shots: any[] = [];
      let characters: any[] = [];
      let locations: any[] = [];
      let partialStory: Story | null = null;
      const completedSteps = new Set<string>(); // Track completed steps for dependency validation

      // Process each step sequentially with dependency validation
      for (let i = 0; i < activeSteps.length; i++) {
        const step = activeSteps[i];
        const overallProgress = Math.round((i / activeSteps.length) * 100);
        
        // Check for abort signal before each step
        if (abortController.signal.aborted) {
          throw new Error('Processing aborted by user');
        }

        // Validate dependencies before proceeding
        if (step.dependencies && step.dependencies.length > 0) {
          const missingDeps = step.dependencies.filter(dep => !completedSteps.has(dep));
          if (missingDeps.length > 0) {
            throw new Error(`Step '${step.id}' cannot proceed: missing dependencies [${missingDeps.join(', ')}]`);
          }
          debugService.info('pipeline', `✅ Dependencies satisfied for step '${step.id}': [${step.dependencies.join(', ')}]`);
        }
        
        this.updateProgress(progress, step.id, step.name, overallProgress, 0);

        const nodeInfo = this.getNextAvailableNode(modelConfigs, step.id, queueItem.id);
        debugService.info('pipeline', `⚙️ Step ${i + 1}/${activeSteps.length}: ${step.name}`, {
          stepId: step.id,
          overallProgress,
          assignedNode: nodeInfo?.name,
          assignedModel: nodeInfo?.model
        });

        // Log step start
        this.addLog(progress, step.id, 'info', `Starting: ${step.name}`, {
          node: nodeInfo?.name,
          model: nodeInfo?.model
        });

        if (nodeInfo) {
          this.assignNode(nodeInfo.id, queueItem.id, step.id, nodeInfo.model);
        }

        // Save checkpoint when step starts
        this.saveStepCheckpoint(queueItem.id, queueItem.id, step.id, 'started');

        try {
        switch (step.id) {
          case 'story':
            story = await this.executeStoryStep(queueItem, nodeInfo, progress);
            
            // Validate story before proceeding
            if (story) {
              const storyValidation = validationService.validateStory(story, 'after story generation');
              validationService.validateOrThrow(storyValidation, 'Story', 'after story generation');
            }
            
            // Create partial story immediately after story generation
            if (story) {
              partialStory = {
                id: queueItem.id,
                title: story.title || 'Untitled Story',
                content: story.content || '',
                genre: queueItem.config.genre,
                shots: [],
                characters: [],
                musicCues: [],
                status: 'generating',
                createdAt: new Date(),
                updatedAt: new Date()
              };
              // Save partial story to data manager
              storyDataManager.savePartialStory(partialStory);
              debugService.info('pipeline', `💾 Saved partial story: ${partialStory.title}`);
            }
            break;
          
          case 'segments':
            if (!story) throw new Error('Story required for segmentation');
            storyParts = await this.executeSegmentationStep(story, queueItem, nodeInfo, progress);

            // Validate parts were generated
            if (!storyParts || storyParts.length === 0) {
              throw new Error('Story segmentation failed to generate any parts');
            }

            // Store story parts in the partial story for reference
            if (partialStory) {
              partialStory.storyParts = storyParts.map((part: any) => ({
                partNumber: part.part_number,
                title: part.title,
                content: part.content,
                narrativePurpose: part.narrative_purpose || 'development',
                durationEstimate: part.duration_estimate || 15
              }));
              partialStory.totalParts = storyParts.length;
              partialStory.updatedAt = new Date();
              storyDataManager.savePartialStory(partialStory);
              debugService.info('pipeline', `💾 Saved ${storyParts.length} story parts to master story`);
            }

            debugService.success('pipeline', `✅ Generated ${storyParts.length} story parts`);
            break;
          
          case 'shots':
            if (!storyParts || storyParts.length === 0) throw new Error('Story parts required for shot breakdown');
            shots = await this.executeShotsForPartsStep(storyParts, story, queueItem, nodeInfo, progress);
            
            // Validate shots were generated (basic check)
            if (!shots || shots.length === 0) {
              throw new Error('Shot breakdown failed to generate any shots');
            }
            
            // Comprehensive shots validation
            const shotsValidation = validationService.validateShots(shots, 'after shot breakdown', 1);
            validationService.validateOrThrow(shotsValidation, 'Shots', 'after shot breakdown');
            
            debugService.success('pipeline', `✅ Generated ${shots.length} total shots from ${storyParts.length} parts`);
            
            // Update partial story with shots
            if (partialStory && shots.length > 0) {
              partialStory.shots = shots;
              partialStory.updatedAt = new Date();
              storyDataManager.savePartialStory(partialStory);
              debugService.info('pipeline', `💾 Updated story with ${shots.length} shots`);
            }
            break;
          
          case 'characters':
            if (!story) throw new Error('Story required for character analysis');
            // executeCharactersStep now returns { characters, locations }
            const analysisResult: any = await this.executeCharactersStep(story, queueItem, nodeInfo, progress);

            // Handle both old format (array) and new format ({ characters, locations })
            if (Array.isArray(analysisResult)) {
              characters = analysisResult;
              locations = [];
            } else {
              characters = analysisResult?.characters || [];
              locations = analysisResult?.locations || [];
            }

            // Validate characters if any were generated
            if (characters && characters.length > 0) {
              const charactersValidation = validationService.validateCharacters(characters, 'after character analysis');
              validationService.validateOrThrow(charactersValidation, 'Characters', 'after character analysis');
            }

            // Update partial story with characters AND locations
            if (partialStory) {
              if (characters.length > 0) {
                partialStory.characters = characters;
              }
              if (locations.length > 0) {
                partialStory.locations = locations;
              }
              partialStory.updatedAt = new Date();
              storyDataManager.savePartialStory(partialStory);
              debugService.info('pipeline', `💾 Updated story with ${characters.length} characters and ${locations.length} locations`);
            }
            break;
          
          case 'prompts':
            if (!shots.length) throw new Error('Shots required for prompt generation');
            // Pass partialStory so it can save after each prompt for live UI updates
            await this.executePromptsStep(shots, characters, queueItem, modelConfigs, progress, partialStory);

            // Debug: Check what prompts are on shots after executePromptsStep
            const shotsWithPositiveAfterStep = shots.filter((s: any) => s.comfyUIPositivePrompt);
            const shotsWithNegativeAfterStep = shots.filter((s: any) => s.comfyUINegativePrompt);
            debugService.info('pipeline', `🎨 After executePromptsStep - shots with prompts:`, {
              total: shots.length,
              withPositive: shotsWithPositiveAfterStep.length,
              withNegative: shotsWithNegativeAfterStep.length,
              firstShotPositive: shots[0]?.comfyUIPositivePrompt?.slice(0, 50) || 'NONE',
              firstShotNegative: shots[0]?.comfyUINegativePrompt?.slice(0, 50) || 'NONE'
            });

            // Validate visual prompts after generation
            const promptsValidation = validationService.validateVisualPrompts(shots, 'after visual prompts generation');
            validationService.validateOrThrow(promptsValidation, 'Visual Prompts', 'after visual prompts generation');

            // Save partial story with updated prompts for live UI updates
            if (partialStory) {
              // Make sure we're using the updated shots array
              partialStory.shots = shots.map((shot: any) => ({
                ...shot,
                // Ensure prompts are copied
                comfyUIPositivePrompt: shot.comfyUIPositivePrompt || '',
                comfyUINegativePrompt: shot.comfyUINegativePrompt || ''
              }));
              partialStory.updatedAt = new Date();

              debugService.info('pipeline', `💾 About to save story with prompts:`, {
                storyId: partialStory.id,
                shotsCount: partialStory.shots.length,
                firstShotHasPositive: !!partialStory.shots[0]?.comfyUIPositivePrompt,
                firstShotHasNegative: !!partialStory.shots[0]?.comfyUINegativePrompt
              });

              storyDataManager.savePartialStory(partialStory);
              debugService.info('pipeline', `💾 Updated story with visual prompts for ${shots.length} shots`);
            }
            break;

          case 'narration':
            // For scene-based pipeline (HoloCine), skip traditional narration
            // HoloCine scenes have global captions and shot captions, not individual shot narrations
            if (partialStory?.holoCineScenes && partialStory.holoCineScenes.length > 0) {
              debugService.info('pipeline', `🗣️ Skipping narration step for HoloCine pipeline - scenes use global/shot captions`);
              // For HoloCine, we could optionally generate a voiceover script from the scene captions
              // For now, we just mark this step as complete
            } else if (shots.length > 0) {
              await this.executeNarrationStep(shots, queueItem, modelConfigs, progress);

              // Save partial story with narration for live UI updates
              if (partialStory) {
                partialStory.shots = shots;
                partialStory.updatedAt = new Date();
                storyDataManager.savePartialStory(partialStory);
                debugService.info('pipeline', `💾 Updated story with narration`);
              }
            } else {
              debugService.warn('pipeline', `⚠️ No shots or HoloCine scenes available for narration, skipping`);
            }
            break;

          case 'music':
            // For scene-based pipeline (HoloCine), skip traditional music cues
            // HoloCine generates video directly, music would be added in post-production
            if (partialStory?.holoCineScenes && partialStory.holoCineScenes.length > 0) {
              debugService.info('pipeline', `🎵 Skipping music step for HoloCine pipeline - music added in post-production`);
            } else if (shots.length > 0) {
              await this.executeMusicStep(shots, queueItem, modelConfigs, progress);

              // Save partial story with music cues for live UI updates
              if (partialStory) {
                partialStory.shots = shots;
                partialStory.updatedAt = new Date();
                storyDataManager.savePartialStory(partialStory);
                debugService.info('pipeline', `💾 Updated story with music cues`);
              }
            } else {
              debugService.warn('pipeline', `⚠️ No shots or HoloCine scenes available for music, skipping`);
            }
            break;

          case 'holocine_scenes':
            if (!shots.length) throw new Error('Shots required for HoloCine scene organization');
            // Import holoCineService dynamically to avoid circular dependencies
            const { holoCineService } = await import('./holoCineService');

            // Create HoloCine scenes from story parts and shots
            const holoCineScenes = holoCineService.createScenesFromStory({
              id: queueItem.id,
              title: story?.title || 'Untitled',
              content: story?.content || '',
              genre: queueItem.config.genre,
              shots,
              characters,
              locations,
              storyParts,
              status: 'generating',
              createdAt: new Date(),
            });

            debugService.info('pipeline', `🎬 Created ${holoCineScenes.length} HoloCine scenes`);

            // Build character map for reference
            const characterMap = holoCineService.buildCharacterMap(characters);
            const holoCineCharacterMap: Record<string, string> = {};
            characterMap.forEach((ref, id) => {
              holoCineCharacterMap[id] = ref.holoCineRef;
            });

            // Save HoloCine scenes to partial story
            if (partialStory) {
              partialStory.holoCineScenes = holoCineScenes;
              partialStory.holoCineCharacterMap = holoCineCharacterMap;
              partialStory.updatedAt = new Date();
              storyDataManager.savePartialStory(partialStory);
              debugService.info('pipeline', `💾 Updated story with ${holoCineScenes.length} HoloCine scenes`);
            }
            break;

          case 'holocine_scenes_direct':
            // HoloCine Native Pipeline: Create scenes DIRECTLY from story parts (no shot breakdown)
            if (!storyParts || storyParts.length === 0) throw new Error('Story parts required for HoloCine scene creation');
            if (!characters || characters.length === 0) throw new Error('Characters required for HoloCine scene creation');

            debugService.info('pipeline', `🎬 Creating HoloCine scenes DIRECTLY from ${storyParts.length} story parts (native mode)`, {
              storyPartsCount: storyParts.length,
              storyPartTitles: storyParts.map((p: any) => p.title || `Part ${p.partNumber || p.part_number}`),
              charactersCount: characters.length
            });

            // Execute the native HoloCine scene creation
            const directScenes = await this.executeHoloCineDirectStep(
              storyParts,
              characters,
              story,
              queueItem,
              nodeInfo,
              progress
            );

            debugService.success('pipeline', `✅ Created ${directScenes.length} HoloCine scenes directly from story`, {
              scenesCreated: directScenes.length,
              expectedScenes: storyParts.length,
              scenesMissing: storyParts.length - directScenes.length,
              sceneSummary: directScenes.map((s: any) => ({
                number: s.sceneNumber,
                title: s.title,
                partNumber: s.partNumber,
                shotsCount: s.shotCaptions?.length || 0
              }))
            });

            // Verify scene count matches story parts
            if (directScenes.length !== storyParts.length) {
              debugService.warn('pipeline', `⚠️ SCENE COUNT MISMATCH: Expected ${storyParts.length} scenes (one per story part), got ${directScenes.length}`, {
                storyPartsCount: storyParts.length,
                scenesCount: directScenes.length,
                storyPartNumbers: storyParts.map((p: any) => p.partNumber || p.part_number),
                scenePartNumbers: directScenes.map((s: any) => s.partNumber)
              });
            }

            // Save to partial story
            if (partialStory) {
              partialStory.holoCineScenes = directScenes;
              // Build character map from the scenes
              const directCharacterMap: Record<string, string> = {};
              if (directScenes.length > 0 && directScenes[0].characters) {
                directScenes[0].characters.forEach((char: any) => {
                  directCharacterMap[char.name] = char.ref || char.holoCineRef;
                });
              }
              partialStory.holoCineCharacterMap = directCharacterMap;
              partialStory.generationMethod = generationMethod;
              partialStory.updatedAt = new Date();
              storyDataManager.savePartialStory(partialStory);
              debugService.info('pipeline', `💾 Updated story with ${directScenes.length} HoloCine scenes (native mode)`);
            }
            break;

          case 'comfyui_render':
            // ComfyUI Video Rendering Step
            // This step adds scenes/shots to the render queue for ComfyUI processing
            debugService.info('pipeline', `🎬 Starting ComfyUI render step...`);

            // Import render queue manager
            const { renderQueueManager } = await import('./renderQueueManager');

            // Check for HoloCine scenes (scene-based pipeline)
            if (partialStory?.holoCineScenes && partialStory.holoCineScenes.length > 0) {
              debugService.info('pipeline', `🎬 Queueing ${partialStory.holoCineScenes.length} HoloCine scenes for ComfyUI rendering`);

              // Create render jobs from scenes
              renderQueueManager.createJobsFromScenes(queueItem.id, partialStory.holoCineScenes, queueItem.config);

              debugService.success('pipeline', `✅ Added ${partialStory.holoCineScenes.length} scenes to render queue`);
            }
            // Check for shots with prompts (shot-based pipeline)
            else if (shots && shots.length > 0) {
              const shotsWithPrompts = shots.filter(s => s.comfyUIPositivePrompt || s.visualPrompt);
              if (shotsWithPrompts.length > 0) {
                debugService.info('pipeline', `🎬 Queueing ${shotsWithPrompts.length} shots for ComfyUI rendering`);

                // Create render jobs from shots
                renderQueueManager.createJobsFromShots(queueItem.id, shotsWithPrompts, queueItem.config);

                debugService.success('pipeline', `✅ Added ${shotsWithPrompts.length} shots to render queue`);
              } else {
                debugService.warn('pipeline', `⚠️ No shots with ComfyUI prompts found, skipping render step`);
              }
            } else {
              debugService.warn('pipeline', `⚠️ No scenes or shots available for rendering, skipping`);
            }
            break;
        }

        // Save checkpoint on step completion
        this.saveStepCheckpoint(queueItem.id, queueItem.id, step.id, 'completed', { stepId: step.id });

        } catch (stepError: any) {
          // Save checkpoint on step failure
          this.saveStepCheckpoint(queueItem.id, queueItem.id, step.id, 'failed', undefined, stepError.message || String(stepError));
          throw stepError; // Re-throw to be caught by outer error handler
        }

        // Mark step as completed for dependency tracking
        completedSteps.add(step.id);
        debugService.success('pipeline', `✅ Step '${step.id}' completed successfully`);

        // Log step completion with relevant details
        let completionMessage = `Completed: ${step.name}`;
        let completionDetails: any = {};
        switch (step.id) {
          case 'story':
            completionMessage = `Story generated: "${story?.title || 'Untitled'}"`;
            completionDetails = { contentLength: story?.content?.length || 0 };
            break;
          case 'segments':
            completionMessage = `Story segmented into ${storyParts?.length || 0} parts`;
            break;
          case 'shots':
            completionMessage = `Generated ${shots?.length || 0} shots`;
            completionDetails = { totalDuration: shots?.reduce((acc: number, s: any) => acc + (s.duration || 0), 0) };
            break;
          case 'characters':
            completionMessage = `Analyzed ${characters?.length || 0} characters`;
            break;
          case 'prompts':
            completionMessage = `Generated visual prompts for ${shots?.length || 0} shots`;
            break;
          case 'narration':
            completionMessage = `Added narration to shots`;
            break;
          case 'music':
            completionMessage = `Added music cues to shots`;
            break;
          case 'holocine_scenes':
            completionMessage = `Organized shots into HoloCine scenes`;
            break;
          case 'comfyui_render':
            completionMessage = `Added scenes/shots to render queue`;
            break;
        }
        this.addLog(progress, step.id, 'success', completionMessage, completionDetails);

        // Release node and mark step complete
        if (nodeInfo) {
          this.releaseNode(nodeInfo.id, queueItem.id, step.id);
        }
        this.updateProgress(progress, step.id, step.name, overallProgress, 100);
        debugService.success('pipeline', `✅ Completed: ${step.name}`);
      }

      // Create final story object (use partial story if available)
      const finalStory: Story = partialStory ? {
        ...partialStory,
        shots: shots || partialStory.shots || [],
        characters: characters || partialStory.characters || [],
        status: 'completed',
        updatedAt: new Date()
      } : {
        id: queueItem.id,
        title: story?.title || 'Untitled Story',
        content: story?.content || '',
        genre: queueItem.config.genre,
        shots: shots || [],
        characters: characters || [],
        musicCues: [],
        status: 'completed',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Final comprehensive validation of complete story
      const completeStoryValidation = validationService.validateCompleteStory(finalStory, 'before final save');
      if (!completeStoryValidation.isValid) {
        // Log validation errors but don't fail - save story anyway for user review
        debugService.warn('validation', `⚠️ Complete story validation failed but proceeding with save:`, {
          errors: completeStoryValidation.errors,
          warnings: completeStoryValidation.warnings
        });
      }

      // Final progress update
      this.updateProgress(progress, 'completed', 'Complete', 100, 100);
      progress.status = 'completed';

      // Log final completion
      this.addLog(progress, 'completed', 'success', `Pipeline completed: "${finalStory.title}"`, {
        shotCount: shots.length,
        characterCount: characters.length,
        validationPassed: completeStoryValidation.isValid
      });

      debugService.success('pipeline', `🎉 Sequential pipeline completed: ${finalStory.title}`, {
        storyId: finalStory.id,
        shotCount: shots.length,
        characterCount: characters.length,
        validationPassed: completeStoryValidation.isValid
      });

      // Clear checkpoint on successful completion
      this.clearCheckpoint(queueItem.id);

      return finalStory;

    } catch (error: any) {
      progress.status = 'failed';

      // Log error
      this.addLog(progress, progress.currentStep, 'error', `Pipeline failed: ${error.message || error}`, {
        step: progress.currentStep
      });

      debugService.error('pipeline', `❌ Sequential pipeline failed: ${error}`, {
        storyId: queueItem.id,
        currentStep: progress.currentStep
      });
      throw error;
    } finally {
      // Clean up processing state
      this.activeProcesses.delete(queueItem.id);
      this.progressCallbacks.delete(queueItem.id);
      this.abortControllers.delete(queueItem.id);
    }
  }

  private updateProgress(
    progress: SequentialProgress,
    stepId: string,
    stepName: string,
    overallProgress: number,
    stepProgress: number,
    assignedNode?: string,
    currentModel?: string
  ) {
    progress.currentStep = stepId;
    progress.currentStepName = stepName;
    progress.overallProgress = overallProgress;
    progress.stepProgress = stepProgress;
    if (assignedNode) progress.assignedNode = assignedNode;
    if (currentModel) progress.currentModel = currentModel;

    // Notify callback
    const callback = this.progressCallbacks.get(progress.storyId);
    if (callback) {
      callback({ ...progress });
    }
  }

  /**
   * Add a log entry to the progress object
   * FIX: Added missing log functionality that was causing empty logs in UI
   */
  private addLog(
    progress: SequentialProgress,
    step: string,
    level: 'info' | 'success' | 'warn' | 'error',
    message: string,
    details?: any
  ) {
    const MAX_LOGS = 500;

    const log = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      step,
      level,
      message,
      details
    };

    progress.logs.unshift(log); // Add to beginning for latest first

    // Implement log rotation to prevent memory bloat
    if (progress.logs.length > MAX_LOGS) {
      progress.logs = progress.logs.slice(0, MAX_LOGS);
    }

    // Notify callback with updated progress
    const callback = this.progressCallbacks.get(progress.storyId);
    if (callback) {
      callback({ ...progress });
    }
  }

  private getNextAvailableNode(modelConfigs: ModelConfig[], stepType: string, storyId: string) {
    // Map step IDs to model config step names
    const stepMapping: Record<string, string> = {
      'story': 'story',
      'segments': 'story', // Use story model configs for segmentation
      'shots': 'shots',
      'characters': 'characters',
      'prompts': 'prompts',
      'narration': 'narration',
      'music': 'music',
      'holocine_scenes_direct': 'holocine_scenes', // HoloCine direct scene creation
      'holocine_scenes': 'holocine_scenes' // HoloCine scene organization
    };

    const modelConfigStep = stepMapping[stepType] || stepType;
    let configs = modelConfigs.filter(c => c.step === modelConfigStep && c.enabled);

    // Fallback: if holocine_scenes has no config, use shots config
    if (configs.length === 0 && (stepType === 'holocine_scenes_direct' || stepType === 'holocine_scenes')) {
      configs = modelConfigs.filter(c => c.step === 'shots' && c.enabled);
      if (configs.length > 0) {
        debugService.info('pipeline', `📋 No holocine_scenes config found, falling back to shots config`);
      }
    }

    if (configs.length === 0) return null;

    debugService.debug('queue', `🔍 Checking node availability for ${stepType}`, {
      stepType,
      storyId,
      availableConfigs: configs.length,
      currentAssignments: this.nodeAssignments.size
    });

    // Find a node that's not currently busy with a different story's task
    for (const config of configs) {
      const nodeId = config.nodeId;
      
      // Check if this node is globally busy
      const isNodeBusy = this.globalNodeBusyStatus.get(nodeId) || false;

      debugService.debug('queue', `🔍 Node ${nodeId} busy check`, {
        nodeId,
        isNodeBusy,
        globalStatus: this.globalNodeBusyStatus.get(nodeId),
        totalAssignments: this.nodeAssignments.size
      });

      if (!isNodeBusy) {
        debugService.info('queue', `🎯 Assigned node: ${nodeId} for ${stepType}`, {
          nodeId,
          model: config.model,
          stepType,
          storyId
        });

        return {
          id: nodeId,
          name: nodeId,
          model: config.model
        };
      }
    }

    // If all nodes are busy, still return a node (queue will handle it)
    debugService.warn('queue', `⚠️ All nodes busy, using first config for ${stepType}`, {
      stepType,
      storyId,
      availableConfigs: configs.length,
      busyAssignments: Array.from(this.nodeAssignments.values()).length
    });

    return {
      id: configs[0].nodeId,
      name: configs[0].nodeId,
      model: configs[0].model
    };
  }

  private getNodeIdFromConfig(modelConfigs: ModelConfig[], stepType: string): string | null {
    const config = modelConfigs.find(c => c.step === stepType && c.enabled);
    return config ? config.nodeId : null;
  }

  private assignNode(nodeId: string, storyId: string, stepId: string, model: string) {
    // Mark node as globally busy
    this.globalNodeBusyStatus.set(nodeId, true);
    
    const key = `${nodeId}_${stepId}_${storyId}`;
    this.nodeAssignments.set(key, {
      storyId,
      stepId,
      model,
      startTime: new Date()
    });

    debugService.info('queue', `🔒 Node assigned: ${nodeId} for ${stepId}`, {
      nodeId,
      stepId,
      storyId,
      model,
      activeAssignments: this.nodeAssignments.size,
      globalBusy: true
    });
  }

  private releaseNode(nodeId: string, storyId: string, stepId: string) {
    // Mark node as globally free
    this.globalNodeBusyStatus.set(nodeId, false);
    
    const key = `${nodeId}_${stepId}_${storyId}`;
    const assignment = this.nodeAssignments.get(key);
    
    if (assignment) {
      const duration = new Date().getTime() - assignment.startTime.getTime();
      this.nodeAssignments.delete(key);

      debugService.success('queue', `🔓 Node released: ${nodeId} from ${stepId}`, {
        nodeId,
        stepId,
        storyId,
        duration: `${(duration / 1000).toFixed(1)}s`,
        remainingAssignments: this.nodeAssignments.size,
        globalBusy: false
      });
    }
  }

  private async executeStoryStep(
    queueItem: QueueItem,
    nodeInfo: { id: string; name: string; model: string } | null,
    progress: SequentialProgress
  ): Promise<any> {
    if (!nodeInfo) throw new Error('No node available for story generation');

    debugService.info('ai', `📝 Starting story generation`, {
      node: nodeInfo.name,
      model: nodeInfo.model,
      prompt: queueItem.config.prompt.slice(0, 100) + '...'
    });

    return new Promise((resolve, reject) => {
      const taskId = nodeQueueManager.addTask(
        {
          type: 'story',
          priority: 10,
          storyId: queueItem.id,
          data: {
            genre: queueItem.config.genre,
            length: queueItem.config.length,
            prompt: queueItem.config.prompt
          },
          maxAttempts: 3
        },
        (wrappedResult) => {
          // Unwrap the result - it comes wrapped with taskId, type, result, timestamp
          const result = wrappedResult?.result || wrappedResult;
          
          debugService.info('ai', '📝 Story generation callback - Unwrapped result:', {
            hasWrappedResult: !!wrappedResult,
            wrappedKeys: wrappedResult ? Object.keys(wrappedResult) : [],
            hasResult: !!result,
            resultKeys: result ? Object.keys(result) : [],
            resultId: result?.id,
            resultTitle: result?.title,
            resultGenre: result?.genre,
            resultLength: result?.length,
            contentLength: result?.content?.length || 0,
            contentPreview: result?.content?.slice(0, 100) || 'NO CONTENT'
          });
          debugService.success('ai', `✅ Story generation completed: ${result?.title || 'No title'}`, {
            storyId: result?.id,
            contentLength: result?.content?.length || 0,
            hasResult: !!result,
            resultKeys: result ? Object.keys(result) : []
          });
          if (result) {
            resolve(result);
          } else {
            reject(new Error('Story generation returned no result'));
          }
        },
        (error) => {
          debugService.error('ai', `❌ Story generation failed: ${error.message}`, error);
          reject(error);
        },
        (progressData) => {
          // Update step progress based on task progress
          this.updateProgress(progress, 'story', 'Story Generation', 
            Math.round((progressData.overallProgress || 0) * 0.25), // Story is ~25% of total
            progressData.stepProgress || 0,
            nodeInfo.name, nodeInfo.model
          );
        }
      );
    });
  }

  private async executeShotsStep(
    story: any,
    queueItem: QueueItem,
    nodeInfo: { id: string; name: string; model: string } | null,
    progress: SequentialProgress
  ): Promise<any[]> {
    if (!nodeInfo) throw new Error('No node available for shot breakdown');

    // Debug log the story object being passed
    debugService.info('ai', '🎬 executeShotsStep: Story object:', {
      hasStory: !!story,
      storyKeys: story ? Object.keys(story) : [],
      storyId: story?.id,
      storyTitle: story?.title,
      storyGenre: story?.genre,
      storyLength: story?.length,
      storyContent: story?.content ? `${story.content.length} chars` : 'UNDEFINED',
      storyContentPreview: story?.content ? story.content.slice(0, 100) : 'NO CONTENT'
    });

    debugService.info('ai', `🎬 Starting shot breakdown`, {
      node: nodeInfo.name,
      model: nodeInfo.model,
      storyTitle: story.title
    });

    return new Promise((resolve, reject) => {
      const taskId = nodeQueueManager.addTask(
        {
          type: 'shot',
          priority: 8,
          storyId: story.id,
          data: {
            story: story,
            length: queueItem.config.length
          },
          maxAttempts: 1  // Don't retry - fix the root cause instead
        },
        (wrappedResult) => {
          // Unwrap the result - it comes wrapped with taskId, type, result, timestamp
          const result = wrappedResult?.result || wrappedResult;
          
          debugService.success('ai', `✅ Shot breakdown completed: ${result?.length || 0} shots`, {
            shotCount: result?.length || 0,
            hasResult: !!result,
            isArray: Array.isArray(result)
          });
          if (result && Array.isArray(result)) {
            resolve(result);
          } else {
            debugService.warn('ai', `⚠️ Shot breakdown returned invalid result, using fallback`);
            resolve([]); // Return empty array instead of rejecting
          }
        },
        (error) => {
          debugService.error('ai', `❌ Shot breakdown failed: ${error.message}`, error);
          reject(error);
        },
        (progressData) => {
          this.updateProgress(progress, 'shots', 'Shot Breakdown',
            25 + Math.round((progressData.overallProgress || 0) * 0.25), // 25-50%
            progressData.stepProgress || 0,
            nodeInfo.name, nodeInfo.model
          );
        }
      );
    });
  }

  private async executeCharactersStep(
    story: any,
    queueItem: QueueItem,
    nodeInfo: { id: string; name: string; model: string } | null,
    progress: SequentialProgress
  ): Promise<any[]> {
    if (!nodeInfo) throw new Error('No node available for character analysis');

    debugService.info('ai', `👥 Starting character analysis`, {
      node: nodeInfo.name,
      model: nodeInfo.model,
      storyTitle: story.title
    });

    return new Promise((resolve, reject) => {
      const taskId = nodeQueueManager.addTask(
        {
          type: 'character',
          priority: 8,
          storyId: story.id,
          data: {
            story: story
          },
          maxAttempts: 3
        },
        (wrappedResult) => {
          // Unwrap the result - it comes wrapped with taskId, type, result, timestamp
          const result = wrappedResult?.result || wrappedResult;
          
          debugService.success('ai', `✅ Character analysis completed: ${result?.length || 0} characters`, {
            characterCount: result?.length || 0
          });
          resolve(result || []);
        },
        (error) => {
          debugService.error('ai', `❌ Character analysis failed: ${error.message}`, error);
          reject(error);
        },
        (progressData) => {
          this.updateProgress(progress, 'characters', 'Character Analysis',
            50 + Math.round((progressData.overallProgress || 0) * 0.25), // 50-75%
            progressData.stepProgress || 0,
            nodeInfo.name, nodeInfo.model
          );
        }
      );
    });
  }

  private async executePromptsStep(
    shots: any[],
    characters: any[],
    queueItem: QueueItem,
    modelConfigs: ModelConfig[],
    progress: SequentialProgress,
    partialStory?: any
  ): Promise<void> {
    // Count available nodes from settings for this step
    const promptNodes = modelConfigs.filter(c => c.enabled && c.step === 'prompts');
    const nodeCount = promptNodes.length || 1;

    debugService.info('ai', `🎨 Starting visual prompts for ${shots.length} shots`, {
      availableNodes: nodeCount,
      nodeConfigs: promptNodes.map(n => `${n.nodeId}:${n.model}`)
    });

    let completedCount = 0;

    // Helper to save story and update UI after each prompt completes
    const saveAndUpdateUI = () => {
      if (partialStory) {
        // Create NEW shot objects to ensure React detects the change
        partialStory.shots = shots.map((s: any) => ({
          ...s,
          comfyUIPositivePrompt: s.comfyUIPositivePrompt || '',
          comfyUINegativePrompt: s.comfyUINegativePrompt || ''
        }));
        partialStory.updatedAt = new Date();
        storyDataManager.savePartialStory(partialStory);
        debugService.info('pipeline', `💾 [LIVE] UI update: ${completedCount}/${shots.length} prompts complete`);
      }

      // Update progress
      const progressPercent = Math.round((completedCount / shots.length) * 100);
      this.updateProgress(progress, 'prompts', 'Visual Prompts',
        75 + Math.round(progressPercent * 0.15),
        progressPercent,
        'pool', modelConfigs[0]?.model || 'unknown'
      );
    };

    // TASK POOL PATTERN: Queue ALL tasks at once
    // The nodeQueueManager will handle waiting for available nodes
    // Tasks will be picked up by nodes as they become free
    debugService.info('ai', `🎨 Queueing all ${shots.length} prompt tasks to pool (nodes will pick them up as available)`);

    const allTaskPromises = shots.map((shot) => {
      return new Promise<void>((resolve, reject) => {
        // Queue the task - nodeQueueManager will wait for available node
        nodeQueueManager.addTask(
          {
            type: 'comfyui_prompts',
            priority: 5,
            storyId: shot.storyId || queueItem.id,
            data: {
              shot: shot,
              characters: characters,
              shotNumber: shot.shotNumber
            },
            maxAttempts: 2
          },
          (wrappedResult) => {
            // Unwrap the result - it comes wrapped with { taskId, type, result, timestamp }
            const result = wrappedResult?.result || wrappedResult;

            // Map the result to the correct field names for UI display
            shot.comfyUIPositivePrompt = result.positivePrompt || '';
            shot.comfyUINegativePrompt = result.negativePrompt || '';
            shot.visualPrompt = result.positivePrompt || '';

            completedCount++;

            debugService.info('ai', `🎨 Shot ${shot.shotNumber} prompt complete (${completedCount}/${shots.length})`, {
              positiveLength: shot.comfyUIPositivePrompt?.length || 0,
              negativeLength: shot.comfyUINegativePrompt?.length || 0,
              hasPositive: !!shot.comfyUIPositivePrompt,
              hasNegative: !!shot.comfyUINegativePrompt
            });

            // Save after EACH prompt for live UI updates
            saveAndUpdateUI();

            resolve();
          },
          (error) => {
            debugService.error('ai', `❌ Failed shot ${shot.shotNumber}: ${error.message}`);
            reject(error);
          }
        );
      });
    });

    debugService.info('ai', `🎨 All ${shots.length} tasks queued, waiting for completion...`);

    // Wait for ALL tasks to complete
    // Each task will grab a node when one becomes available
    await Promise.all(allTaskPromises);

    debugService.success('ai', `✅ Visual prompts completed for all ${shots.length} shots`);
  }

  private async executeNarrationStep(
    shots: any[],
    queueItem: QueueItem,
    modelConfigs: ModelConfig[],
    progress: SequentialProgress
  ): Promise<void> {
    const shotsWithDialogue = shots.filter(shot => shot.narration && shot.narration.trim());
    if (shotsWithDialogue.length === 0) return;

    debugService.info('ai', `🗣️ Starting narration for ${shotsWithDialogue.length} shots`);

    const narrationPromises = shotsWithDialogue.map(shot => {
      const nodeInfo = this.getNextAvailableNode(modelConfigs, 'narration', queueItem.id);
      if (!nodeInfo) throw new Error('No node available for narration generation');

      return new Promise((resolve, reject) => {
        const taskId = nodeQueueManager.addTask(
          {
            type: 'narration',
            priority: 3,
            storyId: shot.storyId,
            data: { shot: shot },
            maxAttempts: 2
          },
          (result) => {
            shot.narration = result.result;
            resolve(result.result);
          },
          (error) => reject(error)
        );
      });
    });

    await Promise.all(narrationPromises);
    debugService.success('ai', `✅ Narration completed for ${shotsWithDialogue.length} shots`);
  }

  private generateFallbackShots(story: any, shotCount: number): any[] {
    debugService.info('pipeline', `🎬 Generating ${shotCount} fallback shots`);
    
    const shots = [];
    const shotDuration = 5; // Default 5 seconds per shot
    
    // Parse story content into paragraphs or sections
    const storyParts = story.content.split(/\n\n|\. /).filter((p: string) => p.trim().length > 20);
    const partsPerShot = Math.max(1, Math.floor(storyParts.length / shotCount));
    
    for (let i = 0; i < shotCount; i++) {
      const shotNumber = i + 1;
      const startIdx = i * partsPerShot;
      const endIdx = Math.min(startIdx + partsPerShot, storyParts.length);
      const shotContent = storyParts.slice(startIdx, endIdx).join(' ').trim();
      
      // Determine camera type based on shot position
      let cameraType = 'medium shot';
      if (i === 0) cameraType = 'wide shot'; // Opening shot
      else if (i === shotCount - 1) cameraType = 'wide shot'; // Closing shot
      else if (i % 3 === 0) cameraType = 'close-up';
      else if (i % 4 === 0) cameraType = 'tracking shot';
      
      shots.push({
        id: `shot_${Date.now()}_${i}`,
        storyId: story.id,
        shotNumber: shotNumber,
        description: shotContent.slice(0, 200) || `Shot ${shotNumber} of the story`,
        duration: shotDuration,
        frames: shotDuration * 24,
        camera: cameraType,
        narration: '',
        musicCue: null,
        renderStatus: 'pending',
        visualPrompt: ''
      });
    }
    
    return shots;
  }

  private async executeMusicStep(
    shots: any[],
    queueItem: QueueItem,
    modelConfigs: ModelConfig[],
    progress: SequentialProgress
  ): Promise<void> {
    const shotsWithMusic = shots.filter(shot => shot.musicCue);
    if (shotsWithMusic.length === 0) return;

    debugService.info('ai', `🎵 Starting music generation for ${shotsWithMusic.length} shots`);

    const musicPromises = shotsWithMusic.map(shot => {
      const nodeInfo = this.getNextAvailableNode(modelConfigs, 'music', queueItem.id);
      if (!nodeInfo) throw new Error('No node available for music generation');

      return new Promise((resolve, reject) => {
        const taskId = nodeQueueManager.addTask(
          {
            type: 'music',
            priority: 3,
            storyId: shot.storyId,
            data: { shot: shot },
            maxAttempts: 2
          },
          (result) => {
            shot.musicCue = result.result;
            resolve(result.result);
          },
          (error) => reject(error)
        );
      });
    });

    await Promise.all(musicPromises);
    debugService.success('ai', `✅ Music generation completed for ${shotsWithMusic.length} shots`);
  }

  private async executeSegmentationStep(
    story: any,
    queueItem: QueueItem,
    nodeInfo: { id: string; name: string; model: string } | null,
    progress: SequentialProgress
  ): Promise<any[]> {
    if (!nodeInfo) throw new Error('No node available for story segmentation');

    debugService.info('ai', `📑 Starting story segmentation`, {
      node: nodeInfo.name,
      model: nodeInfo.model,
      storyTitle: story.title
    });

    return new Promise((resolve, reject) => {
      const taskId = nodeQueueManager.addTask(
        {
          type: 'segment',
          priority: 8,
          storyId: story.id,
          data: {
            story: story
          },
          maxAttempts: 3
        },
        (wrappedResult) => {
          // Unwrap the result - it comes wrapped with taskId, type, result, timestamp
          const result = wrappedResult?.result || wrappedResult;
          
          debugService.success('ai', `✅ Story segmentation completed: ${result?.length || 0} parts`, {
            partCount: result?.length || 0
          });
          resolve(result || []);
        },
        (error) => {
          debugService.error('ai', `❌ Story segmentation failed: ${error.message}`, error);
          reject(error);
        },
        (progressData) => {
          this.updateProgress(progress, 'segments', 'Story Segmentation',
            17 + Math.round((progressData.overallProgress || 0) * 0.08), // 17-25%
            progressData.stepProgress || 0,
            nodeInfo.name, nodeInfo.model
          );
        }
      );
    });
  }

  private async executeShotsForPartsStep(
    storyParts: any[],
    story: any,
    queueItem: QueueItem,
    nodeInfo: { id: string; name: string; model: string } | null,
    progress: SequentialProgress
  ): Promise<any[]> {
    if (!nodeInfo) throw new Error('No node available for shot breakdown');

    debugService.info('ai', `🎬 Starting PARALLEL shot breakdown for ${storyParts.length} story parts`, {
      node: nodeInfo.name,
      model: nodeInfo.model,
      storyTitle: story.title,
      partCount: storyParts.length,
      masterStoryContentLength: story.content?.length || 0
    });

    // Build master story context for coherence
    const masterStoryContext = {
      fullStoryContent: story.content,
      title: story.title,
      genre: story.genre,
      allParts: storyParts.map((p: any) => ({
        partNumber: p.part_number,
        title: p.title,
        content: p.content,
        keyPlotPoints: p.key_plot_points || [],
        charactersFeatured: p.characters_featured || []
      }))
    };

    // Track completion for progress updates
    let completedParts = 0;
    const totalParts = storyParts.length;

    // PARALLEL PROCESSING: Queue all parts at once
    // Each part gets an estimated starting shot number based on average shots per part
    const estimatedShotsPerPart = 5; // Estimate for initial numbering

    debugService.info('ai', `🚀 Queueing ALL ${storyParts.length} parts in PARALLEL for maximum speed`);

    const partPromises = storyParts.map((part, i) => {
      const estimatedStartingShot = 1 + (i * estimatedShotsPerPart);

      return new Promise<{ partIndex: number; shots: any[] }>((resolve, reject) => {
        nodeQueueManager.addTask(
          {
            type: 'shot',
            priority: 8,
            storyId: story.id,
            data: {
              // MASTER STORY CONTEXT - Critical for coherence
              masterStory: masterStoryContext,
              // Specific part to break down
              storyPart: part,
              // Legacy field for backwards compatibility
              story: story,
              // Part information
              partNumber: part.part_number,
              totalParts: storyParts.length,
              startingShotNumber: estimatedStartingShot,
              // No previous shots in parallel mode - use master context for transitions
              previousPartLastShots: [],
              // Config
              length: queueItem.config.length,
              isFirstPart: i === 0,
              isLastPart: i === storyParts.length - 1
            },
            maxAttempts: 2
          },
          (wrappedResult) => {
            const result = wrappedResult?.result || wrappedResult;
            completedParts++;

            debugService.success('ai', `✅ Part ${i + 1}/${totalParts} completed: ${result?.length || 0} shots (${completedParts}/${totalParts} done)`, {
              partNumber: i + 1,
              shotCount: result?.length || 0,
              completedParts,
              remainingParts: totalParts - completedParts
            });

            // Update progress
            const progressPercent = Math.round((completedParts / totalParts) * 100);
            this.updateProgress(progress, 'shots', 'Shot Breakdown',
              25 + Math.round(progressPercent * 0.25), // 25-50%
              progressPercent,
              'parallel', nodeInfo.model
            );

            if (result && Array.isArray(result)) {
              resolve({ partIndex: i, shots: result });
            } else {
              debugService.warn('ai', `⚠️ Part ${i + 1} returned invalid result, using empty array`);
              resolve({ partIndex: i, shots: [] });
            }
          },
          (error) => {
            debugService.error('ai', `❌ Part ${i + 1} shot breakdown failed: ${error.message}`, error);
            reject(error);
          }
        );
      });
    });

    // Wait for all parts to complete in parallel
    debugService.info('ai', `⏳ Waiting for ${storyParts.length} parallel tasks to complete...`);
    const partResults = await Promise.all(partPromises);

    // Sort by part index and renumber shots sequentially
    partResults.sort((a, b) => a.partIndex - b.partIndex);

    const allShots: any[] = [];
    let currentShotNumber = 1;

    for (const { partIndex, shots } of partResults) {
      const part = storyParts[partIndex];

      if (shots.length > 0) {
        const adjustedShots = shots.map((shot, index) => ({
          ...shot,
          shot_number: currentShotNumber + index,
          shotNumber: currentShotNumber + index,
          part_number: part.part_number,
          partNumber: part.part_number,
          part_title: part.title,
          partTitle: part.title
        }));

        allShots.push(...adjustedShots);
        currentShotNumber += shots.length;
        part.shotCount = shots.length;
      }
    }

    debugService.success('ai', `✅ PARALLEL processing complete: ${allShots.length} total shots from ${storyParts.length} parts`, {
      totalShots: allShots.length,
      shotsPerPart: storyParts.map((p: any) => ({ part: p.part_number, shots: p.shotCount || 0 }))
    });
    return allShots;
  }

  /**
   * Execute HoloCine Direct Scene Creation
   * This creates scenes DIRECTLY from story parts without going through individual shot breakdown.
   * The AI creates complete scenes with multiple shot captions in one step.
   */
  private async executeHoloCineDirectStep(
    storyParts: any[],
    characters: any[],
    story: any,
    queueItem: QueueItem,
    nodeInfo: { id: string; name: string; model: string } | null,
    progress: SequentialProgress
  ): Promise<any[]> {
    if (!nodeInfo) throw new Error('No node available for HoloCine scene creation');

    debugService.info('ai', `🎬 Starting HoloCine DIRECT scene creation for ${storyParts.length} story parts`, {
      node: nodeInfo.name,
      model: nodeInfo.model,
      storyTitle: story.title,
      partCount: storyParts.length,
      characterCount: characters.length
    });

    // Build character context for the prompt
    const characterContext = characters.map((char: any, index: number) => ({
      name: char.name,
      ref: `[character${index + 1}]`,
      refNumber: index + 1,
      physicalDescription: char.physical_description || char.physicalDescription || '',
      role: char.role || 'supporting',
      clothing: char.clothing || char.clothing_style || ''
    }));

    // Track completion
    let completedParts = 0;
    const totalParts = storyParts.length;

    debugService.info('ai', `🚀 Queueing ${storyParts.length} story parts for HoloCine scene creation`);

    // Process each story part to create a complete scene
    const partPromises = storyParts.map((part, i) => {
      return new Promise<{ partIndex: number; scene: any }>((resolve, reject) => {
        nodeQueueManager.addTask(
          {
            type: 'holocine_scene_direct',  // New task type for direct scene creation
            priority: 8,
            storyId: story.id,
            data: {
              // Story context
              storyTitle: story.title,
              storyGenre: story.genre,
              masterStoryContent: story.content,
              // Specific part to convert to scene
              storyPart: part,
              partNumber: part.part_number || part.partNumber,
              partTitle: part.title,
              partContent: part.content,
              // Character references
              characters: characterContext,
              // Scene settings
              sceneNumber: i + 1,
              totalScenes: storyParts.length,
              isFirstScene: i === 0,
              isLastScene: i === storyParts.length - 1
            },
            maxAttempts: 2
          },
          (wrappedResult) => {
            const result = wrappedResult?.result || wrappedResult;
            completedParts++;

            debugService.success('ai', `✅ Part ${i + 1}/${totalParts} → Scene created (${completedParts}/${totalParts} done)`, {
              partNumber: i + 1,
              sceneTitle: result?.title || 'Untitled Scene',
              shotCount: result?.shot_captions?.length || result?.shotCaptions?.length || 0,
              completedParts
            });

            // Update progress
            const progressPercent = Math.round((completedParts / totalParts) * 100);
            this.updateProgress(progress, 'holocine_scenes_direct', 'HoloCine Scene Creation',
              50 + Math.round(progressPercent * 0.35), // 50-85%
              progressPercent,
              'parallel', nodeInfo.model
            );

            if (result) {
              resolve({ partIndex: i, scene: result });
            } else {
              debugService.warn('ai', `⚠️ Part ${i + 1} returned no scene, creating fallback`);
              resolve({
                partIndex: i,
                scene: {
                  scene_number: i + 1,
                  title: part.title || `Scene ${i + 1}`,
                  part_number: part.part_number || part.partNumber,
                  global_caption: `The scene takes place in a ${story.genre || 'dramatic'} setting.`,
                  shot_captions: ['Wide establishing shot of the scene'],
                  characters: [],
                  estimated_duration: 10
                }
              });
            }
          },
          (error) => {
            debugService.error('ai', `❌ Part ${i + 1} scene creation failed: ${error.message}`, error);
            reject(error);
          }
        );
      });
    });

    // Wait for all scenes to be created
    debugService.info('ai', `⏳ Waiting for ${storyParts.length} HoloCine scenes to be created...`);
    const sceneResults = await Promise.all(partPromises);

    // Sort by part index and format into HoloCineScene format
    sceneResults.sort((a, b) => a.partIndex - b.partIndex);

    const holoCineScenes = sceneResults.map(({ partIndex, scene }) => {
      const part = storyParts[partIndex];

      return {
        id: `holocine_scene_${Date.now()}_${partIndex}`,
        sceneNumber: scene.scene_number || partIndex + 1,
        title: scene.title || part.title || `Scene ${partIndex + 1}`,
        globalCaption: scene.global_caption || scene.globalCaption || '',
        shotCaptions: scene.shot_captions || scene.shotCaptions || [],
        shotCutFrames: scene.shot_cut_frames || scene.shotCutFrames,
        numFrames: 241 as const,  // Default to 15 second scenes
        resolution: '832x480' as const,
        fps: 16,
        characters: (scene.characters || characterContext).map((char: any) => ({
          id: char.id || `char_${char.name?.replace(/\s+/g, '_')}`,
          holoCineRef: char.ref || char.holoCineRef,
          refNumber: char.ref_number || char.refNumber,
          name: char.name,
          description: char.physical_description || char.physicalDescription || char.description || ''
        })),
        primaryLocation: scene.primary_location || scene.primaryLocation || part.title || 'Scene Location',
        locationDescription: scene.location_description || scene.locationDescription || '',
        estimatedDuration: scene.estimated_duration || scene.estimatedDuration || 12,
        shotIds: [], // No individual shots in native mode
        partNumber: part.part_number || part.partNumber,
        partTitle: part.title,
        status: 'ready' as const
      };
    });

    debugService.success('ai', `✅ HoloCine DIRECT processing complete: ${holoCineScenes.length} scenes created`, {
      totalScenes: holoCineScenes.length,
      sceneSummary: holoCineScenes.map(s => ({
        number: s.sceneNumber,
        title: s.title,
        shots: s.shotCaptions.length,
        duration: s.estimatedDuration
      }))
    });

    return holoCineScenes;
  }
}

export const sequentialAiPipelineService = new SequentialAiPipelineService();