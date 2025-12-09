import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { debugService } from '../services/debugService';
import { GenerationMethodId } from '../types/generationMethods';

export interface StoryConfig {
  prompt: string;
  genre: string;
  length: string;
  visualStyle: string;
  aspectRatio: string;
  fps: string;
  autoPrompt: boolean;
  priority: number;
  characterConsistency: boolean;
  musicGeneration: boolean;
  narrationGeneration: boolean;
  // Generation method selection (defaults to 'holocine' if not specified)
  generationMethod?: GenerationMethodId;  // 'holocine' | 'wan22' | 'kling' | etc.
  // Legacy option (deprecated, use generationMethod instead)
  generateComfyUIPrompts?: boolean;
}

export interface QueueItem {
  id: string;
  config: StoryConfig;
  priority: number;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  currentStep?: string;
  error?: string;
  logs?: any[]; // AI generation logs
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  storyId?: string;
}

export interface StoryPart {
  partNumber: number;
  title: string;
  content: string;
  narrativePurpose: 'introduction' | 'conflict' | 'development' | 'climax' | 'resolution';
  durationEstimate: number;
  shotCount?: number;
}

export interface Story {
  id: string;
  title: string;
  content: string;  // Master story content (full story)
  genre: string;
  shots: Shot[];
  characters?: Character[];
  locations?: StoryLocation[];  // Locations extracted from the story
  prompts?: string[];
  narrations?: string[];
  musicCues?: string[];
  createdAt: Date;
  updatedAt?: Date;
  status: 'draft' | 'generating' | 'completed';
  generationData?: any; // Store intermediate generation data

  // Generation method used for this story
  generationMethod?: GenerationMethodId;  // Which pipeline was used

  // Master Story Architecture fields
  masterStoryId?: string;  // If this is a part, references the master story
  storyParts?: StoryPart[];  // Array of story parts for multi-video production
  totalParts?: number;  // Total number of parts this story is divided into
  logline?: string;  // Story logline/summary for context
  totalDuration?: number;  // Total estimated duration in seconds

  // HoloCine scene organization (scene-based pipeline output)
  holoCineScenes?: HoloCineScene[];  // Scenes organized for HoloCine generation
  holoCineCharacterMap?: Record<string, string>;  // characterId -> "[character1]" mapping
}

// Import HoloCine types inline to avoid circular dependencies
export interface HoloCineScene {
  id: string;
  sceneNumber: number;
  title: string;
  globalCaption: string;
  shotCaptions: string[];
  shotCutFrames?: number[];
  numFrames: 241 | 81;
  resolution: '832x480' | '480x832' | '832x832';
  fps: number;
  characters: Array<{
    id: string;
    holoCineRef: string;
    refNumber: number;
    name: string;
    description: string;
  }>;
  primaryLocation: string;
  locationDescription: string;
  estimatedDuration: number;
  shotIds: string[];
  partNumber?: number;
  partTitle?: string;
  status: 'draft' | 'ready' | 'generating' | 'completed' | 'failed';
  videoUrl?: string;
  thumbnailUrl?: string;
  generatedAt?: Date;
  error?: string;
}

export interface Character {
  id?: string;
  name: string;
  role: string;
  physical_description: string;
  age_range?: string;
  gender?: string;
  clothing?: string;
  distinctiveFeatures?: string[];
  personality?: string;
  importance_level?: number;
  screenTime?: number;
  visualPrompt?: string;
}

export interface StoryLocation {
  id?: string;
  name: string;
  type: 'interior' | 'exterior' | 'mixed' | string;
  description: string;
  atmosphere?: string;
  lighting?: string;
  timeOfDay?: string;
  weather?: string;
  keyElements?: string[];
  colorPalette?: string[];
  visualPrompt?: string;
  usedInShots?: string[];
}

export interface Shot {
  id: string;
  storyId: string;
  shotNumber: number;
  description: string;
  duration: number;
  frames: number;

  // Camera information
  camera: string;
  cameraMovement?: string;
  shotType?: 'wide' | 'medium' | 'close-up' | 'extreme-close' | 'establishing' | 'tracking' | 'panning';
  angle?: 'eye-level' | 'low-angle' | 'high-angle' | 'birds-eye' | 'worms-eye';

  // Visual generation
  visualPrompt?: string;
  comfyUIPositivePrompt?: string;
  comfyUINegativePrompt?: string;
  styleReference?: string;

  // Audio elements
  narration?: string;
  dialogue?: Array<{ character: string; text: string; timing?: number }>;
  musicCue?: string;
  soundEffects?: string[];

