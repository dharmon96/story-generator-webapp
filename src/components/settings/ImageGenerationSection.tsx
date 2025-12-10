/**
 * ImageGenerationSection Component
 *
 * Placeholder section for future image generation configuration.
 */

import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Alert,
  Chip
} from '@mui/material';
import {
  Image as ImageIcon,
  Construction as ComingSoonIcon
} from '@mui/icons-material';

const PLANNED_IMAGE_MODELS = [
  { name: 'Flux', description: 'High-quality text-to-image', icon: '🌊' },
  { name: 'SDXL', description: 'Stable Diffusion XL', icon: '🎨' },
  { name: 'SD 1.5', description: 'Classic Stable Diffusion', icon: '🖼️' },
  { name: 'DALL-E 3', description: 'OpenAI image generation', icon: '🤖' },
  { name: 'Imagen 3', description: 'Google image generation', icon: '🌐' }
];

export const ImageGenerationSection: React.FC = () => {
  return (
    <Paper sx={{ p: 3 }}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Box display="flex" alignItems="center" gap={1}>
          <ImageIcon color="primary" />
          <Typography variant="h6">Image Generation</Typography>
        </Box>
        <Chip
          icon={<ComingSoonIcon />}
          label="Coming Soon"
          color="info"
          size="small"
        />
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        Image generation through ComfyUI and cloud APIs is planned for a future update.
        The interface will work similarly to video models, with local and cloud options.
      </Alert>

      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Planned Models
      </Typography>

      <Box display="flex" gap={1} flexWrap="wrap">
        {PLANNED_IMAGE_MODELS.map((model) => (
          <Chip
            key={model.name}
            label={`${model.icon} ${model.name}`}
            variant="outlined"
            disabled
            sx={{ opacity: 0.7 }}
          />
        ))}
      </Box>
    </Paper>
  );
};

export default ImageGenerationSection;
