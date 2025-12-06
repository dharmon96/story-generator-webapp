/**
 * Singleton Queue Processor - Single source of truth for queue processing
 * Replaces complex global state management with simple, reliable processing
 */

import { QueueItem, ModelConfig } from '../store/useStore';
import { sequentialAiPipelineService } from './sequentialAiPipeline';
import { debugService } from './debugService';
import { nodeDiscoveryService } from './nodeDiscovery';

export interface ProcessingStatus {
  isProcessing: boolean;
  currentItemId: string | null;
  startedAt: Date | null;
  queueLength: number;
  errors: string[];
}

class QueueProcessor {
  private static instance: QueueProcessor;
  
  // Simple state management
  private processingLock = new Set<string>(); // Items currently being processed
  private isRunning = false; // Overall processing state
  private currentItemId: string | null = null;
  private abortController: AbortController | null = null;
  
  // Callbacks
  private progressCallbacks = new Map<string, (progress: any) => void>();
  private statusCallbacks = new Set<(status: ProcessingStatus) => void>();
  private errors: string[] = [];

  static getInstance(): QueueProcessor {
    if (!QueueProcessor.instance) {
      QueueProcessor.instance = new QueueProcessor();
    }
    return QueueProcessor.instance;
  }

  private constructor() {
    debugService.info('queue', '🔧 QueueProcessor singleton initialized');
  }

  /**
   * Check if a specific item is being processed
   */
  isItemProcessing(itemId: string): boolean {
    return this.processingLock.has(itemId);
  }

  /**
   * Check if queue is currently processing
   */
  isQueueProcessing(): boolean {
    return this.isRunning;
  }

  /**
   * Get current processing status
   */
  getStatus(): ProcessingStatus {
    return {
      isProcessing: this.isRunning,
      currentItemId: this.currentItemId,
      startedAt: this.currentItemId ? new Date() : null,
      queueLength: this.processingLock.size,
      errors: [...this.errors]
    };
  }

  /**
   * Start processing queue items
   */
  async startProcessing(
    queue: QueueItem[], 
    modelConfigs: ModelConfig[],
    updateQueueItem: (id: string, updates: any) => void,
    addStory: (story: any) => void
  ): Promise<void> {
    debugService.info('queue', '🚀 QueueProcessor.startProcessing called');
    
    if (this.isRunning) {
      debugService.warn('queue', '⚠️ Queue processing already running');
      return;
    }

    // Validate setup first
    try {
      await this.validateSetup(modelConfigs);
    } catch (error: any) {
      debugService.error('queue', `❌ Setup validation failed: ${error.message}`);
      this.addError(error.message);
      throw error;
    }

    this.isRunning = true;
    this.errors = []; // Clear previous errors
    this.notifyStatusChange();

    // Start health monitoring during processing
    nodeDiscoveryService.startHealthMonitoring(30000); // Check every 30 seconds

    debugService.info('queue', '✅ Queue processing started (health monitoring active)');

    try {
      await this.processQueueItems(queue, modelConfigs, updateQueueItem, addStory);
    } finally {
      this.isRunning = false;
      this.currentItemId = null;

      // Stop health monitoring when processing ends
      nodeDiscoveryService.stopHealthMonitoring();

      this.notifyStatusChange();
      debugService.info('queue', '🏁 Queue processing stopped (health monitoring stopped)');
    }
  }

  /**
   * Stop all processing
   */
  stopProcessing(): void {
    debugService.info('queue', '🛑 QueueProcessor.stopProcessing called');
    
    this.isRunning = false;
    
    // Abort current processing if active
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Call pipeline stop to abort any running AI processes
    sequentialAiPipelineService.stopAllProcessing();

    // Clear processing locks
    this.processingLock.clear();
    this.currentItemId = null;
    
    this.notifyStatusChange();
    debugService.info('queue', '✅ All processing stopped');
  }

