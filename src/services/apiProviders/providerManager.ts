/**
 * Provider Manager Service
 *
 * Central service for managing all API providers (OpenAI, Google, Nano Banana).
 * Handles initialization, status checking, and routing requests to appropriate providers.
 */

import { IApiProvider } from './types';
import { openaiProvider } from './openaiProvider';
import { googleProvider } from './googleProvider';
import { nanoBananaProvider } from './nanoBananaProvider';
import {
  ApiProviderId,
  ProviderConfig,
  ProviderStatus,
  VideoGenerationRequest,
  VideoGenerationResponse,
  ChatCompletionRequest,
  ChatCompletionResponse
} from '../../types/apiProviders';
import { debugService } from '../debugService';

class ProviderManager {
  private providers: Map<ApiProviderId, IApiProvider> = new Map();
  private providerStatuses: Map<ApiProviderId, ProviderStatus> = new Map();
  private initialized: boolean = false;

  constructor() {
    // Register all providers
    this.providers.set('openai', openaiProvider);
    this.providers.set('google', googleProvider);
    this.providers.set('nanobanana', nanoBananaProvider);
  }

  /**
   * Initialize a specific provider with configuration
   */
  async initializeProvider(providerId: ApiProviderId, config: ProviderConfig): Promise<void> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    try {
      await provider.initialize(config);
      debugService.info('providerManager', `Provider ${providerId} initialized`);
    } catch (error: any) {
      debugService.error('providerManager', `Failed to initialize ${providerId}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Initialize all providers from a configuration object
   */
  async initializeAll(configs: Partial<Record<ApiProviderId, ProviderConfig>>): Promise<void> {
    const initPromises: Promise<void>[] = [];

    for (const [providerId, config] of Object.entries(configs)) {
      if (config) {
        initPromises.push(
          this.initializeProvider(providerId as ApiProviderId, config)
            .catch(error => {
              debugService.warn('providerManager', `Could not initialize ${providerId}: ${error.message}`);
            })
        );
      }
    }

    await Promise.all(initPromises);
    this.initialized = true;
    debugService.info('providerManager', 'All providers initialized');
  }

  /**
   * Get a provider by ID
   */
  getProvider(providerId: ApiProviderId): IApiProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Check status of a specific provider
   */
  async checkProviderStatus(providerId: ApiProviderId): Promise<ProviderStatus> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      return {
        id: providerId,
        name: providerId,
        available: false,
        configured: false,
        hasValidKey: false,
        error: 'Provider not registered',
        capabilities: { chat: false, vision: false, video: false }
      };
    }

    try {
      const status = await provider.checkStatus();
      this.providerStatuses.set(providerId, status);
      return status;
    } catch (error: any) {
      const errorStatus: ProviderStatus = {
        id: providerId,
        name: provider.name,
        available: false,
        configured: false,
        hasValidKey: false,
        error: error.message,
        capabilities: { chat: false, vision: false, video: false },
        lastChecked: new Date()
      };
      this.providerStatuses.set(providerId, errorStatus);
      return errorStatus;
    }
  }

  /**
   * Check status of all providers
   */
  async checkAllProviderStatuses(): Promise<Map<ApiProviderId, ProviderStatus>> {
    const statusPromises = Array.from(this.providers.keys()).map(async (providerId) => {
      const status = await this.checkProviderStatus(providerId);
      return { providerId, status };
    });

    const results = await Promise.all(statusPromises);
    results.forEach(({ providerId, status }) => {
      this.providerStatuses.set(providerId, status);
    });

    return this.providerStatuses;
  }

  /**
   * Get cached provider status
   */
  getProviderStatus(providerId: ApiProviderId): ProviderStatus | undefined {
    return this.providerStatuses.get(providerId);
  }

  /**
   * Get all cached provider statuses
   */
  getAllProviderStatuses(): Map<ApiProviderId, ProviderStatus> {
    return this.providerStatuses;
  }

  /**
   * Get providers that support a specific capability
   */
  getProvidersWithCapability(capability: 'chat' | 'vision' | 'video'): ApiProviderId[] {
    const available: ApiProviderId[] = [];

    this.providerStatuses.forEach((status, providerId) => {
      if (status.available && status.capabilities[capability]) {
        available.push(providerId);
      }
    });

    return available;
  }

  /**
   * Generate video using specified provider
   */
  async generateVideo(
    providerId: ApiProviderId,
    request: VideoGenerationRequest
  ): Promise<VideoGenerationResponse> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      return { success: false, error: `Unknown provider: ${providerId}` };
    }

    debugService.info('providerManager', `Generating video with ${providerId}`, {
      promptLength: request.prompt.length,
      duration: request.duration
    });

    try {
      return await provider.generateVideo(request);
    } catch (error: any) {
      debugService.error('providerManager', `Video generation failed for ${providerId}`, { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Check video job status using specified provider
   */
  async checkVideoJob(providerId: ApiProviderId, jobId: string): Promise<VideoGenerationResponse> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      return { success: false, error: `Unknown provider: ${providerId}` };
    }

    if (!provider.checkVideoJob) {
      return { success: false, error: `Provider ${providerId} does not support job status checking` };
    }

    try {
      return await provider.checkVideoJob(jobId);
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Cancel video job using specified provider
   */
  async cancelVideoJob(providerId: ApiProviderId, jobId: string): Promise<boolean> {
    const provider = this.providers.get(providerId);
    if (!provider || !provider.cancelVideoJob) {
      return false;
    }

    try {
      return await provider.cancelVideoJob(jobId);
    } catch {
      return false;
    }
  }

  /**
   * Chat completion using specified provider
   */
  async chatCompletion(
    providerId: ApiProviderId,
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      return { success: false, error: `Unknown provider: ${providerId}` };
    }

    if (!provider.chatCompletion) {
      return { success: false, error: `Provider ${providerId} does not support chat completion` };
    }

    debugService.info('providerManager', `Chat completion with ${providerId}`, {
      model: request.model,
      messageCount: request.messages.length
    });

    try {
      return await provider.chatCompletion(request);
    } catch (error: any) {
      debugService.error('providerManager', `Chat completion failed for ${providerId}`, { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get the best available provider for a capability
   * Returns the first available provider that supports the capability
   */
  getBestProviderFor(capability: 'chat' | 'vision' | 'video'): ApiProviderId | null {
    const providers = this.getProvidersWithCapability(capability);
    return providers.length > 0 ? providers[0] : null;
  }

  /**
   * Check if any provider is available for a capability
   */
  hasProviderFor(capability: 'chat' | 'vision' | 'video'): boolean {
    return this.getProvidersWithCapability(capability).length > 0;
  }

  /**
   * Get all registered provider IDs
   */
  getRegisteredProviders(): ApiProviderId[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if manager has been initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// Export singleton instance
export const providerManager = new ProviderManager();
export default providerManager;
