/**
 * Settings Page
 *
 * Refactored settings page using the agent-centric architecture.
 * Modular components for agent discovery, pipeline configuration,
 * video models, and general settings.
 */

import React from 'react';
import {
  Box,
  Typography,
  Grid,
  Container
} from '@mui/material';
import { Settings as SettingsIcon } from '@mui/icons-material';
import {
  AgentDiscoverySection,
  PipelineConfigSection,
  VideoModelsSection,
  ImageGenerationSection,
  GeneralSettingsSection
} from '../components/settings';

const Settings: React.FC = () => {
  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* Page Header */}
      <Box display="flex" alignItems="center" gap={2} mb={4}>
        <SettingsIcon fontSize="large" color="primary" />
        <Box>
          <Typography variant="h4" component="h1">
            Settings
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure agents, pipeline models, and application preferences
          </Typography>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Agent Discovery - Full width */}
        <Grid size={12}>
          <AgentDiscoverySection />
        </Grid>

        {/* Pipeline Configuration - Half width on large screens */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <PipelineConfigSection />
        </Grid>

        {/* Video Models - Half width on large screens */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <VideoModelsSection />
        </Grid>

        {/* Image Generation (Placeholder) - Half width */}
        <Grid size={{ xs: 12, md: 6 }}>
          <ImageGenerationSection />
        </Grid>

        {/* General Settings - Half width */}
        <Grid size={{ xs: 12, md: 6 }}>
          <GeneralSettingsSection />
        </Grid>
      </Grid>
    </Container>
  );
};

export default Settings;