  /**
   * Process queue items sequentially
   */
  private async processQueueItems(
    queue: QueueItem[],
    modelConfigs: ModelConfig[],
    updateQueueItem: (id: string, updates: any) => void,
    addStory: (story: any) => void
  ): Promise<void> {
    // Track items that have been processed in this session to prevent re-processing
    // This is needed because the queue array is a snapshot that doesn't update
    const processedItemIds = new Set<string>();

    while (this.isRunning) {
      // Find next queued item by priority
      // Filter out items that have been processed or are currently being processed
      const queuedItems = queue.filter(item =>
        item.status === 'queued' &&
        !this.processingLock.has(item.id) &&
        !processedItemIds.has(item.id)  // FIX: Don't re-process items from stale queue snapshot
      );

      if (queuedItems.length === 0) {
        debugService.info('queue', '✅ No more queued items, stopping processing');
        break;
      }

      // Sort by priority (highest first)
      const nextItem = queuedItems.sort((a, b) => b.priority - a.priority)[0];

      debugService.info('queue', `🎯 Processing item: ${nextItem.config.prompt.slice(0, 50)}... (ID: ${nextItem.id})`);

      try {
        await this.processItem(nextItem, modelConfigs, updateQueueItem, addStory);
        // Mark as processed after successful completion
        processedItemIds.add(nextItem.id);
      } catch (error: any) {
        debugService.error('queue', `❌ Failed to process item ${nextItem.id}: ${error.message}`);
        this.addError(`Failed to process "${nextItem.config.prompt.slice(0, 30)}...": ${error.message}`);

        // Mark item as failed
        updateQueueItem(nextItem.id, {
          status: 'failed',
          error: error.message,
          completedAt: new Date()
        });
        // Also mark as processed so we don't retry in this session (user can manually re-queue)
        processedItemIds.add(nextItem.id);
      } finally {
        // Always clean up processing state
        this.processingLock.delete(nextItem.id);
        if (this.currentItemId === nextItem.id) {
          this.currentItemId = null;
        }
        this.notifyStatusChange();
      }
    }
  }

  /**
   * Process a single queue item
   */
  private async processItem(
    item: QueueItem,
    modelConfigs: ModelConfig[],
    updateQueueItem: (id: string, updates: any) => void,
    addStory: (story: any) => void
  ): Promise<void> {
    
    // Acquire processing lock
    if (this.processingLock.has(item.id)) {
      throw new Error(`Item ${item.id} is already being processed`);
    }
    
    this.processingLock.add(item.id);
    this.currentItemId = item.id;
    this.abortController = new AbortController();
    
    debugService.info('queue', `🔒 Acquired processing lock for item ${item.id}`);

    // Mark item as processing
    updateQueueItem(item.id, {
      status: 'processing',
      startedAt: new Date(),
      progress: 0
    });

    this.notifyStatusChange();

    // Register progress callback
    // FIX BUG-003: Pass step ID (not display name) to store, let UI handle display mapping
    const progressCallback = (progress: any) => {
      debugService.info('queue', `📈 Progress for ${item.id}: ${progress.overallProgress}% - Step: ${progress.currentStep} (${progress.currentStepName})`);

      updateQueueItem(item.id, {
        progress: progress.overallProgress || 0,
        // Use step ID (currentStep) for the store, not the display name (currentStepName)
        // This allows the UI to properly map IDs to emoji display names
        currentStep: progress.currentStep || 'processing',
        logs: progress.logs || []
      });
    };

    this.progressCallbacks.set(item.id, progressCallback);

    try {
      // Process the item using the sequential AI pipeline
      const story = await sequentialAiPipelineService.processQueueItem(
        item,
        modelConfigs,
        progressCallback
      );

      if (!story) {
        throw new Error('Story processing returned null');
      }

      debugService.success('queue', `✅ Successfully processed: ${story.title}`, {
        hasHoloCineScenes: !!story.holoCineScenes,
        holoCineScenesCount: story.holoCineScenes?.length || 0,
        generationMethod: story.generationMethod
      });

      // Convert to store-compatible format and save
      const basicStory = this.convertToBasicStory(story, item);

      debugService.info('queue', `💾 Saving story with HoloCine data:`, {
        id: basicStory.id,
        hasHoloCineScenes: !!basicStory.holoCineScenes,
        holoCineScenesCount: basicStory.holoCineScenes?.length || 0,
        generationMethod: basicStory.generationMethod
      });

      addStory(basicStory);

      // Mark queue item as completed
      updateQueueItem(item.id, {
        status: 'completed',
        completedAt: new Date(),
        progress: 100,
        storyId: story.id
      });

      debugService.success('queue', `💾 Story saved and queue item completed: ${story.title}`);

    } finally {
      // Clean up
      this.progressCallbacks.delete(item.id);
      if (this.abortController) {
        this.abortController = null;
      }
    }
  }