  // Rendering
  renderStatus?: 'pending' | 'prompt-generated' | 'rendering' | 'completed' | 'failed';
  renderUrl?: string;
  renderProgress?: number;

  // Metadata
  characters?: string[];
  locations?: string[];
  complexity?: 'simple' | 'moderate' | 'complex';

  // Part reference for multi-video coherence
  partNumber?: number;  // Which part this shot belongs to (1-indexed)
  partTitle?: string;   // Title of the part this shot belongs to
}

export interface ResearchData {
  trendingTopics: string[];
  contentAnalysis: any[];
  generatedPrompts: string[];
  lastUpdated: Date;
}

export interface ModelConfig {
  id: string; // Unique ID for this config instance
  step: string;
  nodeId: string;
  model: string;
  enabled: boolean;
  priority: number; // For ordering within the same step
}

// ComfyUI node assignment for pipeline rendering steps
export interface ComfyUINodeAssignment {
  stepId: string;  // e.g., 'holocine_render', 'wan_render'
  nodeId: string;  // ComfyUI node ID from nodeDiscovery
  workflowId: string;  // Which workflow to use
  modelOverrides?: Record<string, string>;  // Override specific models
  enabled: boolean;
}

// ComfyUI-specific settings
export interface ComfyUISettings {
  nodeAssignments: ComfyUINodeAssignment[];
  defaultWorkflow: 'holocine' | 'wan22' | 'cogvideox' | 'custom';
  modelMappings: Record<string, string>;  // Friendly name -> actual file name
  autoValidateModels: boolean;
  defaultNegativePrompt: string;
  maxConcurrentRenders: number;
  autoRetryFailed: boolean;
  retryAttempts: number;
}

// Step data for individual checkpoint steps
export interface StepCheckpointData {
  completedAt?: Date;
  duration?: number;  // Time taken in ms
  output?: any;  // Step-specific output data
  assignedNode?: string;
  model?: string;
  error?: string;  // If step failed
}

// Step checkpoint for retry/resume capability
export interface StepCheckpoint {
  storyId: string;
  queueItemId: string;
  completedSteps: string[];  // Step IDs that have completed successfully
  currentStep: string | null;  // Step currently in progress (or null if none)
  stepData: {
    [stepId: string]: StepCheckpointData;
  };
  lastUpdated: Date;
  resumeCount: number;  // Number of times this checkpoint has been resumed
}

// Render job for video generation queue
export interface RenderJob {
  id: string;
  storyId: string;
  type: 'holocine_scene' | 'shot' | 'character_reference';
  targetId: string;  // Scene ID or Shot ID
  targetNumber: number;  // For ordering
  title: string;

  // Prompt data
  positivePrompt: string;
  negativePrompt: string;

  // Generation settings (pulled from story config)
  settings: {
    workflow: 'holocine' | 'wan22' | 'cogvideox';
    numFrames: number;
    fps: number;
    resolution: string;
    steps?: number;
    cfg?: number;
    seed?: number;
  };

  // Status
  status: 'queued' | 'assigned' | 'rendering' | 'completed' | 'failed';
  progress: number;
  assignedNode?: string;

  // Output
  outputUrl?: string;
  thumbnailUrl?: string;

  // Timing
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;

  // Error handling
  error?: string;
  attempts: number;
  maxAttempts: number;

  // Priority (lower = higher priority)
  priority: number;
}

export interface Settings {
  theme: 'light' | 'dark' | 'system';
  autoSave: boolean;
  notificationsEnabled: boolean;
  apiEndpoint: string;
  ollamaHost: string;
  comfyUIHost: string;
  modelConfigs?: ModelConfig[];
  processingEnabled?: boolean;
  parallelProcessing?: number;
  autoRetry?: boolean;
  retryAttempts?: number;
  // ComfyUI workflow settings
  comfyUISettings?: ComfyUISettings;
}

export interface StoreState {
  queue: QueueItem[];
  stories: Story[];
  researchData: ResearchData | null;
  settings: Settings;
  currentGeneration: {
    isGenerating: boolean;
    progress: number;
    currentStep: string;
  };

  // Step checkpoints for retry/resume
  checkpoints: Record<string, StepCheckpoint>;  // Key: storyId

  // Render queue for video generation
  renderQueue: RenderJob[];
  renderQueueEnabled: boolean;  // Auto-render toggle

  addToQueue: (item: Omit<QueueItem, 'id' | 'createdAt'>) => void;
  removeFromQueue: (id: string) => void;
  updateQueueItem: (id: string, updates: Partial<QueueItem>) => void;
  clearCompletedQueue: () => void;
  moveQueueItem: (id: string, direction: 'up' | 'down') => void;
  reQueueItem: (id: string) => void;

