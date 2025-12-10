/**
 * VideoModelsSection Component
 *
 * Displays available video generation models and their status.
 */

import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Divider
} from '@mui/material';
import {
  VideoLibrary as VideoIcon
} from '@mui/icons-material';
import { useStore } from '../../store/useStore';
import { VideoModelCard } from './VideoModelCard';

export const VideoModelsSection: React.FC = () => {
  const { getVideoModelStatus } = useStore();

  const videoModels = getVideoModelStatus();

  // Separate local and cloud models
  const localModels = videoModels.filter(m => m.type === 'local');
  const cloudModels = videoModels.filter(m => m.type === 'cloud');

  // Count enabled models
  const enabledCount = videoModels.filter(m => m.enabled && !m.comingSoon).length;

  return (
    <Paper sx={{ p: 3 }}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Box display="flex" alignItems="center" gap={1}>
          <VideoIcon color="secondary" />
          <Typography variant="h6">Video Models</Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          {enabledCount} of {videoModels.filter(m => !m.comingSoon).length} available
        </Typography>
      </Box>

      <Typography variant="body2" color="text.secondary" mb={3}>
        Video generation models available through your local agents and cloud services.
        Models are enabled when at least one agent has the required workflow configured.
      </Typography>

      {/* Local Models */}
      <Box mb={3}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Local (ComfyUI)
        </Typography>
        <Grid container spacing={1.5}>
          {localModels.map((model) => (
            <Grid size={{ xs: 12, md: 6 }} key={model.id}>
              <VideoModelCard model={model} />
            </Grid>
          ))}
        </Grid>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Cloud Models */}
      <Box>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Cloud Services
        </Typography>
        <Grid container spacing={1.5}>
          {cloudModels.map((model) => (
            <Grid size={{ xs: 12, md: 6 }} key={model.id}>
              <VideoModelCard model={model} />
            </Grid>
          ))}
        </Grid>
      </Box>
    </Paper>
  );
};

export default VideoModelsSection;
