// Hybrid Store: Uses backend API with localStorage fallback
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { apiClient } from '../services/apiClient';
import { QueueItem, Story, StoreState, Settings } from './useStore';

interface HybridStoreState extends Omit<StoreState, 'addToQueue' | 'updateQueueItem' | 'removeFromQueue' | 'addStory' | 'updateStory'> {
  // API connectivity state
  isOnline: boolean;
  lastSync: Date | null;
  pendingSync: { stories: Story[]; queue: QueueItem[] };
  
  // Enhanced methods with backend sync
  addToQueue: (item: Omit<QueueItem, 'id' | 'createdAt' | 'status' | 'progress'>) => Promise<void>;
  updateQueueItem: (id: string, updates: Partial<QueueItem>) => Promise<void>;
  removeFromQueue: (id: string) => Promise<void>;
  clearQueue: (status?: 'completed') => Promise<void>;
  
  addStory: (story: Omit<Story, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateStory: (id: string, updates: Partial<Story>) => Promise<void>;
  
  // Sync operations
  syncToBackend: () => Promise<void>;
  loadFromBackend: () => Promise<void>;
  checkConnection: () => Promise<boolean>;
  
  // Migration helper
  migrateFromLocalStorage: () => Promise<void>;
}

export const useHybridStore = create<HybridStoreState>()(
  devtools(
    (set, get) => ({
      // Initial state (same as original store)
      queue: [],
      stories: [],
      researchData: null,
      settings: {
        theme: 'dark',
        autoSave: true,
        notificationsEnabled: true,
        apiEndpoint: 'http://localhost:8001',
        ollamaHost: 'http://localhost:11434',
        processingEnabled: true,
        maxConcurrentGenerations: 3,
        autoRetry: true,
        retryAttempts: 3,
        modelConfigs: []
      },
      currentGeneration: {
        isGenerating: false,
        currentStep: '',
        progress: 0,
        error: null
      },
      
      // API connectivity state
      isOnline: false,
      lastSync: null,
      pendingSync: { stories: [], queue: [] },

      // Enhanced queue operations with backend sync
      addToQueue: async (item) => {
        const tempId = `temp_${Date.now()}`;
        const localItem: QueueItem = {
          id: tempId,
          ...item,
          status: 'queued',
          progress: 0,
          createdAt: new Date()
        };

        try {
          // Add to local state immediately for responsive UI
          set(state => ({
            queue: [...state.queue, localItem].sort((a, b) => b.priority - a.priority)
          }));

          // Try to sync with backend
          if (get().isOnline) {
            const backendItem = await apiClient.addToQueue(item);
            
            // Replace temp item with backend item
            set(state => ({
              queue: state.queue.map((q: QueueItem) => q.id === tempId ? backendItem : q)
            }));
            
            console.log('✅ Queue item synced to backend');
          } else {
            // Store for later sync
            set(state => ({
              pendingSync: {
                ...state.pendingSync,
                queue: [...state.pendingSync.queue, localItem]
              }
            }));
            console.log('📦 Queue item stored for sync when online');
          }
        } catch (error) {
          console.error('❌ Failed to add to queue:', error);
          // Keep local item but mark as pending sync
          set(state => ({
            pendingSync: {
              ...state.pendingSync,
              queue: [...state.pendingSync.queue, localItem]
            }
          }));
        }
      },

      updateQueueItem: async (id, updates) => {
        try {
          // Update local state immediately
          set(state => ({
            queue: state.queue.map((item: QueueItem) =>
              item.id === id ? { ...item, ...updates } : item
            )
          }));

          // Try to sync with backend
          if (get().isOnline) {
            await apiClient.updateQueueItem(id, updates);
            console.log('✅ Queue item update synced to backend');
          }
        } catch (error) {
          console.error('❌ Failed to update queue item:', error);
          // Local state is already updated, will sync when online
        }
      },

      removeFromQueue: async (id) => {
        try {
          // Remove from local state immediately
          set(state => ({
            queue: state.queue.filter((item: QueueItem) => item.id !== id)
          }));

          // Try to sync with backend
          if (get().isOnline) {
            await apiClient.removeFromQueue(id);
            console.log('✅ Queue item removal synced to backend');
          }
        } catch (error) {
          console.error('❌ Failed to remove queue item:', error);
          // Local state is already updated
        }
      },

      clearQueue: async (status) => {
        try {
          // Update local state immediately
          if (status === 'completed') {
            set(state => ({
              queue: state.queue.filter((item: QueueItem) => item.status !== 'completed')
            }));
          } else {
            set(state => ({ queue: [] }));
          }

          // Try to sync with backend
          if (get().isOnline) {
            await apiClient.clearQueue(status);
            console.log('✅ Queue clear synced to backend');
          }
        } catch (error) {
          console.error('❌ Failed to clear queue:', error);
        }
      },

      // Enhanced story operations
      addStory: async (story) => {
        const tempId = `temp_${Date.now()}`;
        const localStory: Story = {
          id: tempId,
          ...story,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        try {
          // Add to local state immediately
          set(state => ({
            stories: [localStory, ...state.stories]
          }));

          // Try to sync with backend
          if (get().isOnline) {
            const backendStory = await apiClient.createStory(story);
            
            // Replace temp story with backend story
            set(state => ({
              stories: state.stories.map((s: Story) => s.id === tempId ? backendStory : s)
            }));
            
            console.log('✅ Story synced to backend');
          } else {
            // Store for later sync
            set(state => ({
              pendingSync: {
                ...state.pendingSync,
                stories: [...state.pendingSync.stories, localStory]
              }
            }));
            console.log('📦 Story stored for sync when online');
          }
        } catch (error) {
          console.error('❌ Failed to add story:', error);
          // Keep local story but mark as pending sync
          set(state => ({
            pendingSync: {
              ...state.pendingSync,
              stories: [...state.pendingSync.stories, localStory]
            }
          }));
        }
      },

      updateStory: async (id, updates) => {
        try {
          // Update local state immediately
          set(state => ({
            stories: state.stories.map((story: Story) =>
              story.id === id ? { ...story, ...updates, updatedAt: new Date() } : story
            )
          }));

          // Try to sync with backend
          if (get().isOnline) {
            await apiClient.updateStory(id, updates);
            console.log('✅ Story update synced to backend');
          }
        } catch (error) {
          console.error('❌ Failed to update story:', error);
        }
      },

      // Connection management
      checkConnection: async () => {
        try {
          await apiClient.health();
          set({ isOnline: true });
          console.log('✅ Backend connection established');
          
          // Auto-sync pending items when connection is restored
          if (get().pendingSync.stories.length > 0 || get().pendingSync.queue.length > 0) {
            console.log('🔄 Auto-syncing pending items...');
            get().syncToBackend();
          }
          
          return true;
        } catch (error) {
          set({ isOnline: false });
          console.log('❌ Backend offline, using localStorage');
          return false;
        }
      },

      // Sync operations
      syncToBackend: async () => {
        const { pendingSync } = get();
        
        if (pendingSync.stories.length === 0 && pendingSync.queue.length === 0) {
          console.log('📊 No pending items to sync');
          return;
        }

        try {
          console.log(`🔄 Syncing ${pendingSync.stories.length} stories and ${pendingSync.queue.length} queue items...`);
          
          const result = await apiClient.syncFromLocalStorage(pendingSync);
          
          // Clear successfully synced items
          set({
            pendingSync: { stories: [], queue: [] },
            lastSync: new Date()
          });
          
          console.log(`✅ Sync completed: ${result.storiesSync} stories, ${result.queueSync} queue items`);
          if (result.errors.length > 0) {
            console.warn('⚠️ Sync errors:', result.errors);
          }
        } catch (error) {
          console.error('❌ Sync failed:', error);
        }
      },

      loadFromBackend: async () => {
        if (!get().isOnline) {
          console.log('📦 Backend offline, using local data');
          return;
        }

        try {
          console.log('📥 Loading data from backend...');
          const [stories, queue] = await Promise.all([
            apiClient.getStories(),
            apiClient.getQueue()
          ]);

          set({
            stories: stories || [],
            queue: queue || [],
            lastSync: new Date()
          });

          console.log(`✅ Loaded from backend: ${stories?.length || 0} stories, ${queue?.length || 0} queue items`);
        } catch (error) {
          console.error('❌ Failed to load from backend:', error);
        }
      },

      migrateFromLocalStorage: async () => {
        // This method helps migrate existing localStorage data to backend
        try {
          const localData = localStorage.getItem('story-generator-store');
          if (!localData) {
            console.log('📦 No localStorage data to migrate');
            return;
          }

          const parsedData = JSON.parse(localData);
          const stories = parsedData.state?.stories || [];
          const queue = parsedData.state?.queue || [];

          if (stories.length === 0 && queue.length === 0) {
            console.log('📦 No data to migrate');
            return;
          }

          console.log(`🔄 Migrating ${stories.length} stories and ${queue.length} queue items from localStorage...`);
          
          const result = await apiClient.syncFromLocalStorage({ stories, queue });
          
          console.log(`✅ Migration completed: ${result.storiesSync} stories, ${result.queueSync} queue items`);
          
          // Load fresh data from backend
          await get().loadFromBackend();
          
        } catch (error) {
          console.error('❌ Migration failed:', error);
        }
      },

      // Keep existing methods from original store
      clearCompletedQueue: () => {
        get().clearQueue('completed');
      },
      
      moveQueueItem: (id: string, direction: 'up' | 'down') => {
        // Implement queue reordering logic
        set(state => {
          const queue = [...state.queue];
          const index = queue.findIndex(item => item.id === id);
          if (index === -1) return state;

          if (direction === 'up' && index > 0) {
            [queue[index], queue[index - 1]] = [queue[index - 1], queue[index]];
          } else if (direction === 'down' && index < queue.length - 1) {
            [queue[index], queue[index + 1]] = [queue[index + 1], queue[index]];
          }

          return { queue };
        });
      },

      setSettings: (updates: Partial<Settings>) => {
        set(state => ({
          settings: { ...state.settings, ...updates }
        }));
      },

      setGenerationStatus: (updates: Partial<{ isGenerating: boolean; currentStep: string; progress: number; error: string | null }>) => {
        set(state => ({
          currentGeneration: { ...state.currentGeneration, ...updates }
        }));
      }
    }),
    { name: 'hybrid-story-store' }
  )
);

// Initialize connection check on store creation
setTimeout(() => {
  useHybridStore.getState().checkConnection();
}, 100);