  addStory: (story: Story) => void;
  updateStory: (id: string, updates: Partial<Story>) => void;
  deleteStory: (id: string) => void;
  upsertStory: (story: Partial<Story> & { id: string }) => void;
  updateStoryFromGeneration: (storyId: string, stepData: any) => void;

  setResearchData: (data: ResearchData) => void;
  updateSettings: (settings: Partial<Settings>) => void;

  setGenerationStatus: (status: Partial<StoreState['currentGeneration']>) => void;

  // Checkpoint methods
  saveCheckpoint: (checkpoint: StepCheckpoint) => void;
  getCheckpoint: (storyId: string) => StepCheckpoint | null;
  updateCheckpointStep: (storyId: string, stepId: string, stepData: StepCheckpointData) => void;
  clearCheckpoint: (storyId: string) => void;
  incrementResumeCount: (storyId: string) => void;

  // Render queue methods
  addRenderJob: (job: Omit<RenderJob, 'id' | 'createdAt' | 'attempts'>) => void;
  addRenderJobs: (jobs: Omit<RenderJob, 'id' | 'createdAt' | 'attempts'>[]) => void;
  updateRenderJob: (id: string, updates: Partial<RenderJob>) => void;
  removeRenderJob: (id: string) => void;
  clearCompletedRenderJobs: () => void;
  clearAllRenderJobs: (storyId?: string) => void;
  setRenderQueueEnabled: (enabled: boolean) => void;
  getNextRenderJob: () => RenderJob | null;
}

