import { useState, useCallback, useMemo, useRef } from 'react';
import useWebSocket, { GenerationProgressData } from './useWebSocket';
import { createDefaultSteps } from '../components/GenerationProgressModal';

export interface StoryConfig {
  prompt: string;
  genre: string;
  length: string;
  visualStyle: string;
  aspectRatio: string;
  fps: string;
  autoPrompt: boolean;
  priority: number;
  characterConsistency: boolean;
  musicGeneration: boolean;
  narrationGeneration: boolean;
}

interface GenerationState {
  isGenerating: boolean;
  currentStoryId: string | null;
  steps: any[];
  overallProgress: number;
  isComplete: boolean;
  hasError: boolean;
  errorMessage: string | null;
}

interface UseStoryGenerationReturn {
  state: GenerationState;
  startGeneration: (config: StoryConfig) => Promise<void>;
  cancelGeneration: () => void;
  resetGeneration: () => void;
  retryGeneration: () => void;
}

const useStoryGeneration = (): UseStoryGenerationReturn => {
  const [state, setState] = useState<GenerationState>({
    isGenerating: false,
    currentStoryId: null,
    steps: createDefaultSteps(),
    overallProgress: 0,
    isComplete: false,
    hasError: false,
    errorMessage: null,
  });

  const [lastConfig, setLastConfig] = useState<StoryConfig | null>(null);
  const currentStoryIdRef = useRef<string | null>(null);
  
  // Generate a unique client ID for this session
  const clientId = useMemo(() => {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  const handleProgress = useCallback((storyId: string, progress: GenerationProgressData) => {
    if (storyId !== currentStoryIdRef.current) return;

    setState(prev => {
      const newSteps = [...prev.steps];
      
      // Find and update the current step
      const stepIndex = newSteps.findIndex(step => step.id === progress.step);
      if (stepIndex >= 0) {
        newSteps[stepIndex] = {
          ...newSteps[stepIndex],
          status: progress.progress >= 100 ? 'completed' : 'in_progress',
          progress: progress.progress,
          message: progress.message,
        };

        // Mark previous steps as completed
        for (let i = 0; i < stepIndex; i++) {
          if (newSteps[i].status === 'pending') {
            newSteps[i].status = 'completed';
            newSteps[i].progress = 100;
          }
        }
      }

      // Handle special cases
      if (progress.step === 'error') {
        // Find the step that failed
        const failedStepIndex = newSteps.findIndex(step => step.status === 'in_progress');
        if (failedStepIndex >= 0) {
          newSteps[failedStepIndex] = {
            ...newSteps[failedStepIndex],
            status: 'error',
            message: progress.message,
          };
        }

        return {
          ...prev,
          steps: newSteps,
          hasError: true,
          errorMessage: progress.message,
          isGenerating: false,
        };
      }

      if (progress.step === 'completed') {
        // Mark all steps as completed
        const completedSteps = newSteps.map(step => ({
          ...step,
          status: 'completed' as const,
          progress: 100,
        }));

        return {
          ...prev,
          steps: completedSteps,
          overallProgress: 100,
          isComplete: true,
          isGenerating: false,
        };
      }

      // Calculate overall progress
      const completedSteps = newSteps.filter(step => step.status === 'completed').length;
      const inProgressSteps = newSteps.filter(step => step.status === 'in_progress');
      const inProgressContribution = inProgressSteps.reduce((sum, step) => sum + (step.progress || 0), 0) / 100;
      
      const totalProgress = ((completedSteps + inProgressContribution) / newSteps.length) * 100;

      return {
        ...prev,
        steps: newSteps,
        overallProgress: Math.min(totalProgress, 99), // Keep at 99% until fully complete
      };
    });
  }, [state.currentStoryId]);

  const handleWebSocketError = useCallback((error: Event) => {
    console.error('WebSocket error during generation:', error);
    setState(prev => ({
      ...prev,
      hasError: true,
      errorMessage: 'Connection error during generation',
      isGenerating: false,
    }));
  }, []);

  const { isConnected, subscribe, unsubscribe } = useWebSocket({
    clientId,
    onProgress: handleProgress,
    onError: handleWebSocketError,
    onConnect: () => console.log('Connected to generation updates'),
    onDisconnect: () => console.log('Disconnected from generation updates'),
  });

  const startGeneration = useCallback(async (config: StoryConfig) => {
    try {
      setLastConfig(config);
      
      // Reset state for new generation
      const storyId = `story_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      currentStoryIdRef.current = storyId;
      setState({
        isGenerating: true,
        currentStoryId: storyId,
        steps: createDefaultSteps(),
        overallProgress: 0,
        isComplete: false,
        hasError: false,
        errorMessage: null,
      });

      // Start the generation process
      const response = await fetch('http://localhost:8000/api/stories/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          story_id: storyId,
          config: {
            prompt: config.prompt,
            genre: config.genre,
            length: config.length,
            visual_style: config.visualStyle,
            aspect_ratio: config.aspectRatio,
            fps: config.fps,
            auto_prompt: config.autoPrompt,
            priority: config.priority,
            character_consistency: config.characterConsistency,
            music_generation: config.musicGeneration,
            narration_generation: config.narrationGeneration,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Generation failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Generation started:', result);

      // Subscribe to progress updates only after successful API call
      if (isConnected) {
        subscribe(storyId);
      }

    } catch (error) {
      console.error('Failed to start generation:', error);
      setState(prev => ({
        ...prev,
        hasError: true,
        errorMessage: error instanceof Error ? error.message : 'Unknown error occurred',
        isGenerating: false,
      }));
    }
  }, [isConnected, subscribe]);

  const cancelGeneration = useCallback(() => {
    if (currentStoryIdRef.current) {
      unsubscribe(currentStoryIdRef.current);
    }
    
    currentStoryIdRef.current = null;
    setState(prev => ({
      ...prev,
      isGenerating: false,
      currentStoryId: null,
    }));
  }, [unsubscribe]);

  const resetGeneration = useCallback(() => {
    if (currentStoryIdRef.current) {
      unsubscribe(currentStoryIdRef.current);
    }
    
    currentStoryIdRef.current = null;
    setState({
      isGenerating: false,
      currentStoryId: null,
      steps: createDefaultSteps(),
      overallProgress: 0,
      isComplete: false,
      hasError: false,
      errorMessage: null,
    });
  }, [unsubscribe]);

  const retryGeneration = useCallback(() => {
    if (lastConfig) {
      startGeneration(lastConfig);
    }
  }, [lastConfig, startGeneration]);

  return {
    state,
    startGeneration,
    cancelGeneration,
    resetGeneration,
    retryGeneration,
  };
};

export default useStoryGeneration;