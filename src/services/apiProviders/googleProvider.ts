/**
 * Google Provider
 *
 * Implements support for Google AI APIs:
 * - Gemini (gemini-pro, gemini-1.5-pro) for story generation and vision
 * - Veo for video generation
 *
 * Uses Google AI Studio / Vertex AI endpoints.
 */

import { IApiProvider } from './types';
import {
  GoogleConfig,
  VideoGenerationRequest,
  VideoGenerationResponse,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ProviderStatus,
  VeoGenerationRequest
} from '../../types/apiProviders';
import { debugService } from '../debugService';

class GoogleProvider implements IApiProvider {
  id: 'google' = 'google';
  name = 'Google';

  private config: GoogleConfig | null = null;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  private veoUrl = 'https://generativelanguage.googleapis.com/v1beta';  // May be different when Veo is released

  async initialize(config: GoogleConfig): Promise<void> {
    this.config = config;
    if (config.apiEndpoint) {
      this.baseUrl = config.apiEndpoint;
    }
    debugService.info('google', 'Google provider initialized', {
      models: config.models,
      hasApiKey: !!config.apiKey
    });
  }

  async checkStatus(): Promise<ProviderStatus> {
    const status: ProviderStatus = {
      id: 'google',
      name: 'Google',
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
      const response = await fetch(
        `${this.baseUrl}/models?key=${this.config.apiKey}`
      );

      if (response.ok) {
        status.hasValidKey = true;
        status.available = true;
        status.capabilities.chat = true;
        status.capabilities.vision = true;
        // Veo availability would need separate check
        status.capabilities.video = false; // Veo not yet publicly available
      } else if (response.status === 400 || response.status === 403) {
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

      // Convert messages to Gemini format
      const contents = this.convertMessagesToGemini(request.messages, request.systemPrompt);

      const body: Record<string, any> = {
        contents,
        generationConfig: {
          temperature: request.temperature ?? 0.7,
          maxOutputTokens: request.maxTokens ?? 8192
        }
      };

      if (request.responseFormat === 'json') {
        body.generationConfig.responseMimeType = 'application/json';
      }

      const response = await fetch(
        `${this.baseUrl}/models/${model}:generateContent?key=${this.config.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return {
          success: false,
          error: error.error?.message || `API error: ${response.status}`
        };
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      const content = candidate?.content?.parts?.[0]?.text || '';

      return {
        success: true,
        content,
        finishReason: this.mapFinishReason(candidate?.finishReason),
        usage: data.usageMetadata ? {
          promptTokens: data.usageMetadata.promptTokenCount || 0,
          completionTokens: data.usageMetadata.candidatesTokenCount || 0,
          totalTokens: data.usageMetadata.totalTokenCount || 0
        } : undefined
      };
    } catch (error: any) {
      debugService.error('google', 'Chat completion failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  private convertMessagesToGemini(
    messages: ChatCompletionRequest['messages'],
    systemPrompt?: string
  ): any[] {
    const contents: any[] = [];

    // Handle system prompt
    if (systemPrompt) {
      contents.push({
        role: 'user',
        parts: [{ text: `System: ${systemPrompt}` }]
      });
      contents.push({
        role: 'model',
        parts: [{ text: 'Understood. I will follow these instructions.' }]
      });
    }

    for (const msg of messages) {
      if (msg.role === 'system') {
        // System messages handled above
        continue;
      }

      const role = msg.role === 'assistant' ? 'model' : 'user';

      if (typeof msg.content === 'string') {
        contents.push({
          role,
          parts: [{ text: msg.content }]
        });
      } else {
        // Handle multimodal content
        const parts = msg.content.map(part => {
          if (part.type === 'text') {
            return { text: part.text };
          } else if (part.type === 'image_url' && part.imageUrl) {
            // Gemini expects inline_data or file_data
            return {
              inline_data: {
                mime_type: 'image/jpeg',  // Would need to detect actual type
                data: part.imageUrl.url.replace(/^data:image\/\w+;base64,/, '')
              }
            };
          }
          return { text: '' };
        });
        contents.push({ role, parts });
      }
    }

    return contents;
  }

  private mapFinishReason(reason?: string): ChatCompletionResponse['finishReason'] {
    switch (reason) {
      case 'STOP': return 'stop';
      case 'MAX_TOKENS': return 'length';
      case 'SAFETY':
      case 'RECITATION':
      case 'OTHER': return 'content_filter';
      default: return 'stop';
    }
  }

  async generateVideo(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    if (!this.config?.apiKey) {
      return { success: false, error: 'API key not configured' };
    }

    // Cast to Veo-specific request
    const veoRequest = request as VeoGenerationRequest;

    debugService.info('google', 'Generating video with Veo', {
      promptLength: request.prompt.length,
      duration: request.duration,
      aspectRatio: veoRequest.aspectRatio
    });

    try {
      // NOTE: This is a placeholder implementation.
      // The actual Veo API structure may differ when publicly released.
      const body: Record<string, any> = {
        prompt: request.prompt,
        negativePrompt: request.negativePrompt,
        duration: request.duration || this.config.veoSettings?.defaultDuration || 5,
        aspectRatio: veoRequest.aspectRatio || this.config.veoSettings?.defaultAspectRatio || '16:9',
        resolution: request.resolution || this.config.veoSettings?.defaultResolution,
        seed: request.seed
      };

      // Image-to-video support
      if (veoRequest.sourceImage) {
        body.sourceImage = veoRequest.sourceImage;
      }

      // Camera motion control
      if (veoRequest.cameraMotion) {
        body.cameraMotion = veoRequest.cameraMotion;
      }

      // Expected endpoint - may change
      const response = await fetch(
        `${this.veoUrl}/models/veo:generate?key=${this.config.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));

        // Check if Veo is not available
        if (response.status === 404) {
          return {
            success: false,
            error: 'Veo API not yet available. Check Google AI Studio for access.'
          };
        }

        return {
          success: false,
          error: error.error?.message || `API error: ${response.status}`
        };
      }

      const data = await response.json();

      // Handle async operation response
      if (data.name && data.metadata) {
        return {
          success: true,
          jobId: data.name,
          status: 'processing',
          progress: 0
        };
      }

      // Handle immediate response
      return {
        success: true,
        videoUrl: data.videoUri || data.video_url,
        thumbnailUrl: data.thumbnailUri,
        duration: data.duration,
        resolution: data.resolution
      };
    } catch (error: any) {
      debugService.error('google', 'Veo video generation failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  async checkVideoJob(jobId: string): Promise<VideoGenerationResponse> {
    if (!this.config?.apiKey) {
      return { success: false, error: 'API key not configured' };
    }

    try {
      // Long-running operation status check
      const response = await fetch(
        `${this.veoUrl}/${jobId}?key=${this.config.apiKey}`
      );

      if (!response.ok) {
        return { success: false, error: `API error: ${response.status}` };
      }

      const data = await response.json();

      if (data.done) {
        if (data.error) {
          return {
            success: false,
            jobId,
            status: 'failed',
            error: data.error.message
          };
        }

        return {
          success: true,
          jobId,
          status: 'completed',
          progress: 100,
          videoUrl: data.response?.videoUri,
          thumbnailUrl: data.response?.thumbnailUri
        };
      }

      // Still processing
      const progress = data.metadata?.progress || 0;
      return {
        success: true,
        jobId,
        status: 'processing',
        progress,
        estimatedTime: data.metadata?.estimatedTimeRemaining
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async cancelVideoJob(jobId: string): Promise<boolean> {
    if (!this.config?.apiKey) return false;

    try {
      const response = await fetch(
        `${this.veoUrl}/${jobId}:cancel?key=${this.config.apiKey}`,
        { method: 'POST' }
      );

      return response.ok;
    } catch {
      return false;
    }
  }
}

export const googleProvider = new GoogleProvider();
