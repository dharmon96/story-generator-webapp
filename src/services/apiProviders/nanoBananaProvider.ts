/**
 * Nano Banana Provider
 *
 * Implements support for Nano Banana API for video generation.
 * This is a placeholder implementation - actual API structure may vary.
 */

import { IApiProvider } from './types';
import {
  NanoBananaConfig,
  VideoGenerationRequest,
  VideoGenerationResponse,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ProviderStatus,
  NanoBananaGenerationRequest
} from '../../types/apiProviders';
import { debugService } from '../debugService';

class NanoBananaProvider implements IApiProvider {
  id: 'nanobanana' = 'nanobanana';
  name = 'Nano Banana';

  private config: NanoBananaConfig | null = null;
  private baseUrl = 'https://api.nanobanana.ai/v1';  // Placeholder URL

  async initialize(config: NanoBananaConfig): Promise<void> {
    this.config = config;
    if (config.apiEndpoint) {
      this.baseUrl = config.apiEndpoint;
    }
    debugService.info('nanobanana', 'Nano Banana provider initialized', {
      hasApiKey: !!config.apiKey
    });
  }

  async checkStatus(): Promise<ProviderStatus> {
    const status: ProviderStatus = {
      id: 'nanobanana',
      name: 'Nano Banana',
      available: false,
      configured: false,
      hasValidKey: false,
      capabilities: {
        chat: false,
        vision: false,
        video: false
      }
    };

    if (!this.config?.apiKey) {
      status.error = 'API key not configured';
      return status;
    }

    status.configured = true;

    try {
      // Test API key with a status/health check endpoint
      const response = await fetch(`${this.baseUrl}/status`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        }
      });

      if (response.ok) {
        status.hasValidKey = true;
        status.available = true;
        status.capabilities.video = true;
        // Check for additional capabilities from response
        const data = await response.json().catch(() => ({}));
        if (data.capabilities) {
          status.capabilities.chat = data.capabilities.chat ?? false;
          status.capabilities.vision = data.capabilities.vision ?? false;
        }
      } else if (response.status === 401 || response.status === 403) {
        status.error = 'Invalid API key';
      } else {
        status.error = `API error: ${response.status}`;
      }
    } catch (error: any) {
      status.error = error.message;
    }

    status.lastChecked = new Date();
    return status;
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    // Nano Banana may not support chat - return not implemented
    return {
      success: false,
      error: 'Chat completion not supported by Nano Banana provider'
    };
  }

  async generateVideo(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    if (!this.config?.apiKey) {
      return { success: false, error: 'API key not configured' };
    }

    // Cast to Nano Banana specific request
    const nbRequest = request as NanoBananaGenerationRequest;

    debugService.info('nanobanana', 'Generating video with Nano Banana', {
      promptLength: request.prompt.length,
      duration: request.duration,
      style: nbRequest.style
    });

    try {
      const body: Record<string, any> = {
        prompt: request.prompt,
        negative_prompt: request.negativePrompt,
        duration: request.duration || this.config.defaultSettings?.defaultDuration || 5,
        resolution: request.resolution || this.config.defaultSettings?.defaultResolution || '1280x720',
        seed: request.seed
      };

      // Nano Banana specific options
      if (nbRequest.style) {
        body.style = nbRequest.style;
      }
      if (nbRequest.quality) {
        body.quality = nbRequest.quality;
      }
      if (nbRequest.fps) {
        body.fps = nbRequest.fps;
      }

      // Image-to-video support
      if (nbRequest.sourceImage) {
        body.source_image = nbRequest.sourceImage;
      }

      const response = await fetch(`${this.baseUrl}/generate/video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return {
          success: false,
          error: error.message || error.error || `API error: ${response.status}`
        };
      }

      const data = await response.json();

      // Handle async job response
      if (data.job_id || data.id) {
        return {
          success: true,
          jobId: data.job_id || data.id,
          status: 'processing',
          progress: 0,
          estimatedTime: data.estimated_time
        };
      }

      // Handle immediate response (if supported)
      return {
        success: true,
        videoUrl: data.video_url || data.url,
        thumbnailUrl: data.thumbnail_url,
        duration: data.duration,
        resolution: data.resolution
      };
    } catch (error: any) {
      debugService.error('nanobanana', 'Video generation failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  async checkVideoJob(jobId: string): Promise<VideoGenerationResponse> {
    if (!this.config?.apiKey) {
      return { success: false, error: 'API key not configured' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/jobs/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        }
      });

      if (!response.ok) {
        return { success: false, error: `API error: ${response.status}` };
      }

      const data = await response.json();

      // Map status to our standard format
      const statusMap: Record<string, VideoGenerationResponse['status']> = {
        'pending': 'queued',
        'queued': 'queued',
        'processing': 'processing',
        'running': 'processing',
        'completed': 'completed',
        'done': 'completed',
        'failed': 'failed',
        'error': 'failed'
      };

      const status = statusMap[data.status?.toLowerCase()] || 'processing';

      if (status === 'completed') {
        return {
          success: true,
          jobId,
          status: 'completed',
          progress: 100,
          videoUrl: data.video_url || data.output_url || data.result?.url,
          thumbnailUrl: data.thumbnail_url || data.result?.thumbnail
        };
      }

      if (status === 'failed') {
        return {
          success: false,
          jobId,
          status: 'failed',
          error: data.error || data.message || 'Generation failed'
        };
      }

      // Still processing
      return {
        success: true,
        jobId,
        status,
        progress: data.progress || 0,
        estimatedTime: data.estimated_time_remaining || data.eta
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async cancelVideoJob(jobId: string): Promise<boolean> {
    if (!this.config?.apiKey) return false;

    try {
      const response = await fetch(`${this.baseUrl}/jobs/${jobId}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        }
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get available styles from Nano Banana
   */
  async getAvailableStyles(): Promise<string[]> {
    if (!this.config?.apiKey) return [];

    try {
      const response = await fetch(`${this.baseUrl}/styles`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        return data.styles || [];
      }
    } catch {
      // Ignore errors
    }

    return [];
  }

  /**
   * Get user's remaining credits/quota
   */
  async getQuota(): Promise<{ remaining: number; total: number } | null> {
    if (!this.config?.apiKey) return null;

    try {
      const response = await fetch(`${this.baseUrl}/account/quota`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        return {
          remaining: data.remaining || data.credits_remaining || 0,
          total: data.total || data.credits_total || 0
        };
      }
    } catch {
      // Ignore errors
    }

    return null;
  }
}

export const nanoBananaProvider = new NanoBananaProvider();
