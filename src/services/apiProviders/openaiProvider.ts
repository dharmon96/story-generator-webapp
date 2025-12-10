/**
 * OpenAI Provider
 *
 * Implements support for OpenAI APIs:
 * - ChatGPT (GPT-4o, GPT-4-turbo) for story generation
 * - Sora for video generation
 *
 * Note: Sora API access is currently limited. This implementation
 * is scaffolded based on expected API structure.
 */

import { IApiProvider } from './types';
import {
  OpenAIConfig,
  VideoGenerationRequest,
  VideoGenerationResponse,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ProviderStatus,
  SoraGenerationRequest
} from '../../types/apiProviders';
import { debugService } from '../debugService';

class OpenAIProvider implements IApiProvider {
  id: 'openai' = 'openai';
  name = 'OpenAI';

  private config: OpenAIConfig | null = null;
  private baseUrl = 'https://api.openai.com/v1';

  async initialize(config: OpenAIConfig): Promise<void> {
    this.config = config;
    if (config.apiEndpoint) {
      this.baseUrl = config.apiEndpoint;
    }
    debugService.info('openai', 'OpenAI provider initialized', {
      models: config.models,
      hasApiKey: !!config.apiKey
    });
  }

  async checkStatus(): Promise<ProviderStatus> {
    const status: ProviderStatus = {
      id: 'openai',
      name: 'OpenAI',
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
      // Test API key with a models list request
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          ...(this.config.organizationId && {
            'OpenAI-Organization': this.config.organizationId
          })
        }
      });

      if (response.ok) {
        status.hasValidKey = true;
        status.available = true;
        status.capabilities.chat = true;
        status.capabilities.vision = true;
        // Sora availability would need separate check
        status.capabilities.video = false; // Sora not yet publicly available
      } else if (response.status === 401) {
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
    if (!this.config?.apiKey) {
      return { success: false, error: 'API key not configured' };
    }

    try {
      const model = request.model || this.config.models.chat;
      const messages = request.systemPrompt
        ? [{ role: 'system', content: request.systemPrompt }, ...request.messages]
        : request.messages;

      const body: Record<string, any> = {
        model,
        messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 4096
      };

      if (request.responseFormat === 'json') {
        body.response_format = { type: 'json_object' };
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          ...(this.config.organizationId && {
            'OpenAI-Organization': this.config.organizationId
          })
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return {
          success: false,
          error: error.error?.message || `API error: ${response.status}`
        };
      }

      const data = await response.json();
      const choice = data.choices?.[0];

      return {
        success: true,
        content: choice?.message?.content || '',
        finishReason: choice?.finish_reason,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens
        } : undefined
      };
    } catch (error: any) {
      debugService.error('openai', 'Chat completion failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  async generateVideo(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    if (!this.config?.apiKey) {
      return { success: false, error: 'API key not configured' };
    }

    // Cast to Sora-specific request
    const soraRequest = request as SoraGenerationRequest;

    debugService.info('openai', 'Generating video with Sora', {
      promptLength: request.prompt.length,
      duration: request.duration,
      quality: soraRequest.quality
    });

    try {
      // NOTE: This is a placeholder implementation.
      // The actual Sora API structure may differ when publicly released.
      const body = {
        model: soraRequest.model || 'sora',
        prompt: request.prompt,
        negative_prompt: request.negativePrompt,
        duration: request.duration || this.config.soraSettings?.defaultDuration || 5,
        resolution: request.resolution || this.config.soraSettings?.defaultResolution || '1920x1080',
        quality: soraRequest.quality || this.config.soraSettings?.defaultQuality || 'high',
        style: soraRequest.style || this.config.soraSettings?.style,
        aspect_ratio: soraRequest.aspectRatio || '16:9',
        seed: request.seed,
        start_frame: soraRequest.startFrame,
        end_frame: soraRequest.endFrame,
        loop: soraRequest.loop
      };

      // Expected endpoint - may change
      const response = await fetch(`${this.baseUrl}/videos/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          ...(this.config.organizationId && {
            'OpenAI-Organization': this.config.organizationId
          })
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));

        // Check if Sora is not available
        if (response.status === 404) {
          return {
            success: false,
            error: 'Sora API not yet available. Check OpenAI for access.'
          };
        }

        return {
          success: false,
          error: error.error?.message || `API error: ${response.status}`
        };
      }

      const data = await response.json();

      // Handle async job response
      if (data.id && data.status) {
        return {
          success: true,
          jobId: data.id,
          status: data.status,
          progress: data.progress || 0,
          estimatedTime: data.estimated_time
        };
      }

      // Handle immediate response
      return {
        success: true,
        videoUrl: data.url || data.video_url,
        thumbnailUrl: data.thumbnail_url,
        duration: data.duration,
        resolution: data.resolution
      };
    } catch (error: any) {
      debugService.error('openai', 'Sora video generation failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  async checkVideoJob(jobId: string): Promise<VideoGenerationResponse> {
    if (!this.config?.apiKey) {
      return { success: false, error: 'API key not configured' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/videos/generations/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          ...(this.config.organizationId && {
            'OpenAI-Organization': this.config.organizationId
          })
        }
      });

      if (!response.ok) {
        return { success: false, error: `API error: ${response.status}` };
      }

      const data = await response.json();

      return {
        success: true,
        jobId: data.id,
        status: data.status,
        progress: data.progress || 0,
        videoUrl: data.status === 'completed' ? data.url : undefined,
        thumbnailUrl: data.thumbnail_url,
        error: data.status === 'failed' ? data.error?.message : undefined
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async cancelVideoJob(jobId: string): Promise<boolean> {
    if (!this.config?.apiKey) return false;

    try {
      const response = await fetch(`${this.baseUrl}/videos/generations/${jobId}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          ...(this.config.organizationId && {
            'OpenAI-Organization': this.config.organizationId
          })
        }
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}

export const openaiProvider = new OpenAIProvider();
