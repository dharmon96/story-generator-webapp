/**
 * PipelineConfigSection Component
 *
 * Configure which models are assigned to each pipeline step.
 * Models are assigned globally - any agent with the model can execute the step.
 */

import React, { useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  FormControl,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Chip,
  Tooltip,
  Button,
  Divider,
  Alert,
  InputLabel,
  SelectChangeEvent
} from '@mui/material';
import {
  Settings as SettingsIcon,
  CheckCircle as AvailableIcon,
  Warning as UnavailableIcon,
  Computer as LocalIcon,
  Cloud as CloudIcon
} from '@mui/icons-material';
import { useStore } from '../../store/useStore';
import { PIPELINE_STEPS, PipelineStepId } from '../../types/agentTypes';

export const PipelineConfigSection: React.FC = () => {
  const {
    pipelineAssignments,
    updatePipelineAssignment,
    setAllPipelineModels,
    getAllAvailableModels,
    getAgentsForModel,
    canExecuteStep,
    // Subscribe to agents and cloudServices to trigger re-renders when they change
    agents,
    cloudServices
  } = useStore();

  // Get all available models from agents and cloud services
  // The agents and cloudServices subscriptions ensure re-renders when agent state changes
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _agentCount = agents.length + cloudServices.length; // Force subscription usage
  const availableModels = getAllAvailableModels();

  // Get assignment for a step
  const getAssignment = (stepId: PipelineStepId) => {
    return pipelineAssignments.find(a => a.stepId === stepId) || {
      stepId,
      modelId: '',
      enabled: false
    };
  };

  // Handle model change
  const handleModelChange = (stepId: PipelineStepId, modelId: string) => {
    updatePipelineAssignment(stepId, { modelId });
  };

  // Handle enabled toggle
  const handleEnabledChange = (stepId: PipelineStepId, enabled: boolean) => {
    updatePipelineAssignment(stepId, { enabled });
  };

  // Apply same model to all steps
  const handleApplyToAll = () => {
    if (availableModels.length > 0) {
      setAllPipelineModels(availableModels[0]);
    }
  };

  // Check if model is from cloud (prefixed with provider name like "openai:", "claude:", "google:")
  const CLOUD_PROVIDERS = ['openai', 'claude', 'google'];
  const isCloudModel = (modelId: string) => {
    const provider = modelId.split(':')[0];
    return CLOUD_PROVIDERS.includes(provider);
  };

  // Get agent count for a model
  const getModelAgentCount = (modelId: string) => {
    if (isCloudModel(modelId)) return 1; // Cloud models have 1 "agent"
    return getAgentsForModel(modelId).length;
  };

  // Group models by source
  const groupedModels = useMemo(() => {
    const local: string[] = [];
    const cloud: string[] = [];

    availableModels.forEach(model => {
      if (isCloudModel(model)) {
        cloud.push(model);
      } else {
        local.push(model);
      }
    });

    return { local, cloud };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableModels]); // isCloudModel is stable (pure function with no deps)

  return (
    <Paper sx={{ p: 3 }}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Box display="flex" alignItems="center" gap={1}>
          <SettingsIcon color="primary" />
          <Typography variant="h6">Pipeline Configuration</Typography>
        </Box>

        {availableModels.length > 0 && (
          <Tooltip title="Set the first available model for all steps">
            <Button
              size="small"
              variant="outlined"
              onClick={handleApplyToAll}
            >
              Apply to All
            </Button>
          </Tooltip>
        )}
      </Box>

      <Typography variant="body2" color="text.secondary" mb={3}>
        Assign a model to each pipeline step. Any available agent with the selected model
        will be able to execute that step.
      </Typography>

      {availableModels.length === 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          No models available. Scan for agents or configure cloud API keys to enable models.
        </Alert>
      )}

      <Divider sx={{ mb: 3 }} />

      {/* Pipeline Steps */}
      {PIPELINE_STEPS.map((step) => {
        const assignment = getAssignment(step.id);
        const canExecute = canExecuteStep(step.id);
        const agentCount = assignment.modelId ? getModelAgentCount(assignment.modelId) : 0;

        return (
          <Box
            key={step.id}
            sx={{
              mb: 2,
              p: 2,
              borderRadius: 1,
              bgcolor: assignment.enabled ? 'action.hover' : 'background.paper',
              border: 1,
              borderColor: assignment.enabled
                ? canExecute ? 'success.main' : 'warning.main'
                : 'divider'
            }}
          >
            <Box display="flex" alignItems="center" justifyContent="space-between">
              <Box display="flex" alignItems="center" gap={2} flex={1}>
                {/* Step Icon & Name */}
                <Box display="flex" alignItems="center" gap={1} minWidth={180}>
                  <Typography fontSize="1.25rem">{step.icon}</Typography>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="medium">
                      {step.name}
                      {step.required && (
                        <Typography component="span" color="error" sx={{ ml: 0.5 }}>*</Typography>
                      )}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {step.description}
                    </Typography>
                  </Box>
                </Box>

                {/* Model Select */}
                <FormControl size="small" sx={{ minWidth: 250, flex: 1 }}>
                  <InputLabel>Model</InputLabel>
                  <Select
                    value={assignment.modelId}
                    onChange={(e: SelectChangeEvent) => handleModelChange(step.id, e.target.value)}
                    label="Model"
                    disabled={!assignment.enabled}
                  >
                    <MenuItem value="">
                      <em>Not assigned</em>
                    </MenuItem>

                    {groupedModels.local.length > 0 && (
                      <MenuItem disabled sx={{ opacity: 1 }}>
                        <LocalIcon fontSize="small" sx={{ mr: 1 }} />
                        <Typography variant="caption" fontWeight="bold">Local Models</Typography>
                      </MenuItem>
                    )}
                    {groupedModels.local.map((model) => (
                      <MenuItem key={model} value={model}>
                        <Box display="flex" alignItems="center" justifyContent="space-between" width="100%">
                          <span>{model}</span>
                          <Chip
                            label={`${getAgentsForModel(model).length} agent${getAgentsForModel(model).length !== 1 ? 's' : ''}`}
                            size="small"
                            variant="outlined"
                            sx={{ ml: 1 }}
                          />
                        </Box>
                      </MenuItem>
                    ))}

                    {groupedModels.cloud.length > 0 && (
                      <MenuItem disabled sx={{ opacity: 1 }}>
                        <CloudIcon fontSize="small" sx={{ mr: 1 }} />
                        <Typography variant="caption" fontWeight="bold">Cloud Models</Typography>
                      </MenuItem>
                    )}
                    {groupedModels.cloud.map((model) => (
                      <MenuItem key={model} value={model}>
                        <Box display="flex" alignItems="center" justifyContent="space-between" width="100%">
                          <span>{model.split(':')[1]}</span>
                          <Chip
                            label={model.split(':')[0]}
                            size="small"
                            color="primary"
                            variant="outlined"
                            sx={{ ml: 1 }}
                          />
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {/* Availability Indicator */}
                {assignment.enabled && assignment.modelId && (
                  <Tooltip title={canExecute ? `${agentCount} agent(s) available` : 'No agents available for this model'}>
                    <Box display="flex" alignItems="center" gap={0.5}>
                      {canExecute ? (
                        <AvailableIcon color="success" fontSize="small" />
                      ) : (
                        <UnavailableIcon color="warning" fontSize="small" />
                      )}
                    </Box>
                  </Tooltip>
                )}
              </Box>

              {/* Enable/Disable Toggle */}
              <FormControlLabel
                control={
                  <Switch
                    checked={assignment.enabled}
                    onChange={(e) => handleEnabledChange(step.id, e.target.checked)}
                    size="small"
                  />
                }
                label=""
              />
            </Box>
          </Box>
        );
      })}

      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        * Required steps must be enabled and have a model assigned for the pipeline to run.
      </Typography>
    </Paper>
  );
};

export default PipelineConfigSection;
