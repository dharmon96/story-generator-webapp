import { QueueItem, ModelConfig } from '../store/useStore';
import { EnhancedStory, AILogEntry } from '../types/storyTypes';
import { nodeQueueManager } from './nodeQueueManager';
import { storyDataManager } from './storyDataManager';
import { validationService } from './validationService';

// Pipeline step interface (moved from deprecated aiPipeline.ts)
export interface PipelineStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  nodeId?: string;
  model?: string;
  startTime?: Date;
  endTime?: Date;
  input?: string;
  output?: string;
  error?: string;
}

// Pipeline progress interface (moved from deprecated aiPipeline.ts)
export interface PipelineProgress {
  storyId: string;
  queueItemId: string;
  currentStep: string;
  steps: PipelineStep[];
  overallProgress: number;
  logs: AILogEntry[];
}

class EnhancedAIPipelineService {
  private progressCallbacks: Map<string, (progress: PipelineProgress) => void> = new Map();
  private activeProcessing: Set<string> = new Set();

  async processQueueItem(
    queueItem: QueueItem,
    modelConfigs: ModelConfig[],
    onProgress?: (progress: PipelineProgress) => void
  ): Promise<EnhancedStory> {
    console.log('🚀 Enhanced AI Pipeline Service - processQueueItem called');
    console.log('🔧 Queue item:', queueItem);
    console.log('🔧 Model configs:', modelConfigs);
    
    // Prevent concurrent processing of the same queue item
    if (this.activeProcessing.has(queueItem.id)) {
      console.error(`❌ Queue item ${queueItem.id} is already being processed!`);
      throw new Error(`Queue item ${queueItem.id} is already being processed`);
    }
    
    this.activeProcessing.add(queueItem.id);
    console.log(`🔒 Added ${queueItem.id} to active processing set`);
    
    if (onProgress) {
      this.progressCallbacks.set(queueItem.id, onProgress);
    }

    // Initialize story in data manager
    storyDataManager.initializeStory(queueItem.id, {
      genre: queueItem.config.genre,
      status: 'processing'
    });

    // Set model configs in the node queue manager
    nodeQueueManager.setModelConfigs(modelConfigs);
    console.log('✅ Model configs set in NodeQueueManager');

    const progress: PipelineProgress = {
      storyId: queueItem.id,
      queueItemId: queueItem.id,
      currentStep: 'story',
      steps: this.initializePipelineSteps(queueItem, modelConfigs),
      overallProgress: 0,
      logs: []
    };

    try {
      // Step 1: Generate Story (must complete first)
      const story = await this.generateStory(queueItem, progress);
      
      // Validate story before proceeding
      const storyValidation = validationService.validateStory(story, 'after story generation');
      validationService.validateOrThrow(storyValidation, 'Story', 'after story generation');
      
      // Update story content in data manager
      storyDataManager.updateStory(queueItem.id, {
        id: story.id || queueItem.id,
        title: story.title,
        content: story.content
      }, 'story');
      
      // Step 2 & 3: Create parallel tasks for shots and character analysis
      const shotPromise = this.createShotList(story, queueItem, progress);
      const characterPromise = this.analyzeCharacters(story, progress);
      
      const [rawShots, characters] = await Promise.all([shotPromise, characterPromise]);
      
      // Create defensive copy of shots to prevent data loss during processing
      const shots = Array.isArray(rawShots) ? [...rawShots.map(shot => ({...shot}))] : [];
      
      // Add shot count validation (legacy method)
      this.validateShotList(shots, 'after shot list creation');
      
      // Comprehensive shots validation using validation service
      const shotsValidation = validationService.validateShots(shots, 'after shot list creation', 1);
      validationService.validateOrThrow(shotsValidation, 'Shots', 'after shot list creation');
      
      // Validate characters if they exist
      if (Array.isArray(characters) && characters.length > 0) {
        const charactersValidation = validationService.validateCharacters(characters, 'after character analysis');
        validationService.validateOrThrow(charactersValidation, 'Characters', 'after character analysis');
      }
      
      // Update shots and characters in data manager
      storyDataManager.updateStory(queueItem.id, {
        shots: shots,
        characters: characters
      }, 'analysis');
      
      // Step 4: Generate visual prompts and ComfyUI prompts for all shots
      const updatedShots = await this.generateVisualPrompts([...shots], characters, progress);
      
      // Validate shot count after prompts generation (legacy method)
      this.validateShotList(updatedShots || shots, 'after visual prompts generation');
      
      // Comprehensive visual prompts validation using validation service
      const finalShotsForValidation = updatedShots || shots;
      const promptsValidation = validationService.validateVisualPrompts(finalShotsForValidation, 'after visual prompts generation');
      validationService.validateOrThrow(promptsValidation, 'Visual Prompts', 'after visual prompts generation');
      
      // Use the updated shots for audio generation
      const finalShots = updatedShots || shots;
      
      // Step 6 & 7: Generate narration and music in parallel (if enabled)
      const audioPromises = [];
      
      if (queueItem.config.narrationGeneration) {
        audioPromises.push(this.generateNarration([...finalShots], progress));
      }
      
      if (queueItem.config.musicGeneration) {
        audioPromises.push(this.generateMusicCues([...finalShots], progress));
      }
      
      if (audioPromises.length > 0) {
        await Promise.all(audioPromises);
      }

      // Final shot count validation before creating story (legacy method)
      this.validateShotList(finalShots, 'before creating enhanced story');

      // Create enhanced story object with proper type validation
      const enhancedStory: EnhancedStory = {
        id: story.id || queueItem.id,
        title: story.title || 'Generated Story',
        content: story.content || '',
        genre: queueItem.config.genre,
        characters: Array.isArray(characters) ? characters : [],
        shots: Array.isArray(finalShots) ? finalShots : [],
        locations: [], // Will be populated by character analysis
        musicCues: [],
        status: 'completed',
        aiLogs: Array.isArray(progress.logs) ? progress.logs : [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Final comprehensive validation of complete story
      const completeStoryValidation = validationService.validateCompleteStory(enhancedStory, 'before final save');
      if (!completeStoryValidation.isValid) {
        // Log validation errors but don't fail - save partial story anyway
        console.warn('⚠️ Complete story validation failed but proceeding with save:', completeStoryValidation.errors);
      }
      
      // Final update to data manager with complete story
      storyDataManager.updateStory(queueItem.id, enhancedStory, 'completed');
      storyDataManager.updateProgress(queueItem.id, 'completed', 100, progress.logs);

      this.completeStep(progress, 'completed');
      this.notifyProgress(progress);

      console.log('🎉 Enhanced AI Pipeline returning story:', enhancedStory.title);
      
      // Return the story from data manager to ensure consistency
      return storyDataManager.getStory(queueItem.id) || enhancedStory;

    } catch (error) {
      this.handleError(progress, error as Error);
      throw error;
    } finally {
      this.progressCallbacks.delete(queueItem.id);
      this.activeProcessing.delete(queueItem.id);
      console.log(`🔓 Removed ${queueItem.id} from active processing set`);
    }
  }

  private initializePipelineSteps(queueItem: QueueItem, modelConfigs: ModelConfig[]) {
    const steps = [
      { id: 'story', name: 'Story Generation', status: 'pending' as const },
      { id: 'shots', name: 'Shot Breakdown', status: 'pending' as const },
      { id: 'characters', name: 'Character Analysis', status: 'pending' as const },
      { id: 'prompts', name: 'Visual Prompts', status: 'pending' as const }
    ];

    // Only add optional steps if enabled and configured
    if (queueItem.config.narrationGeneration && modelConfigs.some(c => c.enabled && c.step === 'narration')) {
      steps.push({ id: 'narration', name: 'Narration Generation', status: 'pending' as const });
    }

    if (queueItem.config.musicGeneration && modelConfigs.some(c => c.enabled && c.step === 'music')) {
      steps.push({ id: 'music', name: 'Music Cue Generation', status: 'pending' as const });
    }

    return steps;
  }

  private async generateStory(queueItem: QueueItem, progress: PipelineProgress): Promise<any> {
    const timestamp = new Date().toISOString();
    console.log(`📝 [${timestamp}] ===== generateStory ENTRY =====`);
    console.log(`📝 [${timestamp}] queueItem.id: ${queueItem.id}`);
    console.log(`📝 [${timestamp}] queueItem.config:`, queueItem.config);
    
    this.updateStep(progress, 'story', 'running');
    
    console.log(`📝 [${timestamp}] About to create NodeQueueManager task for story generation`);
    console.log(`📝 [${timestamp}] This will call nodeQueueManager.addTask()`);
    
    this.addLog(progress, {
      id: Date.now().toString(),
      timestamp: new Date(),
      step: 'story',
      level: 'info',
      message: `Generating story with prompt: ${queueItem.config.prompt.slice(0, 100)}...`
    });

    return new Promise((resolve, reject) => {
      console.log(`📝 [${timestamp}] Creating Promise for story generation...`);
      console.log(`📝 [${timestamp}] About to call nodeQueueManager.addTask() with task data:`, {
        type: 'story',
        priority: 10,
        storyId: queueItem.id,
        data: {
          genre: queueItem.config.genre,
          length: queueItem.config.length,
          prompt: queueItem.config.prompt
        },
        maxAttempts: 3
      });
      
      const taskId = nodeQueueManager.addTask(
        {
          type: 'story',
          priority: 10, // High priority for story generation
          storyId: queueItem.id,
          data: {
            genre: queueItem.config.genre,
            length: queueItem.config.length,
            prompt: queueItem.config.prompt
          },
          maxAttempts: 3
        },
        (wrappedResult) => {
          const callbackTimestamp = new Date().toISOString();
          console.log(`📥 [${callbackTimestamp}] ===== STORY GENERATION CALLBACK RECEIVED =====`);
          console.log(`📥 [${callbackTimestamp}] Wrapped Result:`, wrappedResult);

          // FIX BUG #1: Properly unwrap result - handle both wrapped and unwrapped formats
          const result = wrappedResult?.result || wrappedResult;

          if (!result || (!result.title && !result.content)) {
            console.error(`❌ [${callbackTimestamp}] Invalid result structure:`, wrappedResult);
            reject(new Error('Invalid result from story generation'));
            return;
          }
          console.log(`✅ [${callbackTimestamp}] Story title: "${result.title}"`);
          console.log(`✅ [${callbackTimestamp}] Story content length: ${result.content?.length || 0}`);
          this.completeStep(progress, 'story', `Generated: ${result.title}`);
          console.log(`✅ [${callbackTimestamp}] About to resolve Promise with story result`);
          resolve(result);
        },
        (error) => {
          const errorTimestamp = new Date().toISOString();
          console.error(`❌ [${errorTimestamp}] Story generation error:`, error);
          this.failStep(progress, 'story', error.message);
          reject(error);
        },
        (taskProgress) => {
          const progressTimestamp = new Date().toISOString();
          console.log(`📈 [${progressTimestamp}] Story generation progress:`, taskProgress);
          
          // Handle AI request/response logging
          if (taskProgress.status === 'ai_request') {
            this.addLog(progress, {
              id: Date.now().toString(),
              timestamp: new Date(),
              step: 'story',
              level: 'info',
              message: `🤖 AI Request to ${taskProgress.node} (${taskProgress.model})`,
              details: {
                systemPrompt: taskProgress.systemPrompt,
                userPrompt: taskProgress.userPrompt,
                node: taskProgress.node,
                model: taskProgress.model
              }
            });
          } else if (taskProgress.status === 'ai_response') {
            this.addLog(progress, {
              id: Date.now().toString(),
              timestamp: new Date(),
              step: 'story',
              level: 'success',
              message: `✅ AI Response from ${taskProgress.node} (${taskProgress.response.length} chars)`,
              details: {
                response: taskProgress.response,
                node: taskProgress.node,
                model: taskProgress.model
              }
            });
          } else {
            this.addLog(progress, {
              id: Date.now().toString(),
              timestamp: new Date(),
              step: 'story',
              level: 'info',
              message: `Story generation in progress on node ${taskProgress.node}`
            });
          }
        }
      );

      console.log(`📝 [${timestamp}] nodeQueueManager.addTask() returned taskId: ${taskId}`);
      console.log(`📝 [${timestamp}] Now waiting for NodeQueueManager to process the task...`);
    });
  }

  private async createShotList(story: any, queueItem: QueueItem, progress: PipelineProgress): Promise<any[]> {
    const timestamp = new Date().toISOString();
    console.log(`🎬 [${timestamp}] ===== createShotList ENTRY =====`);
    console.log(`🎬 [${timestamp}] story.id: ${story.id}, story.title: ${story.title}`);
    
    this.updateStep(progress, 'shots', 'running');
    
    this.addLog(progress, {
      id: Date.now().toString(),
      timestamp: new Date(),
      step: 'shots',
      level: 'info',
      message: `Creating shot list for story: ${story.title}`
    });

    return new Promise((resolve, reject) => {
      console.log(`🎬 [${timestamp}] About to call nodeQueueManager.addTask for shot creation`);
      const taskId = nodeQueueManager.addTask(
        {
          type: 'shot',
          priority: 8,
          storyId: story.id,
          data: {
            story: story,
            length: queueItem.config.length
          },
          maxAttempts: 3,
          dependencies: [] // Can run after story completes
        },
        (wrappedResult) => {
          const callbackTimestamp = new Date().toISOString();
          console.log(`🎬 [${callbackTimestamp}] ===== SHOT LIST CALLBACK RECEIVED =====`);
          console.log('Shot list callback received:', wrappedResult);

          // FIX BUG #1: Properly unwrap result - handle both wrapped and unwrapped formats
          const result = wrappedResult?.result || wrappedResult;
          const shots = Array.isArray(result) ? result : [];

          this.completeStep(progress, 'shots', `Generated ${shots.length} shots`);
          resolve(shots);
        },
        (error) => {
          const errorTimestamp = new Date().toISOString();
          console.error(`🎬 [${errorTimestamp}] Shot list creation error:`, error);
          this.failStep(progress, 'shots', error.message);
          reject(error);
        },
        (taskProgress) => {
          const progressTimestamp = new Date().toISOString();
          console.log(`🎬 [${progressTimestamp}] Shot list progress:`, taskProgress);
          
          // Handle AI request/response logging for shot breakdown
          if (taskProgress.status === 'ai_request') {
            this.addLog(progress, {
              id: Date.now().toString(),
              timestamp: new Date(),
              step: 'shots',
              level: 'info',
              message: `🤖 AI Request to ${taskProgress.node} (${taskProgress.model}) - Shot Breakdown`,
              details: {
                systemPrompt: taskProgress.systemPrompt,
                userPrompt: taskProgress.userPrompt,
                node: taskProgress.node,
                model: taskProgress.model
              }
            });
          } else if (taskProgress.status === 'ai_response') {
            this.addLog(progress, {
              id: Date.now().toString(),
              timestamp: new Date(),
              step: 'shots',
              level: 'success',
              message: `✅ AI Response from ${taskProgress.node} - Shot Breakdown (${taskProgress.response.length} chars)`,
              details: {
                response: taskProgress.response,
                node: taskProgress.node,
                model: taskProgress.model
              }
            });
          }
        }
      );

      console.log(`🎬 [${timestamp}] Added shot list generation task: ${taskId}`);
    });
  }

  private async analyzeCharacters(story: any, progress: PipelineProgress): Promise<any[]> {
    const timestamp = new Date().toISOString();
    console.log(`👥 [${timestamp}] ===== analyzeCharacters ENTRY =====`);
    console.log(`👥 [${timestamp}] story.id: ${story.id}, story.title: ${story.title}`);
    
    this.updateStep(progress, 'characters', 'running');
    
    this.addLog(progress, {
      id: Date.now().toString(),
      timestamp: new Date(),
      step: 'characters',
      level: 'info',
      message: 'Analyzing characters and locations for consistency'
    });

    return new Promise((resolve, reject) => {
      console.log(`👥 [${timestamp}] About to call nodeQueueManager.addTask for character analysis`);
      const taskId = nodeQueueManager.addTask(
        {
          type: 'character',
          priority: 8, // Same priority as shots - can run in parallel
          storyId: story.id,
          data: {
            story: story
          },
          maxAttempts: 3,
          dependencies: [] // Can run after story completes
        },
        (wrappedResult) => {
          const callbackTimestamp = new Date().toISOString();
          console.log(`👥 [${callbackTimestamp}] ===== CHARACTER ANALYSIS CALLBACK RECEIVED =====`);
          console.log('Character analysis callback received:', wrappedResult);

          // FIX BUG #1: Properly unwrap result - handle both wrapped and unwrapped formats
          const result = wrappedResult?.result || wrappedResult;
          const characters = Array.isArray(result) ? result : [];

          this.completeStep(progress, 'characters', `Analyzed ${characters.length} characters`);
          resolve(characters);
        },
        (error) => {
          const errorTimestamp = new Date().toISOString();
          console.error(`👥 [${errorTimestamp}] Character analysis error:`, error);
          this.failStep(progress, 'characters', error.message);
          reject(error);
        },
        (taskProgress) => {
          const progressTimestamp = new Date().toISOString();
          console.log(`👥 [${progressTimestamp}] Character analysis progress:`, taskProgress);
          
          // Handle AI request/response logging for character analysis
          if (taskProgress.status === 'ai_request') {
            this.addLog(progress, {
              id: Date.now().toString(),
              timestamp: new Date(),
              step: 'characters',
              level: 'info',
              message: `🤖 AI Request to ${taskProgress.node} (${taskProgress.model}) - Character Analysis`,
              details: {
                systemPrompt: taskProgress.systemPrompt,
                userPrompt: taskProgress.userPrompt,
                node: taskProgress.node,
                model: taskProgress.model
              }
            });
          } else if (taskProgress.status === 'ai_response') {
            this.addLog(progress, {
              id: Date.now().toString(),
              timestamp: new Date(),
              step: 'characters',
              level: 'success',
              message: `✅ AI Response from ${taskProgress.node} - Character Analysis (${taskProgress.response.length} chars)`,
              details: {
                response: taskProgress.response,
                node: taskProgress.node,
                model: taskProgress.model
              }
            });
          }
        }
      );

      console.log(`👥 [${timestamp}] Added character analysis task: ${taskId}`);
    });
  }

  private async generateVisualPrompts(shots: any[], characters: any[], progress: PipelineProgress): Promise<any[]> {
    this.updateStep(progress, 'prompts', 'running');
    
    this.addLog(progress, {
      id: Date.now().toString(),
      timestamp: new Date(),
      step: 'prompts',
      level: 'info',
      message: `Generating ComfyUI prompts for ${shots.length} shots`
    });

    // Create tasks for each shot to generate ComfyUI prompts directly
    const promptTasks = shots.map((shot, index) => {
      const relevantCharacters = this.findRelevantCharacters(shot, characters);
      
      return new Promise((resolve, reject) => {
        nodeQueueManager.addTask(
          {
            type: 'comfyui_prompts',
            priority: 5, // Lower priority than story/shots/characters
            storyId: shot.storyId,
            data: {
              shot: shot,
              characters: relevantCharacters,
              shotNumber: shot.shotNumber
            },
            maxAttempts: 2
          },
          (wrappedResult) => {
            // FIX BUG #6: Properly unwrap result - handle both wrapped and unwrapped formats
            const result = wrappedResult?.result || wrappedResult;
            const positivePrompt = result?.positivePrompt || '';
            const negativePrompt = result?.negativePrompt || '';

            // Set both ComfyUI prompts and a basic visual prompt for compatibility
            shot.comfyUIPositivePrompt = positivePrompt;
            shot.comfyUINegativePrompt = negativePrompt;
            shot.visualPrompt = positivePrompt; // Use positive prompt as visual prompt

            // Update shot in data manager immediately
            storyDataManager.updateShot(shot.storyId, shot.id, {
              comfyUIPositivePrompt: positivePrompt,
              comfyUINegativePrompt: negativePrompt,
              visualPrompt: positivePrompt
            });
            
            this.addLog(progress, {
              id: Date.now().toString(),
              timestamp: new Date(),
              step: 'prompts',
              level: 'success',
              message: `Generated ComfyUI prompts for shot ${shot.shotNumber}`
            });
            
            console.log(`🎨 Generated ComfyUI prompts for shot ${shot.shotNumber}`);
            console.log(`🎨 Positive: ${positivePrompt.slice(0, 100)}...`);
            console.log(`🎨 Negative: ${negativePrompt.slice(0, 100)}...`);
            resolve(result);
          },
          (error) => {
            console.error(`Failed to generate ComfyUI prompts for shot ${shot.shotNumber}:`, error);
            
            this.addLog(progress, {
              id: Date.now().toString(),
              timestamp: new Date(),
              step: 'prompts',
              level: 'error',
              message: `Failed to generate prompts for shot ${shot.shotNumber}: ${error.message}`
            });
            
            // Set fallback prompts
            shot.visualPrompt = `Error generating prompt: ${error.message}`;
            shot.comfyUIPositivePrompt = '';
            shot.comfyUINegativePrompt = '';
            resolve(null); // Don't fail the whole process for one shot
          },
          (taskProgress) => {
            const progressTimestamp = new Date().toISOString();
            console.log(`🎨 [${progressTimestamp}] Visual prompts progress for shot ${shot.shotNumber}:`, taskProgress);
            
            // Handle AI request/response logging for visual prompts
            if (taskProgress.status === 'ai_request') {
              this.addLog(progress, {
                id: Date.now().toString(),
                timestamp: new Date(),
                step: 'prompts',
                level: 'info',
                message: `🤖 AI Request to ${taskProgress.node} (${taskProgress.model}) - Visual Prompts Shot ${shot.shotNumber}`,
                details: {
                  systemPrompt: taskProgress.systemPrompt,
                  userPrompt: taskProgress.userPrompt,
                  node: taskProgress.node,
                  model: taskProgress.model,
                  shotNumber: shot.shotNumber
                }
              });
            } else if (taskProgress.status === 'ai_response') {
              this.addLog(progress, {
                id: Date.now().toString(),
                timestamp: new Date(),
                step: 'prompts',
                level: 'success',
                message: `✅ AI Response from ${taskProgress.node} - Visual Prompts Shot ${shot.shotNumber} (${taskProgress.response.length} chars)`,
                details: {
                  response: taskProgress.response,
                  node: taskProgress.node,
                  model: taskProgress.model,
                  shotNumber: shot.shotNumber
                }
              });
            }
          }
        );

        console.log(`🎨 Added ComfyUI prompt task for shot ${shot.shotNumber}`);
      });
    });

    await Promise.all(promptTasks);
    
    // Validate shots array integrity after prompt generation
    this.validateShotList(shots, 'during visual prompts generation');
    
    // Final update to ensure all prompts are saved
    storyDataManager.updateStory(progress.storyId, {
      shots: shots
    }, 'prompts');
    
    this.completeStep(progress, 'prompts', `Generated ComfyUI prompts for ${shots.length} shots`);
    
    // Return the updated shots array
    return shots;
  }

  private async generateNarration(shots: any[], progress: PipelineProgress): Promise<void> {
    this.updateStep(progress, 'narration', 'running');
    
    const shotsWithDialogue = shots.filter(shot => shot.narration && shot.narration.trim());
    
    this.addLog(progress, {
      id: Date.now().toString(),
      timestamp: new Date(),
      step: 'narration',
      level: 'info',
      message: `Processing narration for ${shotsWithDialogue.length} shots with dialogue`
    });

    const narrationTasks = shotsWithDialogue.map(shot => {
      return new Promise((resolve, reject) => {
        nodeQueueManager.addTask(
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
          (error) => {
            console.error(`Failed to generate narration for shot ${shot.shotNumber}:`, error);
            resolve(null);
          }
        );
      });
    });

    await Promise.all(narrationTasks);
    this.completeStep(progress, 'narration', `Processed narration for ${shotsWithDialogue.length} shots`);
  }

  private async generateMusicCues(shots: any[], progress: PipelineProgress): Promise<void> {
    this.updateStep(progress, 'music', 'running');
    
    const shotsWithMusic = shots.filter(shot => shot.musicCue && shot.musicCue.trim());
    
    this.addLog(progress, {
      id: Date.now().toString(),
      timestamp: new Date(),
      step: 'music',
      level: 'info',
      message: `Generating music cues for ${shotsWithMusic.length} shots`
    });

    const musicTasks = shotsWithMusic.map(shot => {
      return new Promise((resolve, reject) => {
        nodeQueueManager.addTask(
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
          (error) => {
            console.error(`Failed to generate music cue for shot ${shot.shotNumber}:`, error);
            resolve(null);
          }
        );
      });
    });

    await Promise.all(musicTasks);
    this.completeStep(progress, 'music', `Generated music cues for ${shotsWithMusic.length} shots`);
  }


  private findRelevantCharacters(shot: any, characters: any[]): any[] {
    const shotDesc = shot.description.toLowerCase();
    return characters.filter(char => 
      shotDesc.includes(char.name.toLowerCase()) ||
      shotDesc.includes(char.role.toLowerCase())
    );
  }

  private validateShotList(shots: any[], stepName: string): void {
    if (!Array.isArray(shots)) {
      console.error(`❌ Shot validation failed at ${stepName}: not an array`, shots);
      throw new Error(`Invalid shot list at step ${stepName}: expected array but got ${typeof shots}`);
    }
    
    if (shots.length === 0) {
      console.warn(`⚠️ Shot validation warning at ${stepName}: empty shot list`);
      return;
    }
    
    // Check for required fields in each shot
    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      if (!shot || typeof shot !== 'object') {
        console.error(`❌ Shot validation failed at ${stepName}: shot ${i} is not an object`, shot);
        throw new Error(`Invalid shot data at step ${stepName}: shot ${i} is not an object`);
      }
      
      if (!shot.description || typeof shot.description !== 'string') {
        console.error(`❌ Shot validation failed at ${stepName}: shot ${i} missing description`, shot);
        throw new Error(`Invalid shot data at step ${stepName}: shot ${i} missing description`);
      }
      
      if (typeof shot.duration !== 'number' || shot.duration <= 0) {
        console.error(`❌ Shot validation failed at ${stepName}: shot ${i} invalid duration`, shot);
        throw new Error(`Invalid shot data at step ${stepName}: shot ${i} has invalid duration`);
      }
    }
    
    console.log(`✅ Shot list validation passed at ${stepName}: ${shots.length} shots`);
  }

  private updateStep(progress: PipelineProgress, stepId: string, status: 'running' | 'completed' | 'failed') {
    console.log(`📈 updateStep called: ${stepId} -> ${status}`);
    const step = progress.steps.find(s => s.id === stepId);
    if (step) {
      step.status = status;
      if (status === 'running') {
        step.startTime = new Date();
        progress.currentStep = stepId;
      } else if (status === 'completed') {
        step.endTime = new Date();
      }
      
      // Calculate overall progress
      const completedSteps = progress.steps.filter(s => s.status === 'completed').length;
      progress.overallProgress = Math.round((completedSteps / progress.steps.length) * 100);
      
      console.log(`📈 Progress updated: ${progress.overallProgress}% (${completedSteps}/${progress.steps.length} steps)`);
      this.notifyProgress(progress);
    }
  }

  private completeStep(progress: PipelineProgress, stepId: string, output?: string): void {
    const step = progress.steps.find(s => s.id === stepId);
    if (!step) return;

    step.status = 'completed';
    step.endTime = new Date();
    if (output) step.output = output;

    const completedSteps = progress.steps.filter(s => s.status === 'completed').length;
    progress.overallProgress = Math.floor((completedSteps / progress.steps.length) * 100);

    // Import debugService dynamically to avoid circular imports
    import('../services/debugService').then(({ debugService }) => {
      debugService.stepComplete(stepId, output || `Step ${stepId} completed`, {
        overallProgress: progress.overallProgress,
        totalSteps: progress.steps.length,
        completedSteps,
        storyId: progress.storyId,
        queueItemId: progress.queueItemId
      });
      
      // Log when steps are ready for viewing
      if (stepId === 'story' && output) {
        debugService.success('ui', '📖 Story content is now ready for viewing', { storyId: progress.storyId });
      } else if (stepId === 'shots' && output) {
        debugService.success('ui', '🎬 Shot breakdown is now ready for viewing', { storyId: progress.storyId });
      } else if (stepId === 'characters' && output) {
        debugService.success('ui', '👥 Character analysis is now ready for viewing', { storyId: progress.storyId });
      } else if (stepId === 'prompts' && output) {
        debugService.success('ui', '🎨 Visual prompts are now ready for viewing', { storyId: progress.storyId });
      } else if (stepId === 'completed') {
        debugService.success('ui', '🎉 Full story generation is complete and ready for viewing!', { 
          storyId: progress.storyId,
          overallProgress: progress.overallProgress 
        });
      }
    }).catch(err => console.warn('Debug service import failed:', err));

    this.notifyProgress(progress);
  }

  private failStep(progress: PipelineProgress, stepId: string, error: string): void {
    const step = progress.steps.find(s => s.id === stepId);
    if (!step) return;

    step.status = 'failed';
    step.endTime = new Date();
    step.error = error;

    this.addLog(progress, {
      id: Date.now().toString(),
      timestamp: new Date(),
      step: stepId,
      level: 'error',
      message: error
    });

    this.notifyProgress(progress);
  }

  private handleError(progress: PipelineProgress, error: Error): void {
    this.addLog(progress, {
      id: Date.now().toString(),
      timestamp: new Date(),
      step: progress.currentStep,
      level: 'error',
      message: `Pipeline failed: ${error.message}`
    });

    this.notifyProgress(progress);
  }

  private addLog(progress: PipelineProgress, log: AILogEntry): void {
    // FIX BUG #2: Implement log rotation to prevent memory bloat
    const MAX_LOGS = 500;
    progress.logs.unshift(log); // Add to beginning for latest first

    // Trim logs if exceeding maximum
    if (progress.logs.length > MAX_LOGS) {
      progress.logs = progress.logs.slice(0, MAX_LOGS);
    }

    this.notifyProgress(progress);
  }

  private notifyProgress(progress: PipelineProgress): void {
    console.log(`📢 notifyProgress called for queue item ${progress.queueItemId}:`);
    console.log(`📢 - currentStep: ${progress.currentStep}`);
    console.log(`📢 - overallProgress: ${progress.overallProgress}%`);
    console.log(`📢 - logs count: ${progress.logs.length}`);
    
    // Update progress in data manager
    storyDataManager.updateProgress(progress.storyId, progress.currentStep, progress.overallProgress, progress.logs);
    
    // Only notify if this item is still being actively processed
    if (!this.activeProcessing.has(progress.queueItemId)) {
      console.log(`📢 Queue item ${progress.queueItemId} no longer active, skipping progress callback`);
      return;
    }
    
    const callback = this.progressCallbacks.get(progress.queueItemId);
    if (callback) {
      console.log(`📢 Calling progress callback for active queue item ${progress.queueItemId}`);
      callback({ ...progress });
    } else {
      console.log(`📢 No progress callback registered for queue item ${progress.queueItemId}`);
    }
  }
}

export const enhancedAiPipelineService = new EnhancedAIPipelineService();