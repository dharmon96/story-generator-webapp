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
}

export const useStore = create<StoreState>()(
  devtools(
    persist(
      (set) => ({
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
      }),
      {
        name: 'story-generator-storage',
        partialize: (state) => ({
          queue: state.queue,
          stories: state.stories,
          settings: state.settings,
        }),
      }
    )
  )
);