/**
 * API Provider Types
 *
 * Defines the interfaces and types for external video generation API providers:
 * - OpenAI (ChatGPT + Sora)
 * - Google (Gemini + Veo)
 * - Nano Banana
 */

/**
 * Supported API providers
 */
export type ApiProviderId = 'openai' | 'google' | 'nanobanana';

/**
 * Base configuration for all API providers
 */
export interface ApiProviderConfig {
  id: ApiProviderId;
  name: string;
  enabled: boolean;
  apiKey?: string;
  apiEndpoint?: string;  // Custom endpoint for proxies
  organizationId?: string;  // For OpenAI
  projectId?: string;  // For Google
}

/**
 * OpenAI Provider Configuration
 * Supports: GPT-4, ChatGPT, Sora
 */
export interface OpenAIConfig extends ApiProviderConfig {
  id: 'openai';
  models: {
    chat: string;  // e.g., 'gpt-4o', 'gpt-4-turbo'
    vision: string;  // e.g., 'gpt-4o'
    video: string;  // e.g., 'sora'
  };
  // Sora-specific settings
  soraSettings?: {
    defaultQuality: 'standard' | 'high' | 'hd';
    defaultDuration: number;  // seconds
    defaultResolution: string;
    style?: 'natural' | 'cinematic' | 'dramatic';
  };
}

/**
 * Google Provider Configuration
 * Supports: Gemini, Veo
 */
export interface GoogleConfig extends ApiProviderConfig {
  id: 'google';
  models: {
    chat: string;  // e.g., 'gemini-pro', 'gemini-1.5-pro'
    vision: string;  // e.g., 'gemini-pro-vision'
    video: string;  // e.g., 'veo'
  };
  // Veo-specific settings
  veoSettings?: {
    defaultAspectRatio: '16:9' | '9:16' | '1:1';
    defaultDuration: number;  // seconds
    defaultResolution: string;
  };
}

/**
 * Nano Banana Provider Configuration
 */
export interface NanoBananaConfig extends ApiProviderConfig {
  id: 'nanobanana';
  models: {
    video: string;  // e.g., 'default', 'fast', 'quality'
  };
  defaultSettings?: {
    defaultQuality: 'draft' | 'standard' | 'high';
    defaultDuration: number;
    defaultResolution: string;
    priority?: 'normal' | 'high';
  };
}

/**
 * Union type for all provider configs
 */
export type ProviderConfig = OpenAIConfig | GoogleConfig | NanoBananaConfig;

/**
 * Video generation request (generic)
 */
export interface VideoGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  duration?: number;  // seconds
  resolution?: string;
  fps?: number;
  style?: string;
  seed?: number;
  // Provider-specific extensions
  providerOptions?: Record<string, any>;
}

/**
 * Video generation response
 */
export interface VideoGenerationResponse {
  success: boolean;
  videoUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  resolution?: string;
  error?: string;
  // Job tracking for async generation
  jobId?: string;
  status?: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;
  estimatedTime?: number;  // seconds remaining
}

/**
 * OpenAI Sora generation request
 */
export interface SoraGenerationRequest extends VideoGenerationRequest {
  model?: 'sora' | 'sora-turbo';
  quality?: 'standard' | 'high' | 'hd';
  style?: 'natural' | 'cinematic' | 'dramatic' | 'animated';
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3';
  // First/last frame control
  startFrame?: string;  // Base64 or URL
  endFrame?: string;
  // Loop settings
  loop?: boolean;
}

/**
 * Google Veo generation request
 */
export interface VeoGenerationRequest extends VideoGenerationRequest {
  model?: 'veo' | 'veo-2';
  aspectRatio?: '16:9' | '9:16' | '1:1';
  // Image-to-video support
  sourceImage?: string;  // Base64 or URL
  // Motion control
  cameraMotion?: 'static' | 'pan_left' | 'pan_right' | 'zoom_in' | 'zoom_out' | 'orbit';
}

/**
 * Nano Banana generation request
 */
export interface NanoBananaGenerationRequest extends VideoGenerationRequest {
  model?: 'default' | 'fast' | 'quality';
  quality?: 'draft' | 'standard' | 'high';
  priority?: 'normal' | 'high';
  // Callback URL for async notifications
  callbackUrl?: string;
  // Source image for image-to-video
  sourceImage?: string;
  // Style preset
  style?: string;
}

// Alias for compatibility
export type NanoBananaRequest = NanoBananaGenerationRequest;

/**
 * Chat completion request for LLM providers (story generation)
 */
export interface ChatCompletionRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  responseFormat?: 'text' | 'json';
}

/**
 * Chat message structure
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContentPart[];
}

/**
 * Multimodal content part
 */
export interface ChatContentPart {
  type: 'text' | 'image_url';
  text?: string;
  imageUrl?: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

/**
 * Chat completion response
 */
export interface ChatCompletionResponse {
  success: boolean;
  content?: string;
  finishReason?: 'stop' | 'length' | 'content_filter';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: string;
}

/**
 * Provider status for health checks
 */
export interface ProviderStatus {
  id: ApiProviderId;
  name: string;
  available: boolean;
  configured: boolean;
  hasValidKey: boolean;
  error?: string;
  lastChecked?: Date;
  capabilities: {
    chat: boolean;
    vision: boolean;
    video: boolean;
  };
}

/**
 * All provider settings (for store)
 */
export interface ApiProviderSettings {
  openai?: OpenAIConfig;
  google?: GoogleConfig;
  nanobanana?: NanoBananaConfig;
  // Default provider for each capability
  defaults: {
    chat?: ApiProviderId;
    video?: ApiProviderId;
    vision?: ApiProviderId;
  };
}

/**
 * Default configurations
 */
export const DEFAULT_OPENAI_CONFIG: Partial<OpenAIConfig> = {
  id: 'openai',
  name: 'OpenAI',
  enabled: false,
  models: {
    chat: 'gpt-4o',
    vision: 'gpt-4o',
    video: 'sora'
  },
  soraSettings: {
    defaultQuality: 'high',
    defaultDuration: 5,
    defaultResolution: '1920x1080',
    style: 'cinematic'
  }
};

export const DEFAULT_GOOGLE_CONFIG: Partial<GoogleConfig> = {
  id: 'google',
  name: 'Google',
  enabled: false,
  models: {
    chat: 'gemini-1.5-pro',
    vision: 'gemini-1.5-pro',
    video: 'veo'
  },
  veoSettings: {
    defaultAspectRatio: '16:9',
    defaultDuration: 5,
    defaultResolution: '1920x1080'
  }
};

export const DEFAULT_NANOBANANA_CONFIG: Partial<NanoBananaConfig> = {
  id: 'nanobanana',
  name: 'Nano Banana',
  enabled: false,
  models: {
    video: 'default'
  },
  defaultSettings: {
    defaultQuality: 'standard',
    defaultDuration: 5,
    defaultResolution: '1280x720',
    priority: 'normal'
  }
};
