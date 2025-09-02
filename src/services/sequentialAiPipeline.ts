import { QueueItem, Story, ModelConfig } from '../store/useStore';
import { nodeQueueManager } from './nodeQueueManager';
import { debugService } from './debugService';

// Simple in-memory story data manager for partial saves
const storyDataManager = {
  partialStories: new Map<string, Story>(),
  
  savePartialStory(story: Story) {
    this.partialStories.set(story.id, { ...story });
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
      
      // Define processing steps
      const steps: StepDefinition[] = [
        { id: 'story', name: 'Story Generation', required: true },
        { id: 'segments', name: 'Story Segmentation', required: true },
        { id: 'shots', name: 'Shot Breakdown', required: true },
        { id: 'characters', name: 'Character Analysis', required: true },
        { id: 'prompts', name: 'Visual Prompts', required: true },
        { 
          id: 'narration', 
          name: 'Narration Generation', 
          required: false,
          configCheck: (config) => config.narrationGeneration
        },
        { 
          id: 'music', 
          name: 'Music Cue Generation', 
          required: false,
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
      let partialStory: Story | null = null;

      // Process each step sequentially
      for (let i = 0; i < activeSteps.length; i++) {
        const step = activeSteps[i];
        const overallProgress = Math.round((i / activeSteps.length) * 100);
        
        // Check for abort signal before each step
        if (abortController.signal.aborted) {
          throw new Error('Processing aborted by user');
        }
        
        this.updateProgress(progress, step.id, step.name, overallProgress, 0);

        const nodeInfo = this.getNextAvailableNode(modelConfigs, step.id, queueItem.id);
        debugService.info('pipeline', `⚙️ Step ${i + 1}/${activeSteps.length}: ${step.name}`, {
          stepId: step.id,
          overallProgress,
          assignedNode: nodeInfo?.name,
          assignedModel: nodeInfo?.model
        });

        if (nodeInfo) {
          this.assignNode(nodeInfo.id, queueItem.id, step.id, nodeInfo.model);
        }

        switch (step.id) {
          case 'story':
            story = await this.executeStoryStep(queueItem, nodeInfo, progress);
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
            
            debugService.success('pipeline', `✅ Generated ${storyParts.length} story parts`);
            break;
          
          case 'shots':
            if (!storyParts || storyParts.length === 0) throw new Error('Story parts required for shot breakdown');
            shots = await this.executeShotsForPartsStep(storyParts, story, queueItem, nodeInfo, progress);
            
            // Validate shots were generated
            if (!shots || shots.length === 0) {
              throw new Error('Shot breakdown failed to generate any shots');
            }
            
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
            characters = await this.executeCharactersStep(story, queueItem, nodeInfo, progress);
            // Update partial story with characters
            if (partialStory && characters.length > 0) {
              partialStory.characters = characters;
              partialStory.updatedAt = new Date();
              storyDataManager.savePartialStory(partialStory);
              debugService.info('pipeline', `💾 Updated story with ${characters.length} characters`);
            }
            break;
          
          case 'prompts':
            if (!shots.length) throw new Error('Shots required for prompt generation');
            await this.executePromptsStep(shots, characters, queueItem, modelConfigs, progress);
            break;
          
          case 'narration':
            if (!shots.length) throw new Error('Shots required for narration');
            await this.executeNarrationStep(shots, queueItem, modelConfigs, progress);
            break;
          
          case 'music':
            if (!shots.length) throw new Error('Shots required for music generation');
            await this.executeMusicStep(shots, queueItem, modelConfigs, progress);
            break;
        }

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

      // Final progress update
      this.updateProgress(progress, 'completed', 'Complete', 100, 100);
      progress.status = 'completed';

      debugService.success('pipeline', `🎉 Sequential pipeline completed: ${finalStory.title}`, {
        storyId: finalStory.id,
        shotCount: shots.length,
        characterCount: characters.length
      });

      return finalStory;

    } catch (error) {
      progress.status = 'failed';
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
    progress: SequentialProgress
  ): Promise<void> {
    debugService.info('ai', `🎨 Starting visual prompts for ${shots.length} shots`);

    // Process prompts for all shots concurrently (this step can use multiple nodes)
    const promptPromises = shots.map((shot, index) => {
      const nodeInfo = this.getNextAvailableNode(modelConfigs, 'prompts', queueItem.id);
      if (!nodeInfo) throw new Error('No node available for prompt generation');

      return new Promise((resolve, reject) => {
        const taskId = nodeQueueManager.addTask(
          {
            type: 'comfyui_prompts',
            priority: 5,
            storyId: shot.storyId,
            data: {
              shot: shot,
              characters: characters,
              shotNumber: shot.shotNumber
            },
            maxAttempts: 2
          },
          (result) => {
            shot.visualPrompt = result.positivePrompt;
            shot.negativePrompt = result.negativePrompt;
            resolve(result);
          },
          (error) => reject(error)
        );
      });
    });

    await Promise.all(promptPromises);
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
      partCount: storyParts.length
    });

    const allShots: any[] = [];
    let currentShotNumber = 1;

    // Process each story part sequentially
    for (let i = 0; i < storyParts.length; i++) {
      const part = storyParts[i];
      
      debugService.info('ai', `🎬 Processing part ${i + 1}/${storyParts.length}: ${part.title}`, {
        partNumber: part.part_number,
        partTitle: part.title,
        partContent: part.content?.length + ' characters'
      });

      const partShots = await new Promise<any[]>((resolve, reject) => {
        const taskId = nodeQueueManager.addTask(
          {
            type: 'shot',
            priority: 8,
            storyId: story.id,
            data: {
              story: story, // Full story for context
              storyPart: part, // Specific part to break down
              length: queueItem.config.length,
              partNumber: part.part_number,
              totalParts: storyParts.length,
              startingShotNumber: currentShotNumber
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

      // Add shots from this part to the total, updating shot numbers
      if (partShots.length > 0) {
        const adjustedShots = partShots.map((shot, index) => ({
          ...shot,
          shot_number: currentShotNumber + index,
          part_number: part.part_number,
          part_title: part.title
        }));
        
        allShots.push(...adjustedShots);
        currentShotNumber += partShots.length;
      }
    }

    debugService.success('ai', `✅ All parts completed: ${allShots.length} total shots from ${storyParts.length} parts`);
    return allShots;
  }
}

export const sequentialAiPipelineService = new SequentialAiPipelineService();