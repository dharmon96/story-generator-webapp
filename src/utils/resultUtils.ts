/**
 * Result Utilities
 *
 * Common utility functions for handling pipeline results
 */

/**
 * Unwrap a pipeline result that may be wrapped in { result: T } format
 * Handles both wrapped ({ result: T }) and unwrapped (T) formats
 *
 * @param wrappedResult - The result that may be wrapped
 * @returns The unwrapped result
 */
export function unwrapPipelineResult<T>(wrappedResult: unknown): T | null {
  if (wrappedResult === null || wrappedResult === undefined) {
    return null;
  }

  // Check if result is wrapped in { result: T } format
  if (typeof wrappedResult === 'object' && 'result' in (wrappedResult as object)) {
    return (wrappedResult as { result: T }).result;
  }

  // Return as-is if not wrapped
  return wrappedResult as T;
}

/**
 * Unwrap an array result from pipeline
 * Returns empty array if result is null/undefined or not an array
 */
export function unwrapArrayResult<T>(wrappedResult: unknown): T[] {
  const result = unwrapPipelineResult<T[] | T>(wrappedResult);
  return Array.isArray(result) ? result : [];
}

/**
 * Extract positive and negative prompts from a wrapped prompt result
 */
export interface PromptResult {
  positivePrompt: string;
  negativePrompt: string;
}

export function unwrapPromptResult(wrappedResult: unknown): PromptResult {
  const result = unwrapPipelineResult<PromptResult>(wrappedResult);
  return {
    positivePrompt: result?.positivePrompt || '',
    negativePrompt: result?.negativePrompt || ''
  };
}
