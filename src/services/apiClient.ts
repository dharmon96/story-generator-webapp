// API Client for Story Generator Backend
import { QueueItem, Story } from '../store/useStore';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8001';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  // Generic request handler
  private async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      console.log(`🌐 API Request: ${options.method || 'GET'} ${endpoint}`);
      const response = await fetch(url, config);
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`✅ API Response: ${endpoint}`, data);
      return data;
    } catch (error) {
      console.error(`❌ API Error: ${endpoint}`, error);
      throw error;
    }
  }

  // Health check
  async health(): Promise<{ status: string; timestamp: string; message: string }> {
    return this.request('/api/health');
  }

  // Stories API
  async getStories(): Promise<Story[]> {
    return this.request('/api/stories');
  }

  async createStory(story: Omit<Story, 'id' | 'createdAt' | 'updatedAt'>): Promise<Story> {
    return this.request('/api/stories', {
      method: 'POST',
      body: JSON.stringify(story),
    });
  }

  async getStory(id: string): Promise<Story> {
    return this.request(`/api/stories/${id}`);
  }

  async updateStory(id: string, updates: Partial<Story>): Promise<Story> {
    return this.request(`/api/stories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteStory(id: string): Promise<{ message: string }> {
    return this.request(`/api/stories/${id}`, {
      method: 'DELETE',
    });
  }

  // Queue API
  async getQueue(): Promise<QueueItem[]> {
    return this.request('/api/queue');
  }

  async addToQueue(item: Omit<QueueItem, 'id' | 'createdAt' | 'status' | 'progress'>): Promise<QueueItem> {
    return this.request('/api/queue', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  }

  async updateQueueItem(id: string, updates: Partial<QueueItem>): Promise<QueueItem> {
    return this.request(`/api/queue/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async removeFromQueue(id: string): Promise<{ message: string }> {
    return this.request(`/api/queue/${id}`, {
      method: 'DELETE',
    });
  }

  async clearQueue(status?: 'completed' | 'all'): Promise<{ message: string; removed: number }> {
    const query = status ? `?status=${status}` : '';
    return this.request(`/api/queue${query}`, {
      method: 'DELETE',
    });
  }

  // Generation logs API
  async saveGenerationLog(log: {
    storyId: string;
    step: string;
    result: any;
    metadata?: any;
  }): Promise<any> {
    return this.request('/api/generations', {
      method: 'POST',
      body: JSON.stringify(log),
    });
  }

  async getGenerationLogs(storyId: string): Promise<any[]> {
    return this.request(`/api/generations/${storyId}`);
  }

  // Sync operations for migration from localStorage
  async syncFromLocalStorage(data: {
    stories: Story[];
    queue: QueueItem[];
  }): Promise<{ 
    storiesSync: number; 
    queueSync: number; 
    errors: string[];
  }> {
    console.log('🔄 Starting localStorage sync to backend...');
    const errors: string[] = [];
    let storiesSync = 0;
    let queueSync = 0;

    // Sync stories
    for (const story of data.stories) {
      try {
        await this.createStory(story);
        storiesSync++;
      } catch (error) {
        console.error('Failed to sync story:', story.title, error);
        errors.push(`Story: ${story.title} - ${error}`);
      }
    }

    // Sync queue items
    for (const item of data.queue) {
      try {
        await this.addToQueue(item);
        queueSync++;
      } catch (error) {
        console.error('Failed to sync queue item:', item.id, error);
        errors.push(`Queue item: ${item.id} - ${error}`);
      }
    }

    console.log(`✅ Sync complete: ${storiesSync} stories, ${queueSync} queue items`);
    if (errors.length > 0) {
      console.warn(`⚠️ Sync errors: ${errors.length}`);
    }

    return { storiesSync, queueSync, errors };
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export class for testing
export default ApiClient;