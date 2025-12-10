/**
 * Custom Story Dialog
 *
 * Simple dialog to create a custom/manual story:
 * - Just enter a title to get started
 * - Creates both story record and queue item
 * - Opens story view automatically for step-by-step editing
 * - Never auto-processed - full manual control
 */

import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Chip,
  Alert,
} from '@mui/material';
import {
  Add,
  Build,
} from '@mui/icons-material';
import { useStore } from '../store/useStore';
import {
  GENERATION_METHODS,
  GenerationMethodId,
} from '../types/generationMethods';

interface CustomStoryDialogProps {
  open: boolean;
  onClose: () => void;
  onStoryCreated?: (storyId: string, queueItemId: string) => void;
}

const CustomStoryDialog: React.FC<CustomStoryDialogProps> = ({
  open,
  onClose,
  onStoryCreated,
}) => {
  const { addToQueue, addStory } = useStore();

  // Simple form - just title and generation method
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('Drama');
  const [generationMethod, setGenerationMethod] = useState<GenerationMethodId>('wan22');

  // Get available methods
  const availableMethods = useMemo(() =>
    GENERATION_METHODS.filter(m => m.available && !m.comingSoon),
    []
  );

  // Get selected method
  const selectedMethod = useMemo(() =>
    GENERATION_METHODS.find(m => m.id === generationMethod),
    [generationMethod]
  );

  // Handle submit - creates story and queue item, then navigates to story view
  const handleSubmit = () => {
    if (!title.trim()) {
      return;
    }

    // Generate IDs
    const storyId = `story_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const queueItemId = `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create the story record first
    const newStory = {
      id: storyId,
      title: title.trim(),
      content: '',
      genre,
      shots: [],
      characters: [],
      status: 'draft' as const,
      generationMethod,
      createdAt: new Date(),
      updatedAt: new Date(),
      // Track step generation timestamps for stale detection
      stepGeneratedAt: {} as Record<string, Date>,
    };

    // Add story to store
    addStory(newStory);

    // Create custom queue item linked to the story
    const queueItem = {
      id: queueItemId,
      config: {
        prompt: title.trim(),
        genre,
        generationMethod,
        aspectRatio: '16:9',
        fps: selectedMethod?.features.fps[0]?.toString() || '24',
        // Required StoryConfig fields
        length: 'short',
        visualStyle: 'cinematic',
        autoPrompt: false,
        priority: 5,
        characterConsistency: true,
        musicGeneration: false,
        narrationGeneration: false,
      },
      status: 'queued' as const,
      progress: 0,
      priority: 5,
      storyId, // Link to the story
      isCustom: true,
      manualMode: true,
      completedSteps: [] as string[],
      skippedSteps: selectedMethod?.pipeline.skipSteps || [],
      stepData: {
        title: title.trim(),
      },
      // Track when each step was last generated (for stale detection)
      stepGeneratedAt: {} as Record<string, string>,
    };

    addToQueue(queueItem);

    // Close dialog and navigate to story view
    handleClose();

    // Callback to navigate to story view
    if (onStoryCreated) {
      onStoryCreated(storyId, queueItemId);
    }
  };

  // Reset form and close
  const handleClose = () => {
    setTitle('');
    setGenre('Drama');
    setGenerationMethod('wan22');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Build color="primary" />
        Create Custom Story
        <Chip
          label="Manual Mode"
          size="small"
          color="warning"
          sx={{ ml: 'auto' }}
        />
      </DialogTitle>

      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
          {/* Info Alert */}
          <Alert severity="info">
            <Typography variant="body2">
              <strong>Custom stories</strong> give you full control. Enter a title to create
              your story, then go step-by-step to generate or manually enter content for each stage.
            </Typography>
          </Alert>

          {/* Title Input */}
          <TextField
            label="Story Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
            required
            autoFocus
            placeholder="Enter a title for your story..."
            helperText="You can change this later"
          />

          {/* Genre and Method in one row */}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Genre</InputLabel>
              <Select
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                label="Genre"
              >
                <MenuItem value="Drama">Drama</MenuItem>
                <MenuItem value="Comedy">Comedy</MenuItem>
                <MenuItem value="Thriller">Thriller</MenuItem>
                <MenuItem value="Sci-Fi">Sci-Fi</MenuItem>
                <MenuItem value="Romance">Romance</MenuItem>
                <MenuItem value="Horror">Horror</MenuItem>
                <MenuItem value="Mystery">Mystery</MenuItem>
                <MenuItem value="Fantasy">Fantasy</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Video Method</InputLabel>
              <Select
                value={generationMethod}
                onChange={(e) => setGenerationMethod(e.target.value as GenerationMethodId)}
                label="Video Method"
              >
                {availableMethods.map(method => (
                  <MenuItem key={method.id} value={method.id}>
                    {method.icon} {method.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {selectedMethod && (
            <Typography variant="caption" color="text.secondary">
              <strong>{selectedMethod.name}:</strong> {selectedMethod.description}
            </Typography>
          )}

          {/* What happens next */}
          <Alert severity="success" variant="outlined">
            <Typography variant="body2">
              <strong>Next:</strong> You'll be taken directly to the story editor where you can
              generate or enter content for each step: Story → Shots → Characters → Prompts.
            </Typography>
          </Alert>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!title.trim()}
          startIcon={<Add />}
        >
          Create & Open Story
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CustomStoryDialog;
