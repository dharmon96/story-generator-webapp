/**
 * Pipeline Steps Tab
 *
 * Shows the pipeline steps for a story and allows:
 * - Viewing step status and content
 * - Manual editing of step content
 * - AI regeneration of individual steps
 * - Converting stories to manual mode for step-by-step control
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Alert,
  Button,
  Paper,
  Chip,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Build,
  Warning,
} from '@mui/icons-material';
import StepEditor, { StepGenerationStatus } from '../StepEditor';
import { useStore, QueueItem } from '../../store/useStore';
import {
  SHOT_BASED_PIPELINE,
  GENERATION_METHODS,
} from '../../types/generationMethods';
import { sequentialAiPipelineService } from '../../services/sequentialAiPipeline';

// Define step dependencies for stale detection
// If any dependency step changes after this step was generated, it becomes stale
const STEP_DEPENDENCIES: Record<string, string[]> = {
  story: [], // Story has no dependencies - it's the root
  segments: ['story'], // Segments depend on story
  shots: ['story', 'segments'], // Shots depend on story and segments
  characters: ['story', 'segments', 'shots'], // Characters depend on shots
  prompts: ['story', 'segments', 'shots', 'characters'], // Prompts depend on characters
  comfyui_prompts: ['story', 'segments', 'shots', 'characters'],
  narration: ['story', 'segments', 'shots'],
  music: ['story', 'segments', 'shots'],
};

interface PipelineStepsTabProps {
  storyId: string;
  queueItem: QueueItem | null;
  isCustomStory: boolean;
  isManualMode: boolean;
  onConvertToManual?: () => void;
}

const PipelineStepsTab: React.FC<PipelineStepsTabProps> = ({
  storyId,
  queueItem,
  isCustomStory,
  isManualMode,
  onConvertToManual,
}) => {
  const { stories, updateStory, updateQueueItem, settings } = useStore();
  const story = stories.find(s => s.id === storyId);

  const [regeneratingStep, setRegeneratingStep] = useState<string | null>(null);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get the generation method to know which steps apply
  const generationMethodId = queueItem?.config?.generationMethod || story?.generationMethod || 'wan22';
  const generationMethod = GENERATION_METHODS.find(m => m.id === generationMethodId);
  const skipSteps = generationMethod?.pipeline.skipSteps || [];

  // Get step data from queue item or story
  const getStepContent = useCallback((stepId: string): any => {
    // First check queue item stepData
    if (queueItem?.stepData && queueItem.stepData[stepId] !== undefined) {
      return queueItem.stepData[stepId];
    }

    // Then check story data
    if (!story) return null;

    // Cast story to any to access dynamic properties
    const storyData = story as any;

    switch (stepId) {
      case 'story':
        return storyData.content || null;
      case 'segments':
        // Segments stored in generationData
        return storyData.generationData?.segments || storyData.storyParts || null;
      case 'shots':
        return storyData.shots || null;
      case 'characters':
        return storyData.characters || null;
      case 'prompts':
      case 'comfyui_prompts':
        // Check if shots have prompts
        if (storyData.shots && storyData.shots.some((s: any) => s.comfyUIPositivePrompt)) {
          return storyData.shots.map((s: any) => ({
            shotNumber: s.shotNumber,
            positive: s.comfyUIPositivePrompt,
            negative: s.comfyUINegativePrompt,
          }));
        }
        return null;
      case 'narration':
        if (storyData.shots && storyData.shots.some((s: any) => s.narration)) {
          return storyData.shots.map((s: any) => ({
            shotNumber: s.shotNumber,
            narration: s.narration,
          }));
        }
        return null;
      case 'music':
        if (storyData.shots && storyData.shots.some((s: any) => s.musicCue)) {
          return storyData.shots.map((s: any) => ({
            shotNumber: s.shotNumber,
            musicCue: s.musicCue,
          }));
        }
        return null;
      default:
        return null;
    }
  }, [story, queueItem?.stepData]);

  // Get step status
  const getStepStatus = useCallback((stepId: string): 'pending' | 'completed' | 'skipped' | 'error' => {
    // Check if step is skipped in generation method or by user
    if (skipSteps.includes(stepId)) return 'skipped';
    if (queueItem?.skippedSteps?.includes(stepId)) return 'skipped';

    // Check if completed
    if (queueItem?.completedSteps?.includes(stepId)) return 'completed';

    // Check if step has content
    const content = getStepContent(stepId);
    if (content !== null && content !== undefined && content !== '') {
      // If content exists and it's an array, check if it has items
      if (Array.isArray(content) && content.length > 0) return 'completed';
      // If it's a non-empty string or object
      if (typeof content === 'string' && content.length > 0) return 'completed';
      if (typeof content === 'object' && !Array.isArray(content)) return 'completed';
    }

    return 'pending';
  }, [skipSteps, queueItem?.skippedSteps, queueItem?.completedSteps, getStepContent]);

  /**
   * Get the generation status for a step (for visual indicators)
   * - 'never': Grey - step has no content
   * - 'stale': Yellow - step has content but upstream changed (needs regeneration)
   * - 'current': Green - step has latest content (all dependencies unchanged)
   * - 'skipped': Grey muted - step intentionally skipped
   */
  const getGenerationStatus = useCallback((stepId: string): StepGenerationStatus => {
    // Check if skipped
    if (skipSteps.includes(stepId)) return 'skipped';
    if (queueItem?.skippedSteps?.includes(stepId)) return 'skipped';

    // Check if step has any content
    const content = getStepContent(stepId);
    const hasContent =
      content !== null &&
      content !== undefined &&
      content !== '' &&
      (Array.isArray(content) ? content.length > 0 : true);

    if (!hasContent) {
      return 'never';
    }

    // For custom/manual stories, check staleness using timestamps
    if ((isCustomStory || isManualMode) && queueItem?.stepGeneratedAt) {
      const stepGeneratedAt = queueItem.stepGeneratedAt[stepId];
      if (!stepGeneratedAt) {
        // Has content but no timestamp - might be manually entered, consider it current
        return 'current';
      }

      const stepTime = new Date(stepGeneratedAt).getTime();
      const dependencies = STEP_DEPENDENCIES[stepId] || [];

      // Check if any dependency was generated after this step
      for (const depId of dependencies) {
        const depGeneratedAt = queueItem.stepGeneratedAt[depId];
        if (depGeneratedAt) {
          const depTime = new Date(depGeneratedAt).getTime();
          if (depTime > stepTime) {
            // A dependency was regenerated after this step - it's stale
            return 'stale';
          }
        }
      }

      // All dependencies are older or don't exist - step is current
      return 'current';
    }

    // For non-manual stories, if content exists it's considered current
    return 'current';
  }, [
    skipSteps,
    queueItem?.skippedSteps,
    queueItem?.stepGeneratedAt,
    getStepContent,
    isCustomStory,
    isManualMode,
  ]);

  // Calculate overall progress
  const progressInfo = useMemo(() => {
    const activeSteps = SHOT_BASED_PIPELINE.filter(s => !skipSteps.includes(s.id));
    const completedSteps = activeSteps.filter(s => getStepStatus(s.id) === 'completed');
    const skippedByUser = queueItem?.skippedSteps?.length || 0;
    const totalActiveSteps = activeSteps.length - skippedByUser;
    const progress = totalActiveSteps > 0 ? (completedSteps.length / totalActiveSteps) * 100 : 0;

    return {
      completed: completedSteps.length,
      total: totalActiveSteps,
      skipped: skipSteps.length + skippedByUser,
      progress,
    };
  }, [skipSteps, queueItem?.skippedSteps, getStepStatus]);

  // Save step content
  const handleSaveStep = useCallback((stepId: string, content: any) => {
    if (!storyId) return;

    // Update story in store based on step type
    switch (stepId) {
      case 'story':
        updateStory(storyId, { content });
        break;
      case 'shots':
        updateStory(storyId, { shots: content });
        break;
      case 'characters':
        updateStory(storyId, { characters: content });
        break;
      case 'segments':
      default:
        // For segments and other steps, store in generationData or stepData
        if (queueItem) {
          updateQueueItem(queueItem.id, {
            stepData: {
              ...(queueItem.stepData || {}),
              [stepId]: content,
            },
          });
        }
        // Also update story generationData for persistence
        updateStory(storyId, {
          generationData: {
            ...(story as any)?.generationData,
            [stepId]: content,
          },
        });
        break;
    }

    // If custom/manual story, update completedSteps and timestamp
    if ((isCustomStory || isManualMode) && queueItem) {
      const currentCompleted = queueItem.completedSteps || [];
      const now = new Date().toISOString();
      updateQueueItem(queueItem.id, {
        completedSteps: currentCompleted.includes(stepId)
          ? currentCompleted
          : [...currentCompleted, stepId],
        // Update timestamp so downstream steps become stale
        stepGeneratedAt: {
          ...(queueItem.stepGeneratedAt || {}),
          [stepId]: now,
        },
      });
    }
  }, [storyId, isCustomStory, isManualMode, queueItem, updateStory, updateQueueItem]);

  // Regenerate step with AI
  const handleRegenerateStep = useCallback(async (stepId: string) => {
    if (!queueItem || !story) {
      setError('Cannot regenerate: no queue item or story found');
      return;
    }

    const modelConfigs = settings.modelConfigs || [];
    if (modelConfigs.length === 0) {
      setError('No model configs available for regeneration');
      return;
    }

    setRegeneratingStep(stepId);
    setError(null);

    try {
      // Use the pipeline service to regenerate just this step
      await sequentialAiPipelineService.regenerateStep(
        queueItem,
        stepId,
        modelConfigs,
        (progress) => {
          // Update progress
          updateQueueItem(queueItem.id, {
            currentStep: progress.currentStep,
          });
        }
      );

      // Mark step as completed and record generation timestamp
      const currentCompleted = queueItem.completedSteps || [];
      const now = new Date().toISOString();
      updateQueueItem(queueItem.id, {
        completedSteps: currentCompleted.includes(stepId)
          ? currentCompleted
          : [...currentCompleted, stepId],
        stepGeneratedAt: {
          ...(queueItem.stepGeneratedAt || {}),
          [stepId]: now,
        },
      });
    } catch (err: any) {
      setError(`Failed to regenerate ${stepId}: ${err.message}`);
    } finally {
      setRegeneratingStep(null);
    }
  }, [queueItem, story, settings.modelConfigs, updateQueueItem]);

  // Skip step
  const handleSkipStep = useCallback((stepId: string) => {
    if (!queueItem) return;

    const currentSkipped = queueItem.skippedSteps || [];
    if (!currentSkipped.includes(stepId)) {
      updateQueueItem(queueItem.id, {
        skippedSteps: [...currentSkipped, stepId],
      });
    }
  }, [queueItem, updateQueueItem]);

  // Mark step as complete
  const handleMarkComplete = useCallback((stepId: string) => {
    if (!queueItem) return;

    const currentCompleted = queueItem.completedSteps || [];
    if (!currentCompleted.includes(stepId)) {
      updateQueueItem(queueItem.id, {
        completedSteps: [...currentCompleted, stepId],
      });
    }
  }, [queueItem, updateQueueItem]);

  // Handle convert to manual mode
  const handleConvertToManual = () => {
    if (onConvertToManual) {
      onConvertToManual();
    }
    setConvertDialogOpen(false);
  };

  return (
    <Box sx={{ height: '100%', overflow: 'auto', p: 2 }}>
      {/* Header */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Build color={isCustomStory || isManualMode ? 'warning' : 'primary'} />
            <Typography variant="h6">
              Pipeline Steps
            </Typography>
            {isCustomStory && (
              <Chip label="Custom Story" color="warning" size="small" />
            )}
            {isManualMode && !isCustomStory && (
              <Chip label="Manual Mode" color="secondary" size="small" />
            )}
          </Box>

          {!isCustomStory && !isManualMode && (
            <Button
              variant="outlined"
              color="warning"
              startIcon={<Build />}
              onClick={() => setConvertDialogOpen(true)}
            >
              Convert to Manual
            </Button>
          )}
        </Box>

        {/* Progress Bar */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {progressInfo.completed}/{progressInfo.total} steps completed
              {progressInfo.skipped > 0 && ` (${progressInfo.skipped} skipped)`}
            </Typography>
            <Typography variant="body2" fontWeight="bold">
              {Math.round(progressInfo.progress)}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={progressInfo.progress}
            sx={{ height: 8, borderRadius: 4 }}
          />
        </Box>

        {/* Info Alert */}
        {(isCustomStory || isManualMode) ? (
          <Alert severity="info" icon={<Build />}>
            <Typography variant="body2">
              <strong>Manual Control Active:</strong> You can edit each step manually,
              generate with AI, or skip steps you don't need. Changes are saved automatically.
            </Typography>
          </Alert>
        ) : (
          <Alert severity="info">
            <Typography variant="body2">
              This story is being processed automatically. Convert to manual mode to
              edit individual steps or regenerate with AI.
            </Typography>
          </Alert>
        )}
      </Paper>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Step Editors */}
      {SHOT_BASED_PIPELINE.map((step) => (
        <StepEditor
          key={step.id}
          stepId={step.id}
          stepName={step.name}
          stepDescription={step.description}
          content={getStepContent(step.id)}
          status={getStepStatus(step.id)}
          generationStatus={getGenerationStatus(step.id)}
          isCustomStory={isCustomStory || isManualMode}
          onSave={handleSaveStep}
          onRegenerate={
            (isCustomStory || isManualMode) && queueItem
              ? handleRegenerateStep
              : undefined
          }
          onSkip={
            (isCustomStory || isManualMode) && queueItem
              ? handleSkipStep
              : undefined
          }
          onMarkComplete={
            (isCustomStory || isManualMode) && queueItem
              ? handleMarkComplete
              : undefined
          }
          disabled={regeneratingStep !== null}
          readOnly={!isCustomStory && !isManualMode}
        />
      ))}

      {/* Convert to Manual Dialog */}
      <Dialog open={convertDialogOpen} onClose={() => setConvertDialogOpen(false)}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Warning color="warning" />
          Convert to Manual Mode?
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" gutterBottom>
            Converting to manual mode will:
          </Typography>
          <ul>
            <li>Stop automatic processing of this story</li>
            <li>Allow you to edit each step individually</li>
            <li>Let you regenerate specific steps with AI</li>
            <li>Give you full control over the generation process</li>
          </ul>
          <Alert severity="warning" sx={{ mt: 2 }}>
            This action cannot be undone. The story will remain in manual mode.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConvertDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleConvertToManual}
            startIcon={<Build />}
          >
            Convert to Manual
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PipelineStepsTab;
