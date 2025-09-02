/**
 * Story Data Manager - Central source of truth for story generation data
 * Manages the flow of data between generation pipeline, store, and UI components
 */

import React from 'react';
import { useStore } from '../store/useStore';
import { EnhancedStory, EnhancedShot } from '../types/storyTypes';

interface StoryDataCache {
  [storyId: string]: {
    story: EnhancedStory;
    lastUpdated: Date;
    generationProgress: {
      currentStep: string;
      overallProgress: number;
      logs: any[];
    };
  };
}

class StoryDataManager {
  private cache: StoryDataCache = {};
  private subscribers: Map<string, Set<(data: EnhancedStory) => void>> = new Map();

  /**
   * Initialize or update story data
   */
  public initializeStory(storyId: string, initialData: Partial<EnhancedStory>): void {
    console.log(`📊 Initializing story ${storyId}`);
    
    if (!this.cache[storyId]) {
      this.cache[storyId] = {
        story: {
          id: storyId,
          title: 'Generating...',
          content: '',
          genre: initialData.genre || 'auto',
          shots: [],
          characters: [],
          locations: [],
          musicCues: [],
          status: 'processing',
          aiLogs: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          ...initialData
        },
        lastUpdated: new Date(),
        generationProgress: {
          currentStep: 'initializing',
          overallProgress: 0,
          logs: []
        }
      };
    }

    this.notifySubscribers(storyId);
    this.syncToStore(storyId);
  }

  /**
   * Update story with partial data from any generation step
   */
  public updateStory(storyId: string, updates: Partial<EnhancedStory>, step?: string): void {
    console.log(`📊 Updating story ${storyId} - Step: ${step || 'unknown'}`);
    
    if (!this.cache[storyId]) {
      this.initializeStory(storyId, updates);
      return;
    }

    const cached = this.cache[storyId];
    
    // Deep merge updates to preserve existing data
    cached.story = this.deepMergeStory(cached.story, updates);
    cached.lastUpdated = new Date();
    
    if (step) {
      cached.generationProgress.currentStep = step;
    }

    // Log what was updated
    console.log(`📊 Updated fields:`, Object.keys(updates));
    if (updates.shots) {
      console.log(`📊 Shots updated: ${updates.shots.length} shots`);
      const shotsWithPrompts = updates.shots.filter(s => s.comfyUIPositivePrompt);
      console.log(`📊 Shots with ComfyUI prompts: ${shotsWithPrompts.length}`);
    }

    this.notifySubscribers(storyId);
    this.syncToStore(storyId);
  }

  /**
   * Update specific shot data
   */
  public updateShot(storyId: string, shotId: string, shotUpdates: Partial<EnhancedShot>): void {
    console.log(`📊 Updating shot ${shotId} in story ${storyId}`);
    
    if (!this.cache[storyId]) {
      console.error(`Story ${storyId} not found in cache`);
      return;
    }

    const cached = this.cache[storyId];
    const shotIndex = cached.story.shots.findIndex(s => s.id === shotId);
    
    if (shotIndex === -1) {
      console.error(`Shot ${shotId} not found in story ${storyId}`);
      return;
    }

    // Update the specific shot
    cached.story.shots[shotIndex] = {
      ...cached.story.shots[shotIndex],
      ...shotUpdates
    };
    
    cached.lastUpdated = new Date();

    // Log prompt updates
    if (shotUpdates.comfyUIPositivePrompt || shotUpdates.comfyUINegativePrompt) {
      console.log(`📊 Updated ComfyUI prompts for shot ${shotIndex + 1}:`, {
        positive: shotUpdates.comfyUIPositivePrompt?.slice(0, 50) + '...',
        negative: shotUpdates.comfyUINegativePrompt?.slice(0, 50) + '...'
      });
    }

    this.notifySubscribers(storyId);
    this.syncToStore(storyId);
  }