export const useStore = create<StoreState>()(
  devtools(
    persist(
      (set, get) => ({
        queue: [],
        stories: [],
        researchData: null,
        settings: {
          theme: 'dark',
          autoSave: true,
          notificationsEnabled: true,
          apiEndpoint: 'http://localhost:8000',
          ollamaHost: 'http://localhost:11434',
          comfyUIHost: 'http://localhost:8188',
          modelConfigs: [],
          processingEnabled: true,
          parallelProcessing: 3,
          autoRetry: true,
          retryAttempts: 3,
        },
        currentGeneration: {
          isGenerating: false,
          progress: 0,
          currentStep: '',
        },

        // Step checkpoints for retry/resume
        checkpoints: {},

        // Render queue for video generation
        renderQueue: [],
        renderQueueEnabled: false,  // Off by default, user can toggle

        addToQueue: (item) => set((state) => {
          try {
            const newItem = {
              ...item,
              id: Date.now().toString(),
              createdAt: new Date(),
            };
            debugService.queueAdd(newItem.id, 'story', newItem.priority);
            return {
              queue: [...state.queue, newItem],
            };
          } catch (error) {
            debugService.storeError('addToQueue', error);
            throw error;
          }
        }),
        
        removeFromQueue: (id) => set((state) => ({
          queue: state.queue.filter(item => item.id !== id),
        })),
        
        updateQueueItem: (id, updates) => set((state) => {
          try {
            const item = state.queue.find(item => item.id === id);
            if (!item) {
              debugService.warn('store', `Queue item ${id} not found for update`, updates);
              return state;
            }
            debugService.queueProcess(id, updates.status || item.status);
            debugService.storeUpdate('updateQueueItem', { id, updates });
            return {
              queue: state.queue.map(item => 
                item.id === id ? { ...item, ...updates } : item
              ),
            };
          } catch (error) {
            debugService.storeError('updateQueueItem', error);
            throw error;
          }
        }),
        
        clearCompletedQueue: () => set((state) => ({
          queue: state.queue.filter(item => item.status !== 'completed'),
        })),

        moveQueueItem: (id, direction) => set((state) => {
          const currentIndex = state.queue.findIndex(item => item.id === id);
          if (currentIndex === -1) return state;
          
          const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
          if (newIndex < 0 || newIndex >= state.queue.length) return state;
          
          // Don't allow moving processing items
          if (state.queue[currentIndex].status === 'processing') return state;
          
          const newQueue = [...state.queue];
          const temp = newQueue[currentIndex];
          newQueue[currentIndex] = newQueue[newIndex];
          newQueue[newIndex] = temp;
          
          return { queue: newQueue };
        }),

        reQueueItem: (id) => set((state) => {
          try {
            const item = state.queue.find(item => item.id === id);
            if (!item) {
              debugService.warn('store', `Queue item ${id} not found for re-queue`);
              return state;
            }
            
            // Reset the item to queued status and clear error/progress data
            debugService.info('store', `Re-queuing item ${id} from status ${item.status}`);
            debugService.queueProcess(id, 'queued');
            debugService.storeUpdate('reQueueItem', { id, from: item.status });
            
            return {
              queue: state.queue.map(queueItem => 
                queueItem.id === id ? { 
                  ...queueItem, 
                  status: 'queued' as const,
                  progress: 0,
                  currentStep: undefined,
                  error: undefined,
                  logs: [],
                  startedAt: undefined,
                  completedAt: undefined
                } : queueItem
              ),
            };
          } catch (error) {
            debugService.storeError('reQueueItem', error);
            throw error;
          }
        }),
        
        addStory: (story) => set((state) => ({
          stories: [story, ...state.stories],
        })),
        
        updateStory: (id, updates) => set((state) => {
          try {
            const story = state.stories.find(story => story.id === id);
            if (!story) {
              debugService.warn('store', `Story ${id} not found for update`, updates);
              return state;
            }
            debugService.storeUpdate('updateStory', { id, updates });
            return {
              stories: state.stories.map(story => 
                story.id === id ? { ...story, ...updates } : story
              ),
            };
          } catch (error) {
            debugService.storeError('updateStory', error);
            throw error;
          }
        }),
        
        deleteStory: (id) => set((state) => ({
          stories: state.stories.filter(story => story.id !== id),
        })),

        upsertStory: (storyData) => set((state) => {
          const existingIndex = state.stories.findIndex(story => story.id === storyData.id);
          const updatedStory = {
            ...storyData,
            updatedAt: new Date(),
          };
          
          if (existingIndex >= 0) {
            // Update existing story
            const newStories = [...state.stories];
            newStories[existingIndex] = { ...newStories[existingIndex], ...updatedStory };
            return { stories: newStories };
          } else {
            // Add new story
            const newStory = {
              title: 'Generated Story',
              content: '',
              genre: 'Auto',
              shots: [],
              status: 'generating' as const,
              createdAt: new Date(),
              ...updatedStory,
            };
            return { stories: [newStory, ...state.stories] };
          }
        }),

        updateStoryFromGeneration: (storyId, stepData) => set((state) => {
          const story = state.stories.find(s => s.id === storyId);
          const updates: Partial<Story> = {
            updatedAt: new Date(),
            generationData: { ...story?.generationData, ...stepData },
          };

          // Update specific fields based on step data
          if (stepData.content) {
            updates.content = stepData.content;
            updates.title = stepData.title || stepData.content.split('\n')[0]?.slice(0, 50) || 'Generated Story';
          }
          if (stepData.characters) updates.characters = stepData.characters;
          if (stepData.shots) updates.shots = stepData.shots.map((shot: any, index: number) => ({
            id: `shot_${index}`,
            shotNumber: index + 1,
            description: shot.description || shot.title || '',
            duration: shot.duration || 5,
            ...shot
          }));
          if (stepData.prompts) updates.prompts = stepData.prompts;
          if (stepData.narrations) updates.narrations = stepData.narrations;
          if (stepData.musicCues) updates.musicCues = stepData.musicCues;

          // Create or update the story
          const existingIndex = state.stories.findIndex(s => s.id === storyId);
          if (existingIndex >= 0) {
            const newStories = [...state.stories];
            newStories[existingIndex] = { ...newStories[existingIndex], ...updates };
            return { stories: newStories };
          } else {
            const newStory: Story = {
              id: storyId,
              title: updates.title || 'Generated Story',
              content: updates.content || '',
              genre: 'Auto',
              shots: updates.shots || [],
              characters: updates.characters,
              prompts: updates.prompts,
              narrations: updates.narrations,
              musicCues: updates.musicCues,
              status: 'generating',
              createdAt: new Date(),
              updatedAt: new Date(),
              generationData: stepData,
            };
            return { stories: [newStory, ...state.stories] };
          }
        }),
        
        setResearchData: (data) => set({ researchData: data }),
        
        updateSettings: (settings) => set((state) => ({
          settings: { ...state.settings, ...settings },
        })),
        
        setGenerationStatus: (status) => set((state) => ({
          currentGeneration: { ...state.currentGeneration, ...status },
        })),

        // ============== CHECKPOINT METHODS ==============

        saveCheckpoint: (checkpoint) => set((state) => {
          debugService.info('store', `💾 Saving checkpoint for story ${checkpoint.storyId}`, {
            completedSteps: checkpoint.completedSteps.length,
            currentStep: checkpoint.currentStep
          });
          return {
            checkpoints: {
              ...state.checkpoints,
              [checkpoint.storyId]: checkpoint
            }
          };
        }),

        getCheckpoint: (storyId) => {
          return get().checkpoints[storyId] || null;
        },

        updateCheckpointStep: (storyId, stepId, stepData) => set((state) => {
          const existing = state.checkpoints[storyId];
          if (!existing) {
            debugService.warn('store', `No checkpoint found for story ${storyId}`);
            return state;
          }

          const updatedStepData = {
            ...existing.stepData,
            [stepId]: stepData
          };

          // If step completed successfully (no error), add to completedSteps
          const completedSteps = stepData.error
            ? existing.completedSteps
            : existing.completedSteps.includes(stepId)
              ? existing.completedSteps
              : [...existing.completedSteps, stepId];

          debugService.info('store', `📝 Updated checkpoint step ${stepId} for story ${storyId}`, {
            hasError: !!stepData.error,
            completedSteps: completedSteps.length
          });

          return {
            checkpoints: {
              ...state.checkpoints,
              [storyId]: {
                ...existing,
                completedSteps,
                currentStep: stepData.error ? stepId : null,  // Keep failed step as current
                stepData: updatedStepData,
                lastUpdated: new Date()
              }
            }
          };
        }),

        clearCheckpoint: (storyId) => set((state) => {
          const { [storyId]: _removed, ...rest } = state.checkpoints;
          debugService.info('store', `🗑️ Cleared checkpoint for story ${storyId}`);
          return { checkpoints: rest };
        }),

        incrementResumeCount: (storyId) => set((state) => {
          const existing = state.checkpoints[storyId];
          if (!existing) return state;

          debugService.info('store', `🔄 Resume count for ${storyId}: ${existing.resumeCount + 1}`);
          return {
            checkpoints: {
              ...state.checkpoints,
              [storyId]: {
                ...existing,
                resumeCount: existing.resumeCount + 1,
                lastUpdated: new Date()
              }
            }
          };
        }),

        // ============== RENDER QUEUE METHODS ==============

        addRenderJob: (job) => set((state) => {
          const newJob: RenderJob = {
            ...job,
            id: `render_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            createdAt: new Date(),
            attempts: 0
          };
          debugService.info('store', `🎬 Added render job: ${newJob.title}`, { type: job.type, storyId: job.storyId });
          return {
            renderQueue: [...state.renderQueue, newJob]
          };
        }),

        addRenderJobs: (jobs) => set((state) => {
          const newJobs: RenderJob[] = jobs.map((job, idx) => ({
            ...job,
            id: `render_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 9)}`,
            createdAt: new Date(),
            attempts: 0
          }));
          debugService.info('store', `🎬 Added ${newJobs.length} render jobs`);
          return {
            renderQueue: [...state.renderQueue, ...newJobs]
          };
        }),

        updateRenderJob: (id, updates) => set((state) => {
          const job = state.renderQueue.find(j => j.id === id);
          if (!job) {
            debugService.warn('store', `Render job ${id} not found`);
            return state;
          }
          debugService.info('store', `📝 Updated render job ${id}`, { status: updates.status, progress: updates.progress });
          return {
            renderQueue: state.renderQueue.map(j =>
              j.id === id ? { ...j, ...updates } : j
            )
          };
        }),

        removeRenderJob: (id) => set((state) => ({
          renderQueue: state.renderQueue.filter(j => j.id !== id)
        })),

        clearCompletedRenderJobs: () => set((state) => ({
          renderQueue: state.renderQueue.filter(j => j.status !== 'completed')
        })),

        clearAllRenderJobs: (storyId) => set((state) => ({
          renderQueue: storyId
            ? state.renderQueue.filter(j => j.storyId !== storyId)
            : []
        })),

        setRenderQueueEnabled: (enabled) => set(() => {
          debugService.info('store', `🎬 Render queue ${enabled ? 'enabled' : 'disabled'}`);
          return { renderQueueEnabled: enabled };
        }),

        getNextRenderJob: () => {
          // Get queued jobs sorted by priority (lower = higher priority), then by creation time
          const queuedJobs = get().renderQueue
            .filter(j => j.status === 'queued')
            .sort((a, b) => {
              if (a.priority !== b.priority) return a.priority - b.priority;
              return a.createdAt.getTime() - b.createdAt.getTime();
            });
          return queuedJobs[0] || null;
        },
      }),
      {
        name: 'story-generator-storage',
        partialize: (state) => ({
          queue: state.queue,
          stories: state.stories,
          settings: state.settings,
          checkpoints: state.checkpoints,  // Persist checkpoints for resume
          renderQueue: state.renderQueue,  // Persist render queue
          renderQueueEnabled: state.renderQueueEnabled,
        }),
      }
    )
  )
);