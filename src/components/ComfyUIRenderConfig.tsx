/**
 * ComfyUI Render Configuration Component
 *
 * Similar to MultiNodeConfig but specifically for ComfyUI render steps.
 * Allows assigning multiple ComfyUI nodes with different workflows to each render step.
 */

import React, { useState, useMemo } from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Typography,
  Tooltip,
  Chip,
  Switch,
  FormControlLabel,
  Paper,
  Alert,
  Collapse,
} from '@mui/material';
import {
  Add as AddIcon,
  Remove as RemoveIcon,
  Computer,
  Movie,
  CheckCircle,
  Error as ErrorIcon,
  KeyboardArrowUp,
  KeyboardArrowDown,
  ExpandMore,
  ExpandLess,
  Speed,
} from '@mui/icons-material';
import { OllamaNode } from '../services/nodeDiscovery';
import { ComfyUINodeAssignment, PREDEFINED_WORKFLOWS, validateWorkflowModels } from '../types/comfyuiTypes';

/**
 * Render step definition
 */
export interface ComfyUIRenderStep {
  key: string;           // e.g., 'holocine_render', 'wan_render'
  label: string;         // Display name
  description: string;   // Help text
  workflowType: 'holocine' | 'wan22' | 'hunyuan15' | 'cogvideox' | 'all';  // Which workflow type this step uses
  color: string;         // Theme color for the step
}

/**
 * Predefined render steps
 */
export const RENDER_STEPS: ComfyUIRenderStep[] = [
  {
    key: 'holocine_render',
    label: 'HoloCine Video Render',
    description: 'Scene-based video generation with character consistency',
    workflowType: 'holocine',
    color: 'rgba(156, 39, 176, 0.3)',  // Purple
  },
  {
    key: 'wan_render',
    label: 'Wan 2.2 Video Render',
    description: 'Shot-based video generation (5B/14B T2V, I2V, FLF)',
    workflowType: 'wan22',
    color: 'rgba(33, 150, 243, 0.3)',  // Blue
  },
  {
    key: 'hunyuan_render',
    label: 'Hunyuan 1.5 Video Render',
    description: 'High-quality text/image to video generation',
    workflowType: 'hunyuan15',
    color: 'rgba(255, 152, 0, 0.3)',  // Orange
  },
];

interface ComfyUIRenderConfigProps {
  step: ComfyUIRenderStep;
  assignments: ComfyUINodeAssignment[];
  nodes: OllamaNode[];
  onAssignmentChange: (stepKey: string, assignments: ComfyUINodeAssignment[]) => void;
  stepIndex: number;
}