  /**
   * Update generation progress
   */
  public updateProgress(storyId: string, step: string, progress: number, logs?: any[]): void {
    if (!this.cache[storyId]) {
      this.initializeStory(storyId, {});
    }

    const cached = this.cache[storyId];
    cached.generationProgress.currentStep = step;
    cached.generationProgress.overallProgress = progress;
    
    if (logs) {
      cached.generationProgress.logs.push(...logs);
    }

    // Update story status based on progress
    if (progress >= 100) {
      cached.story.status = 'completed';
    } else if (progress > 0) {
      cached.story.status = 'processing';
    }

    this.notifySubscribers(storyId);
    this.syncToStore(storyId);
  }

  /**
   * Get story data from cache or store
   */
  public getStory(storyId: string): EnhancedStory | null {
    // First check cache
    if (this.cache[storyId]) {
      return this.cache[storyId].story;
    }

    // Fall back to store
    const store = useStore.getState();
    const storyFromStore = store.stories.find(s => s.id === storyId);
    
    if (storyFromStore) {
      // Convert store story to enhanced story and cache it
      const enhancedStory: EnhancedStory = this.convertToEnhancedStory(storyFromStore);
      this.cache[storyId] = {
        story: enhancedStory,
        lastUpdated: new Date(),
        generationProgress: {
          currentStep: 'loaded',
          overallProgress: 100,
          logs: []
        }
      };
      return enhancedStory;
    }

    return null;
  }