  /**
   * Convert enhanced story to basic story format for store
   */
  private convertToBasicStory(story: any, queueItem: QueueItem): any {
    return {
      id: story.id,
      title: story.title,
      content: story.content,
      genre: queueItem.config.genre,
      shots: story.shots?.map((shot: any) => ({
        id: shot.id,
        storyId: story.id,
        shotNumber: shot.shotNumber,
        description: shot.description,
        duration: shot.duration,
        frames: Math.floor(shot.duration * 24),
        camera: shot.cameraMovement || 'medium shot',
        visualPrompt: shot.visualPrompt,
        comfyUIPositivePrompt: shot.comfyUIPositivePrompt,
        comfyUINegativePrompt: shot.comfyUINegativePrompt,
        narration: shot.narration,
        musicCue: shot.musicCue,
        renderStatus: shot.renderStatus as 'pending' | 'rendering' | 'completed' || 'pending'
      })) || [],
      // FIX BUG #3: Handle both snake_case and camelCase field names
      characters: story.characters?.map((char: any) => ({
        name: char.name,
        role: char.role === 'protagonist' ? 'main' : (char.role === 'main' ? 'main' : 'supporting'),
        physical_description: char.physical_description || char.physicalDescription || '',
        age_range: char.age_range || char.age || '',
        importance_level: char.importance_level || char.importanceLevel || 3
      })) || [],
      // Locations
      locations: story.locations || [],
      // HoloCine scene-based pipeline fields
      holoCineScenes: story.holoCineScenes || undefined,
      holoCineCharacterMap: story.holoCineCharacterMap || undefined,
      // Generation method used
      generationMethod: story.generationMethod || queueItem.config.generationMethod || undefined,
      // Story parts for multi-video architecture
      storyParts: story.storyParts || undefined,
      totalParts: story.totalParts || undefined,
      status: 'completed',
      createdAt: story.createdAt,
      updatedAt: story.updatedAt
    };
  }

  /**
   * Validate processing setup
   */
  private async validateSetup(modelConfigs: ModelConfig[]): Promise<void> {
    debugService.info('queue', '🔍 Validating processing setup...');
    
    // Check if model configs are set up
    if (!modelConfigs || modelConfigs.length === 0) {
      throw new Error('No model configurations found. Please configure models in Settings.');
    }

    const enabledConfigs = modelConfigs.filter(config => 
      config.enabled && config.nodeId && config.model
    );

    if (enabledConfigs.length === 0) {
      throw new Error('No enabled model configurations found. Please enable at least one model configuration in Settings.');
    }

    // Check if required steps are configured
    const requiredSteps = ['story', 'shots', 'characters', 'prompts'];
    const configuredSteps = enabledConfigs.map(config => config.step);
    const missingSteps = requiredSteps.filter(step => !configuredSteps.includes(step));

    if (missingSteps.length > 0) {
      throw new Error(`Missing required model configurations for steps: ${missingSteps.join(', ')}. Please configure these in Settings.`);
    }

    // Verify nodes are reachable
    const nodes = nodeDiscoveryService.getNodes();
    
    for (const config of enabledConfigs) {
      const node = nodes.find(n => n.id === config.nodeId);
      if (!node) {
        throw new Error(`Node '${config.nodeId}' not found for step '${config.step}'. Please refresh nodes in Settings.`);
      }
      
      if (node.status !== 'online') {
        throw new Error(`Node '${node.name}' is offline for step '${config.step}'. Please check the node connection.`);
      }
      
      if (!node.models.includes(config.model)) {
        throw new Error(`Model '${config.model}' not available on node '${node.name}' for step '${config.step}'. Please select a different model or refresh the node.`);
      }
    }
    
    debugService.success('queue', '✅ Processing setup validation passed');
  }

  /**
   * Subscribe to status changes
   */
  onStatusChange(callback: (status: ProcessingStatus) => void): () => void {
    this.statusCallbacks.add(callback);
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }

  /**
   * Add error to error list
   */
  private addError(error: string): void {
    this.errors.push(error);
    this.notifyStatusChange();
  }

  /**
   * Clear all errors
   */
  clearErrors(): void {
    this.errors = [];
    this.notifyStatusChange();
  }

  /**
   * Notify all status subscribers
   */
  private notifyStatusChange(): void {
    const status = this.getStatus();
    this.statusCallbacks.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('Error in status callback:', error);
      }
    });
  }
}

// Export singleton instance
export const queueProcessor = QueueProcessor.getInstance();