export const ComfyUIRenderConfig: React.FC<ComfyUIRenderConfigProps> = ({
  step,
  assignments,
  nodes,
  onAssignmentChange,
  stepIndex,
}) => {
  const [expanded, setExpanded] = useState(true);

  // Filter assignments for this step
  const stepAssignments = assignments.filter(a => a.stepId === step.key);

  // Get ComfyUI-capable nodes (online only)
  const comfyUINodes = nodes.filter(n =>
    (n.type === 'comfyui' && n.status === 'online') ||
    (n.type === 'unified' && n.capabilities?.comfyui && (n.comfyuiStatus === 'online' || n.status === 'online'))
  );

  // Get workflows for this step's type
  const availableWorkflows = useMemo(() => {
    if (step.workflowType === 'all') {
      return PREDEFINED_WORKFLOWS.filter(w => w.available);
    }
    return PREDEFINED_WORKFLOWS.filter(w => w.type === step.workflowType && w.available);
  }, [step.workflowType]);

  // Validate workflow models for a node
  const getWorkflowValidation = (nodeId: string, workflowId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node?.comfyUIData) return null;
    return validateWorkflowModels(workflowId, node.comfyUIData);
  };

  const getNodeTypeIcon = (type: string) => {
    switch (type) {
      case 'unified': return <Speed fontSize="small" />;
      case 'comfyui': return <Movie fontSize="small" />;
      default: return <Computer fontSize="small" />;
    }
  };

  const addAssignment = () => {
    const newAssignment: ComfyUINodeAssignment = {
      stepId: step.key,
      nodeId: '',
      workflowId: availableWorkflows[0]?.id || '',
      enabled: true,
    };

    onAssignmentChange(step.key, [...stepAssignments, newAssignment]);
  };

  const removeAssignment = (index: number) => {
    const updated = stepAssignments.filter((_, i) => i !== index);
    onAssignmentChange(step.key, updated);
  };

  const updateAssignment = (index: number, updates: Partial<ComfyUINodeAssignment>) => {
    const updated = stepAssignments.map((a, i) =>
      i === index ? { ...a, ...updates } : a
    );
    onAssignmentChange(step.key, updated);
  };

  const moveAssignment = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) ||
        (direction === 'down' && index === stepAssignments.length - 1)) {
      return;
    }

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...stepAssignments];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    onAssignmentChange(step.key, updated);
  };

  const hasValidAssignment = stepAssignments.some(a => a.enabled && a.nodeId && a.workflowId);

  return (
    <Paper
      sx={{
        p: 2,
        mb: 2,
        background: step.color,
        border: `1px solid ${step.color.replace('0.3', '0.5')}`,
        borderRadius: 2,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Movie sx={{ color: 'white' }} />
          <Box>
            <Typography variant="subtitle1" sx={{ color: 'white', fontWeight: 'bold' }}>
              {step.label}
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
              {step.description}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Status indicator */}
          {hasValidAssignment ? (
            <Chip
              size="small"
              icon={<CheckCircle sx={{ fontSize: 14, color: '#4caf50' }} />}
              label={`${stepAssignments.filter(a => a.enabled).length} node(s)`}
              sx={{
                backgroundColor: 'rgba(76, 175, 80, 0.2)',
                color: 'white',
                height: 24,
              }}
            />
          ) : (
            <Chip
              size="small"
              icon={<ErrorIcon sx={{ fontSize: 14, color: '#ff9800' }} />}
              label="Not configured"
              sx={{
                backgroundColor: 'rgba(255, 152, 0, 0.2)',
                color: 'white',
                height: 24,
              }}
            />
          )}
          {expanded ? <ExpandLess sx={{ color: 'white' }} /> : <ExpandMore sx={{ color: 'white' }} />}
        </Box>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ mt: 2 }}>
          {/* No ComfyUI nodes warning */}
          {comfyUINodes.length === 0 && (
            <Alert
              severity="warning"
              sx={{
                mb: 2,
                backgroundColor: 'rgba(255, 152, 0, 0.1)',
                border: '1px solid rgba(255, 152, 0, 0.3)',
              }}
            >
              No ComfyUI nodes available. Scan your network or add a node manually.
            </Alert>
          )}

          {/* Node assignments list */}
          {stepAssignments.map((assignment, index) => {
            const node = nodes.find(n => n.id === assignment.nodeId);
            const validation = assignment.nodeId && assignment.workflowId
              ? getWorkflowValidation(assignment.nodeId, assignment.workflowId)
              : null;

            return (
              <Paper
                key={index}
                sx={{
                  p: 2,
                  mb: 1,
                  background: assignment.enabled
                    ? 'rgba(255,255,255,0.1)'
                    : 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 1,
                  opacity: assignment.enabled ? 1 : 0.6,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  {/* Priority controls */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                      #{index + 1}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => moveAssignment(index, 'up')}
                      disabled={index === 0}
                      sx={{ color: 'rgba(255,255,255,0.7)', p: 0.25 }}
                    >
                      <KeyboardArrowUp fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => moveAssignment(index, 'down')}
                      disabled={index === stepAssignments.length - 1}
                      sx={{ color: 'rgba(255,255,255,0.7)', p: 0.25 }}
                    >
                      <KeyboardArrowDown fontSize="small" />
                    </IconButton>
                  </Box>

                  {/* Configuration */}
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', gap: 2, mb: 1.5 }}>
                      {/* Node selection */}
                      <FormControl size="small" sx={{ minWidth: 200, flex: 1 }}>
                        <InputLabel sx={{ color: 'rgba(255,255,255,0.7)' }}>ComfyUI Node</InputLabel>
                        <Select
                          value={assignment.nodeId}
                          onChange={(e) => updateAssignment(index, { nodeId: e.target.value })}
                          label="ComfyUI Node"
                          sx={{
                            color: 'white',
                            '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.3)' },
                            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.5)' },
                            '.MuiSvgIcon-root': { color: 'rgba(255,255,255,0.7)' },
                          }}
                        >
                          <MenuItem value="">
                            <em>Select node...</em>
                          </MenuItem>
                          {comfyUINodes.map(n => (
                            <MenuItem key={n.id} value={n.id}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {getNodeTypeIcon(n.type)}
                                <span>
                                  {n.name} ({n.host}:{n.comfyUIPort || n.port})
                                </span>
                                {n.type === 'unified' && (
                                  <Chip size="small" label="Unified" sx={{ height: 18, fontSize: '0.6rem' }} />
                                )}
                              </Box>
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      {/* Workflow selection */}
                      <FormControl size="small" sx={{ minWidth: 220, flex: 1 }}>
                        <InputLabel sx={{ color: 'rgba(255,255,255,0.7)' }}>Workflow</InputLabel>
                        <Select
                          value={assignment.workflowId}
                          onChange={(e) => updateAssignment(index, { workflowId: e.target.value })}
                          label="Workflow"
                          sx={{
                            color: 'white',
                            '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.3)' },
                            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.5)' },
                            '.MuiSvgIcon-root': { color: 'rgba(255,255,255,0.7)' },
                          }}
                        >
                          {availableWorkflows.map(w => (
                            <MenuItem key={w.id} value={w.id}>
                              {w.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Box>

                    {/* Validation status */}
                    {validation && (
                      <Box sx={{ mt: 1 }}>
                        {validation.isValid ? (
                          <Chip
                            size="small"
                            icon={<CheckCircle sx={{ fontSize: 14 }} />}
                            label="Models Ready"
                            color="success"
                            sx={{ height: 22, fontSize: '0.7rem' }}
                          />
                        ) : (
                          <Tooltip title={`Missing: ${validation.missingModels.map(m => m.name).join(', ')}`}>
                            <Chip
                              size="small"
                              icon={<ErrorIcon sx={{ fontSize: 14 }} />}
                              label={`Missing ${validation.missingModels.length} model(s)`}
                              color="warning"
                              sx={{ height: 22, fontSize: '0.7rem' }}
                            />
                          </Tooltip>
                        )}
                      </Box>
                    )}

                    {/* Node info */}
                    {node?.comfyUIData && (
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', mt: 1, display: 'block' }}>
                        {node.comfyUIData.checkpoints?.length || 0} checkpoints,{' '}
                        {node.comfyUIData.unets?.length || 0} video models
                      </Typography>
                    )}
                  </Box>

                  {/* Controls */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={assignment.enabled}
                          onChange={(e) => updateAssignment(index, { enabled: e.target.checked })}
                          size="small"
                          sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#4caf50' } }}
                        />
                      }
                      label=""
                    />
                    <IconButton
                      size="small"
                      onClick={() => removeAssignment(index)}
                      sx={{ color: 'rgba(255,255,255,0.7)' }}
                    >
                      <RemoveIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
              </Paper>
            );
          })}

          {/* Add button */}
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Tooltip title="Add another node assignment for load balancing">
              <IconButton
                onClick={addAssignment}
                disabled={comfyUINodes.length === 0}
                sx={{
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  color: 'white',
                  '&:hover': { backgroundColor: 'rgba(255,255,255,0.2)' },
                }}
              >
                <AddIcon />
              </IconButton>
            </Tooltip>
          </Box>

          {stepAssignments.length === 0 && (
            <Typography
              variant="body2"
              sx={{
                color: 'rgba(255,255,255,0.6)',
                textAlign: 'center',
                mt: 1,
              }}
            >
              Click + to add a node assignment
            </Typography>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
};

export default ComfyUIRenderConfig;
