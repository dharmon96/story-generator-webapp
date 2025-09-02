import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  LinearProgress,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  IconButton,
  Divider,
  CircularProgress,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as PendingIcon,
  Error as ErrorIcon,
  Close as CloseIcon,
  AutoStories as StoryIcon,
  People as PeopleIcon,
  VideoLibrary as ShotsIcon,
  Palette as PromptsIcon,
  RecordVoiceOver as NarrationIcon,
  MusicNote as MusicIcon,
  Save as SaveIcon,
} from '@mui/icons-material';

interface GenerationStep {
  id: string;
  label: string;
  description: string;
  icon: React.ReactElement;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  progress: number;
  message?: string;
  details?: string[];
}

interface GenerationProgressModalProps {
  open: boolean;
  onClose: () => void;
  storyId: string;
  storyTitle?: string;
  steps: GenerationStep[];
  overallProgress: number;
  isComplete: boolean;
  hasError: boolean;
  onRetry?: () => void;
  onViewResult?: () => void;
}

const GenerationProgressModal: React.FC<GenerationProgressModalProps> = ({
  open,
  onClose,
  storyId,
  storyTitle = 'Untitled Story',
  steps,
  overallProgress,
  isComplete,
  hasError,
  onRetry,
  onViewResult,
}) => {
  const [activeStep, setActiveStep] = useState(0);

  // Find the current active step
  useEffect(() => {
    const currentStepIndex = steps.findIndex(
      (step) => step.status === 'in_progress'
    );
    if (currentStepIndex >= 0) {
      setActiveStep(currentStepIndex);
    } else if (isComplete) {
      setActiveStep(steps.length - 1);
    }
  }, [steps, isComplete]);

  const getStepIcon = (step: GenerationStep) => {
    if (step.status === 'completed') {
      return <CheckCircleIcon color="success" />;
    } else if (step.status === 'error') {
      return <ErrorIcon color="error" />;
    } else if (step.status === 'in_progress') {
      return <CircularProgress size={24} />;
    }
    return step.icon;
  };

  const getProgressColor = () => {
    if (hasError) return 'error';
    if (isComplete) return 'success';
    return 'primary';
  };

  return (
    <Dialog 
      open={open} 
      onClose={isComplete ? onClose : undefined}
      maxWidth="md" 
      fullWidth
      disableEscapeKeyDown={!isComplete}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h6">Generating Story</Typography>
          <Typography variant="body2" color="text.secondary">
            {storyTitle} • ID: {storyId.slice(0, 8)}...
          </Typography>
        </Box>
        {isComplete && (
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        )}
      </DialogTitle>

      <DialogContent sx={{ pb: 2 }}>
        {/* Overall Progress */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Overall Progress
            </Typography>
            <Box sx={{ flex: 1, mx: 2 }}>
              <LinearProgress 
                variant="determinate" 
                value={overallProgress} 
                color={getProgressColor()}
                sx={{ height: 8, borderRadius: 4 }}
              />
            </Box>
            <Typography variant="body2" color="text.secondary">
              {Math.round(overallProgress)}%
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
            {isComplete 
              ? 'Story generation completed!' 
              : hasError 
                ? 'Generation encountered an error'
                : `Step ${activeStep + 1} of ${steps.length}`
            }
          </Typography>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Step-by-step Progress */}
        <Stepper activeStep={activeStep} orientation="vertical">
          {steps.map((step, index) => (
            <Step key={step.id} expanded>
              <StepLabel 
                icon={getStepIcon(step)}
                error={step.status === 'error'}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body1" fontWeight={step.status === 'in_progress' ? 'bold' : 'normal'}>
                    {step.label}
                  </Typography>
                  <Chip 
                    size="small" 
                    label={step.status.replace('_', ' ')}
                    color={
                      step.status === 'completed' ? 'success' :
                      step.status === 'error' ? 'error' :
                      step.status === 'in_progress' ? 'primary' : 'default'
                    }
                    variant="outlined"
                  />
                </Box>
              </StepLabel>
              <StepContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {step.description}
                </Typography>
                
                {step.status === 'in_progress' && (
                  <Box sx={{ mb: 2 }}>
                    <LinearProgress 
                      variant="determinate" 
                      value={step.progress} 
                      sx={{ height: 6, borderRadius: 3, mb: 1 }}
                    />
                    {step.message && (
                      <Typography variant="body2" color="text.secondary">
                        {step.message}
                      </Typography>
                    )}
                  </Box>
                )}

                {step.status === 'error' && step.message && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="error">
                      Error: {step.message}
                    </Typography>
                  </Box>
                )}

                {step.details && step.details.length > 0 && (
                  <List dense sx={{ pl: 2 }}>
                    {step.details.map((detail, i) => (
                      <ListItem key={i} sx={{ py: 0 }}>
                        <Typography variant="body2" color="text.secondary">
                          • {detail}
                        </Typography>
                      </ListItem>
                    ))}
                  </List>
                )}
              </StepContent>
            </Step>
          ))}
        </Stepper>
      </DialogContent>

      <DialogActions sx={{ p: 3, pt: 1 }}>
        {hasError && onRetry && (
          <Button onClick={onRetry} color="primary" variant="outlined">
            Retry Generation
          </Button>
        )}
        {isComplete && onViewResult && (
          <Button onClick={onViewResult} color="primary" variant="contained">
            View Story
          </Button>
        )}
        {isComplete && (
          <Button onClick={onClose} color="primary">
            Close
          </Button>
        )}
        {!isComplete && !hasError && (
          <Button disabled color="primary">
            Generating...
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default GenerationProgressModal;

// Helper function to create default steps
export const createDefaultSteps = (): GenerationStep[] => [
  {
    id: 'story',
    label: 'Story Generation',
    description: 'Creating the main story content based on your prompt and settings',
    icon: <StoryIcon />,
    status: 'pending',
    progress: 0,
  },
  {
    id: 'characters',
    label: 'Character Analysis',
    description: 'Extracting and analyzing characters from the story',
    icon: <PeopleIcon />,
    status: 'pending',
    progress: 0,
  },
  {
    id: 'shots',
    label: 'Shot List Creation',
    description: 'Breaking down the story into filmable shots and scenes',
    icon: <ShotsIcon />,
    status: 'pending',
    progress: 0,
  },
  {
    id: 'prompts',
    label: 'Visual Prompts',
    description: 'Generating optimized prompts for AI video generation',
    icon: <PromptsIcon />,
    status: 'pending',
    progress: 0,
  },
  {
    id: 'narration',
    label: 'Voice-over Creation',
    description: 'Generating narration script for voice synthesis',
    icon: <NarrationIcon />,
    status: 'pending',
    progress: 0,
  },
  {
    id: 'music',
    label: 'Music Cues',
    description: 'Creating music specifications and timing cues',
    icon: <MusicIcon />,
    status: 'pending',
    progress: 0,
  },
  {
    id: 'saving',
    label: 'Saving Results',
    description: 'Saving the complete story data to database',
    icon: <SaveIcon />,
    status: 'pending',
    progress: 0,
  },
];