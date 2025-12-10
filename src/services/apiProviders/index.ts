/**
 * API Providers Service
 *
 * Central module for external video generation and LLM API providers:
 * - OpenAI (ChatGPT + Sora)
 * - Google (Gemini + Veo)
 * - Nano Banana
 *
 * Each provider implements a common interface for:
 * - Chat completion (for story generation)
 * - Video generation
 * - Status checking
 */

export * from './types';
export { openaiProvider } from './openaiProvider';
export { googleProvider } from './googleProvider';
export { nanoBananaProvider } from './nanoBananaProvider';
export { providerManager } from './providerManager';
