/**
 * GeneralSettingsSection Component
 *
 * General application settings like theme, auto-save, etc.
 */

import React from 'react';
import {
  Box,
  Typography,
  Paper,
  FormControl,
  FormControlLabel,
  Switch,
  Select,
  MenuItem,
  InputLabel,
  TextField,
  Divider,
  SelectChangeEvent
} from '@mui/material';
import {
  Palette as ThemeIcon,
  Save as SaveIcon,
  Speed as PerformanceIcon
} from '@mui/icons-material';
import { useStore } from '../../store/useStore';

export const GeneralSettingsSection: React.FC = () => {
  const { settings, updateSettings } = useStore();

  const handleThemeChange = (event: SelectChangeEvent) => {
    updateSettings({ theme: event.target.value as 'light' | 'dark' | 'system' });
  };

  const handleAutoSaveChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateSettings({ autoSave: event.target.checked });
  };

  const handleNotificationsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateSettings({ notificationsEnabled: event.target.checked });
  };

  const handleProcessingChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateSettings({ processingEnabled: event.target.checked });
  };

  const handleParallelProcessingChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(event.target.value, 10);
    if (!isNaN(value) && value >= 1 && value <= 10) {
      updateSettings({ parallelProcessing: value });
    }
  };

  const handleAutoRetryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateSettings({ autoRetry: event.target.checked });
  };

  return (
    <Paper sx={{ p: 3 }}>
      {/* Header */}
      <Typography variant="h6" gutterBottom>
        General Settings
      </Typography>

      {/* Appearance */}
      <Box mb={3}>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <ThemeIcon color="action" />
          <Typography variant="subtitle2">Appearance</Typography>
        </Box>

        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Theme</InputLabel>
          <Select
            value={settings.theme}
            onChange={handleThemeChange}
            label="Theme"
          >
            <MenuItem value="light">Light</MenuItem>
            <MenuItem value="dark">Dark</MenuItem>
            <MenuItem value="system">System Default</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Auto-save & Notifications */}
      <Box mb={3}>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <SaveIcon color="action" />
          <Typography variant="subtitle2">Data Management</Typography>
        </Box>

        <Box display="flex" flexDirection="column" gap={1}>
          <FormControlLabel
            control={
              <Switch
                checked={settings.autoSave}
                onChange={handleAutoSaveChange}
              />
            }
            label="Auto-save stories and settings"
          />

          <FormControlLabel
            control={
              <Switch
                checked={settings.notificationsEnabled}
                onChange={handleNotificationsChange}
              />
            }
            label="Enable notifications"
          />
        </Box>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Processing Settings */}
      <Box>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <PerformanceIcon color="action" />
          <Typography variant="subtitle2">Processing</Typography>
        </Box>

        <Box display="flex" flexDirection="column" gap={2}>
          <FormControlLabel
            control={
              <Switch
                checked={settings.processingEnabled ?? true}
                onChange={handleProcessingChange}
              />
            }
            label="Enable queue processing"
          />

          <TextField
            label="Parallel Processing"
            type="number"
            size="small"
            value={settings.parallelProcessing ?? 3}
            onChange={handleParallelProcessingChange}
            inputProps={{ min: 1, max: 10 }}
            helperText="Number of concurrent AI tasks (1-10)"
            sx={{ maxWidth: 200 }}
          />

          <FormControlLabel
            control={
              <Switch
                checked={settings.autoRetry ?? true}
                onChange={handleAutoRetryChange}
              />
            }
            label="Auto-retry failed tasks"
          />

          {settings.autoRetry && (
            <TextField
              label="Retry Attempts"
              type="number"
              size="small"
              value={settings.retryAttempts ?? 3}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10);
                if (!isNaN(value) && value >= 1 && value <= 10) {
                  updateSettings({ retryAttempts: value });
                }
              }}
              inputProps={{ min: 1, max: 10 }}
              sx={{ maxWidth: 200 }}
            />
          )}
        </Box>
      </Box>
    </Paper>
  );
};

export default GeneralSettingsSection;