  /**
   * Subscribe to story updates
   */
  public subscribe(storyId: string, callback: (data: EnhancedStory) => void): () => void {
    if (!this.subscribers.has(storyId)) {
      this.subscribers.set(storyId, new Set());
    }
    
    this.subscribers.get(storyId)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      const subs = this.subscribers.get(storyId);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscribers.delete(storyId);
        }
      }
    };
  }

  /**
   * Sync cached data to the store
   */
  private syncToStore(storyId: string): void {
    const cached = this.cache[storyId];
    if (!cached) return;

    const store = useStore.getState();
    const storyData = cached.story;

    // Convert to store-compatible format
    const storeStory = {
      id: storyData.id,
      title: storyData.title,
      content: storyData.content,
      genre: storyData.genre,
      shots: storyData.shots.map(shot => ({
        id: shot.id,
        storyId: storyData.id,
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
        renderStatus: shot.renderStatus as 'pending' | 'rendering' | 'completed',
        characters: shot.characters,
        locations: shot.locations
      })),
      characters: storyData.characters.map(char => ({
        name: char.name,
        role: char.role === 'protagonist' ? 'main' : 'supporting',
        physical_description: char.physicalDescription,
        age_range: char.age,
        importance_level: char.importanceLevel
      })),
      status: storyData.status === 'completed' ? 'completed' as const : 
             storyData.status === 'failed' ? 'draft' as const : 'generating' as const,
      createdAt: storyData.createdAt,
      updatedAt: storyData.updatedAt
    };

    // Use upsert to create or update
    store.upsertStory(storeStory);
    
    console.log(`📊 Synced story ${storyId} to store`);
  }

  /**
   * Notify all subscribers of story updates
   */
  private notifySubscribers(storyId: string): void {
    const cached = this.cache[storyId];
    if (!cached) return;

    const subscribers = this.subscribers.get(storyId);
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(cached.story);
        } catch (error) {
          console.error('Error in story subscriber callback:', error);
        }
      });
    }
  }

  /**
   * Deep merge story data to preserve existing fields
   */
  private deepMergeStory(existing: EnhancedStory, updates: Partial<EnhancedStory>): EnhancedStory {
    const merged = { ...existing };

    // Simple fields
    if (updates.title !== undefined) merged.title = updates.title;
    if (updates.content !== undefined) merged.content = updates.content;
    if (updates.genre !== undefined) merged.genre = updates.genre;
    if (updates.status !== undefined) merged.status = updates.status;

    // Merge shots array - update existing or add new
    if (updates.shots) {
      const shotMap = new Map(merged.shots.map(s => [s.id, s]));
      updates.shots.forEach(shot => {
        if (shotMap.has(shot.id)) {
          // Update existing shot
          shotMap.set(shot.id, { ...shotMap.get(shot.id)!, ...shot });
        } else {
          // Add new shot
          shotMap.set(shot.id, shot);
        }
      });
      merged.shots = Array.from(shotMap.values()).sort((a, b) => a.shotNumber - b.shotNumber);
    }

    // Merge characters array
    if (updates.characters) {
      const charMap = new Map(merged.characters.map(c => [c.id, c]));
      updates.characters.forEach(char => {
        if (charMap.has(char.id)) {
          charMap.set(char.id, { ...charMap.get(char.id)!, ...char });
        } else {
          charMap.set(char.id, char);
        }
      });
      merged.characters = Array.from(charMap.values());
    }

    // Merge other arrays
    if (updates.locations) merged.locations = updates.locations;
    if (updates.musicCues) merged.musicCues = updates.musicCues;
    if (updates.aiLogs) merged.aiLogs = [...merged.aiLogs, ...updates.aiLogs];

    merged.updatedAt = new Date();
    
    return merged;
  }

  /**
   * Convert store story to enhanced story format
   */
  private convertToEnhancedStory(storeStory: any): EnhancedStory {
    return {
      id: storeStory.id,
      title: storeStory.title,
      content: storeStory.content,
      genre: storeStory.genre,
      shots: (storeStory.shots || []).map((shot: any) => ({
        ...shot,
        shotType: shot.shotType || 'medium',
        angle: shot.angle || 'eye-level',
        renderStatus: shot.renderStatus || 'pending',
        characters: shot.characters || [],
        locations: shot.locations || [],
        actions: shot.actions || [],
        dialogue: shot.dialogue || [],
        createdAt: shot.createdAt || new Date()
      })),
      characters: (storeStory.characters || []).map((char: any, index: number) => ({
        id: `char_${index}`,
        name: char.name,
        role: char.role === 'main' ? 'protagonist' : char.role,
        physicalDescription: char.physical_description || char.physicalDescription || '',
        age: char.age_range || char.age || 'adult',
        gender: char.gender || 'unspecified',
        clothing: char.clothing || '',
        distinctiveFeatures: char.distinctiveFeatures || [],
        personality: char.personality || '',
        motivations: char.motivations || [],
        visualPrompt: char.visualPrompt || '',
        appearanceInShots: char.appearanceInShots || [],
        importanceLevel: (char.importance_level || char.importanceLevel || 3) as 1 | 2 | 3 | 4 | 5,
        screenTime: char.screenTime || 0,
        createdAt: char.createdAt || new Date()
      })),
      locations: storeStory.locations || [],
      musicCues: storeStory.musicCues || [],
      status: storeStory.status === 'completed' ? 'completed' : 
              storeStory.status === 'draft' ? 'failed' : 'processing',
      aiLogs: storeStory.aiLogs || [],
      createdAt: storeStory.createdAt || new Date(),
      updatedAt: storeStory.updatedAt || new Date()
    };
  }

  /**
   * Clear cache for a specific story
   */
  public clearCache(storyId?: string): void {
    if (storyId) {
      delete this.cache[storyId];
      this.subscribers.delete(storyId);
    } else {
      this.cache = {};
      this.subscribers.clear();
    }
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { totalStories: number; totalSubscribers: number } {
    return {
      totalStories: Object.keys(this.cache).length,
      totalSubscribers: Array.from(this.subscribers.values()).reduce((sum, set) => sum + set.size, 0)
    };
  }
}

// Export singleton instance
export const storyDataManager = new StoryDataManager();

// Export for use in components

export const useStoryData = (storyId: string) => {
  const [story, setStory] = React.useState<EnhancedStory | null>(null);

  React.useEffect(() => {
    // Get initial data
    const initialData = storyDataManager.getStory(storyId);
    if (initialData) {
      setStory(initialData);
    }

    // Subscribe to updates
    const unsubscribe = storyDataManager.subscribe(storyId, (updatedStory) => {
      setStory(updatedStory);
    });

    return unsubscribe;
  }, [storyId]);

  return story;
};