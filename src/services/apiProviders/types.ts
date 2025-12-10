/**
 * API Provider Service Interface Types
 */

import {
  ApiProviderId,
  ProviderConfig,
  VideoGenerationRequest,
  VideoGenerationResponse,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ProviderStatus
} from '../../types/apiProviders';

/**
 * Base interface that all API providers must implement
 */
export interface IApiProvider {
  id: ApiProviderId;
  name: string;

  /**
   * Initialize the provider with configuration
   */
  initialize(config: ProviderConfig): Promise<void>;

  /**
   * Check if the provider is properly configured and available
   */
  checkStatus(): Promise<ProviderStatus>;

  /**
   * Generate video from text prompt
   */
  generateVideo(request: VideoGenerationRequest): Promise<VideoGenerationResponse>;

  /**
   * Check status of an async video generation job
   */
  checkVideoJob?(jobId: string): Promise<VideoGenerationResponse>;

  /**
   * Cancel a video generation job
   */
  cancelVideoJob?(jobId: string): Promise<boolean>;

  /**
   * Chat completion (for LLM providers)
   */
  chatCompletion?(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
}

/**
 * Events emitted by providers
 */
export interface ProviderEvent {
  type: 'status_change' | 'job_progress' | 'job_complete' | 'job_failed' | 'error';
  providerId: ApiProviderId;
  data?: any;
}

/**
 * Provider event listener
 */
export type ProviderEventListener = (event: ProviderEvent) => void;
