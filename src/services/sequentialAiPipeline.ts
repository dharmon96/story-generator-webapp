import { QueueItem, Story, ModelConfig, useStore } from '../store/useStore';
import { nodeQueueManager } from './nodeQueueManager';
import { debugService } from './debugService';
import { validationService } from './validationService';
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
      storeHasStory: !!matchingStory,
      totalStoriesInStore: storiesAfterUpdate.length
    });

    console.log(`📊 [LIVE UPDATE] Story ${story.id} synced to store:`, {
      title: storeStory.title,
      hasContent: !!storeStory.content,
      shotsCount: storeStory.shots.length,
      charactersCount: storeStory.characters.length,
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
      debugService.info('pipeline', `🚀 Starting sequential pipeline for: ${queueItem.config.prompt.slice(0, 50)}...`);
      
      // Define processing steps with explicit dependencies
      const steps: StepDefinition[] = [
        { 
          id: 'story', 
          name: 'Story Generation', 
          required: true,
          dependencies: [] // No dependencies - can run first
        },
        { 
          id: 'segments', 
          name: 'Story Segmentation', 
          required: true,
          dependencies: ['story'] // Must wait for story
        },
        { 
          id: 'shots', 
          name: 'Shot Breakdown', 
          required: true,
          dependencies: ['story', 'segments'] // Must wait for story and segments
        },
        { 
          id: 'characters', 
          name: 'Character Analysis', 
          required: true,
          dependencies: ['story'] // Can run after story, parallel with shots
        },
        { 
          id: 'prompts', 
          name: 'Visual Prompts', 
          required: true,
          dependencies: ['shots', 'characters'] // Must wait for both shots and characters
        },
        { 
          id: 'narration', 
          name: 'Narration Generation', 
          required: false,
          dependencies: ['shots'], // Must wait for shots
          configCheck: (config) => config.narrationGeneration
        },
        { 
          id: 'music', 
          name: 'Music Cue Generation', 
          required: false,
          dependencies: ['shots'], // Must wait for shots
          configCheck: (config) => config.musicGeneration
        }
      ];

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
            if (!shots.length) throw new Error('Shots required for narration');
            await this.executeNarrationStep(shots, queueItem, modelConfigs, progress);

            // Save partial story with narration for live UI updates
            if (partialStory) {
              partialStory.shots = shots;
              partialStory.updatedAt = new Date();
              storyDataManager.savePartialStory(partialStory);
              debugService.info('pipeline', `💾 Updated story with narration`);
            }
            break;

          case 'music':
            if (!shots.length) throw new Error('Shots required for music generation');
            await this.executeMusicStep(shots, queueItem, modelConfigs, progress);

            // Save partial story with music cues for live UI updates
            if (partialStory) {
              partialStory.shots = shots;
              partialStory.updatedAt = new Date();
              storyDataManager.savePartialStory(partialStory);
              debugService.info('pipeline', `💾 Updated story with music cues`);
            }
            break;
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
      'music': 'music'
    };
    
    const modelConfigStep = stepMapping[stepType] || stepType;
    const configs = modelConfigs.filter(c => c.step === modelConfigStep && c.enabled);
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

    debugService.info('ai', `🎬 Starting shot breakdown for ${storyParts.length} story parts`, {
      node: nodeInfo.name,
      model: nodeInfo.model,
      storyTitle: story.title,
      partCount: storyParts.length,
      masterStoryContentLength: story.content?.length || 0
    });

    const allShots: any[] = [];
    let currentShotNumber = 1;

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

    // Process each story part sequentially
    for (let i = 0; i < storyParts.length; i++) {
      const part = storyParts[i];

      // Get previous part's last shots for continuity
      const previousPartShots = i > 0 ? allShots.slice(-3) : [];

      debugService.info('ai', `🎬 Processing part ${i + 1}/${storyParts.length}: ${part.title}`, {
        partNumber: part.part_number,
        partTitle: part.title,
        partContent: part.content?.length + ' characters',
        hasMasterContext: !!masterStoryContext.fullStoryContent,
        previousShotsForContext: previousPartShots.length
      });

      const partShots = await new Promise<any[]>((resolve, reject) => {
        const taskId = nodeQueueManager.addTask(
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
              startingShotNumber: currentShotNumber,
              // Previous shots for transition continuity
              previousPartLastShots: previousPartShots.map((s: any) => ({
                shotNumber: s.shot_number,
                description: s.description,
                camera: s.camera
              })),
              // Config
              length: queueItem.config.length,
              isFirstPart: i === 0,
              isLastPart: i === storyParts.length - 1
            },
            maxAttempts: 1
          },
          (wrappedResult) => {
            // Unwrap the result - it comes wrapped with taskId, type, result, timestamp
            const result = wrappedResult?.result || wrappedResult;

            debugService.success('ai', `✅ Part ${i + 1} shot breakdown completed: ${result?.length || 0} shots`, {
              partNumber: i + 1,
              shotCount: result?.length || 0
            });

            if (result && Array.isArray(result)) {
              resolve(result);
            } else {
              debugService.warn('ai', `⚠️ Part ${i + 1} returned invalid result, using empty array`);
              resolve([]);
            }
          },
          (error) => {
            debugService.error('ai', `❌ Part ${i + 1} shot breakdown failed: ${error.message}`, error);
            reject(error);
          },
          (progressData) => {
            const partProgress = (i / storyParts.length) * 25 + (progressData.stepProgress || 0) * (25 / storyParts.length);
            this.updateProgress(progress, 'shots', 'Shot Breakdown',
              25 + Math.round(partProgress), // 25-50%
              progressData.stepProgress || 0,
              nodeInfo.name, nodeInfo.model
            );
          }
        );
      });

      // Add shots from this part to the total, updating shot numbers and part references
      if (partShots.length > 0) {
        const adjustedShots = partShots.map((shot, index) => ({
          ...shot,
          shot_number: currentShotNumber + index,
          shotNumber: currentShotNumber + index,
          part_number: part.part_number,
          partNumber: part.part_number,
          part_title: part.title,
          partTitle: part.title
        }));

        allShots.push(...adjustedShots);
        currentShotNumber += partShots.length;

        // Update the part with shot count
        part.shotCount = partShots.length;
      }
    }

    debugService.success('ai', `✅ All parts completed: ${allShots.length} total shots from ${storyParts.length} parts`, {
      totalShots: allShots.length,
      shotsPerPart: storyParts.map((p: any) => ({ part: p.part_number, shots: p.shotCount || 0 }))
    });
    return allShots;
  }
}

export const sequentialAiPipelineService = new SequentialAiPipelineService();