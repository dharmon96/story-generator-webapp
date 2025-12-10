/**
 * Shot Item Component
 *
 * Displays a single shot within a shotlist with:
 * - Workflow type toggle (shot-based vs scene-based)
 * - Per-shot settings
 * - Prompt editing (adapts based on workflow type)
 * - Render status and preview
 * - Selection for bulk operations
 */

import React, { useState, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  IconButton,
  Checkbox,
  Collapse,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Tooltip,
  Menu,
  ListItemIcon,
  ListItemText,
  Divider,
  Switch,
  FormControlLabel,
  Alert,
  Card,
  CardMedia,
} from '@mui/material';
import {
  ExpandMore,
  ExpandLess,
  Delete,
  PlayArrow,
  MoreVert,
  Movie,
  Videocam,
  DragIndicator,
  Folder,
  CheckCircle,
  Schedule,
  Error as ErrorIcon,
  HourglassEmpty,
  Edit,
  Settings,
  ContentCopy,
  Add,
  Remove,
} from '@mui/icons-material';
import {
  ShotlistShot,
  ShotlistGroup,
  ShotCaption,
  WorkflowType,
  ShotRenderStatus,
} from '../../types/shotlistTypes';
import { GENERATION_METHODS, GenerationMethodId, getGenerationMethod } from '../../types/generationMethods';

interface ShotItemProps {
  shot: ShotlistShot;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  onUpdate: (updates: Partial<ShotlistShot>) => void;
  onDelete: () => void;
  onMoveToGroup: (groupId: string | undefined) => void;
  onQueue: () => void;
  availableGroups: ShotlistGroup[];
  defaultSettings: {
    numFrames: number;
    fps: number;
    resolution: string;
    steps: number;
    cfg: number;
  };
}

const ShotItem: React.FC<ShotItemProps> = ({
  shot,
  selected,
  onSelect,
  onUpdate,
  onDelete,
  onMoveToGroup,
  onQueue,
  availableGroups,
  defaultSettings,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Get status display
  const getStatusInfo = () => {
    switch (shot.renderStatus) {
      case 'completed':
        return { icon: <CheckCircle />, color: 'success' as const, label: 'Rendered' };
      case 'rendering':
        return { icon: <Movie />, color: 'primary' as const, label: 'Rendering' };
      case 'queued':
        return { icon: <Schedule />, color: 'warning' as const, label: 'Queued' };
      case 'failed':
        return { icon: <ErrorIcon />, color: 'error' as const, label: 'Failed' };
      default:
        return { icon: <HourglassEmpty />, color: 'default' as const, label: 'Pending' };
    }
  };

  const statusInfo = getStatusInfo();

  // Handle workflow type change
  const handleWorkflowTypeChange = (newType: WorkflowType) => {
    // When switching, clear incompatible prompt data
    if (newType === 'shot') {
      onUpdate({
        workflowType: newType,
        globalCaption: undefined,
        shotCaptions: undefined,
      });
    } else {
      onUpdate({
        workflowType: newType,
        positivePrompt: '',
        negativePrompt: '',
      });
    }
  };

  // Handle generation method change - auto-updates workflow type based on pipeline
  const handleGenerationMethodChange = (newMethod: GenerationMethodId) => {
    const method = getGenerationMethod(newMethod);
    if (!method) {
      onUpdate({ generationMethod: newMethod });
      return;
    }

    // Determine the new workflow type based on pipeline type
    const newWorkflowType: WorkflowType = method.pipelineType === 'scene-based' ? 'scene' : 'shot';

    // If workflow type is changing, also update prompts
    if (newWorkflowType !== shot.workflowType) {
      if (newWorkflowType === 'shot') {
        onUpdate({
          generationMethod: newMethod,
          workflowType: newWorkflowType,
          globalCaption: undefined,
          shotCaptions: undefined,
        });
      } else {
        onUpdate({
          generationMethod: newMethod,
          workflowType: newWorkflowType,
          positivePrompt: '',
          negativePrompt: '',
        });
      }
    } else {
      onUpdate({ generationMethod: newMethod });
    }
  };

  // Handle add shot caption (for scene-based workflow)
  const handleAddShotCaption = () => {
    const currentCaptions = shot.shotCaptions || [];
    const lastCaption = currentCaptions[currentCaptions.length - 1];
    const newStartFrame = lastCaption ? lastCaption.endFrame : 0;
    const newEndFrame = newStartFrame + 30; // Default 30 frames per cut

    onUpdate({
      shotCaptions: [
        ...currentCaptions,
        {
          id: Date.now().toString(),
          prompt: '',
          startFrame: newStartFrame,
          endFrame: newEndFrame,
        },
      ],
    });
  };

  // Handle update shot caption
  const handleUpdateShotCaption = (captionId: string, updates: Partial<ShotCaption>) => {
    const currentCaptions = shot.shotCaptions || [];
    onUpdate({
      shotCaptions: currentCaptions.map((c) =>
        c.id === captionId ? { ...c, ...updates } : c
      ),
    });
  };

  // Handle remove shot caption
  const handleRemoveShotCaption = (captionId: string) => {
    const currentCaptions = shot.shotCaptions || [];
    onUpdate({
      shotCaptions: currentCaptions.filter((c) => c.id !== captionId),
    });
  };

  // Handle queue shot
  const handleQueueShot = () => {
    onQueue();
    setMenuAnchor(null);
  };

  // Handle duplicate shot
  const handleDuplicate = () => {
    // TODO: Implement duplicate
    console.log('Duplicate shot:', shot.id);
    setMenuAnchor(null);
  };

  return (
    <Paper
      sx={{
        mb: 1,
        border: '1px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'action.selected' : 'background.paper',
        transition: 'all 0.2s',
      }}
    >
      {/* Header Row */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1.5,
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Drag Handle */}
        <IconButton size="small" sx={{ cursor: 'grab' }} onClick={(e) => e.stopPropagation()}>
          <DragIndicator fontSize="small" />
        </IconButton>

        {/* Checkbox */}
        <Checkbox
          checked={selected}
          onChange={(e) => {
            e.stopPropagation();
            onSelect(e.target.checked);
          }}
          onClick={(e) => e.stopPropagation()}
          size="small"
        />

        {/* Preview Thumbnail or Placeholder */}
        <Box
          sx={{
            width: 80,
            height: 45,
            bgcolor: 'grey.200',
            borderRadius: 1,
            overflow: 'hidden',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {shot.outputUrl ? (
            <CardMedia
              component="video"
              src={shot.outputUrl}
              sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <Videocam sx={{ color: 'grey.400' }} />
          )}
        </Box>

        {/* Shot Info */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap>
            {shot.title || `Shot ${shot.order + 1}`}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <Chip
              label={shot.workflowType === 'shot' ? 'Shot' : 'Scene'}
              size="small"
              variant="outlined"
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
            <Chip
              label={GENERATION_METHODS.find((m) => m.id === shot.generationMethod)?.name || shot.generationMethod}
              size="small"
              variant="outlined"
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          </Box>
        </Box>

        {/* Status */}
        <Chip
          icon={statusInfo.icon}
          label={statusInfo.label}
          color={statusInfo.color}
          size="small"
        />

        {/* Expand/Collapse */}
        <IconButton size="small">
          {expanded ? <ExpandLess /> : <ExpandMore />}
        </IconButton>

        {/* Menu */}
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            setMenuAnchor(e.currentTarget);
          }}
        >
          <MoreVert />
        </IconButton>
      </Box>

      {/* Expanded Content */}
      <Collapse in={expanded}>
        <Divider />
        <Box sx={{ p: 2 }}>
          {/* Basic Info */}
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField
              label="Title"
              value={shot.title}
              onChange={(e) => onUpdate({ title: e.target.value })}
              size="small"
              sx={{ flex: 1 }}
            />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Workflow</InputLabel>
              <Select
                value={shot.workflowType}
                label="Workflow"
                onChange={(e) => handleWorkflowTypeChange(e.target.value as WorkflowType)}
              >
                <MenuItem value="shot">Shot-based</MenuItem>
                <MenuItem value="scene">Scene-based</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Method</InputLabel>
              <Select
                value={shot.generationMethod}
                label="Method"
                onChange={(e) => handleGenerationMethodChange(e.target.value as GenerationMethodId)}
              >
                {GENERATION_METHODS.map((method) => (
                  <MenuItem key={method.id} value={method.id}>
                    {method.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {/* Prompts - Changes based on workflow type */}
          {shot.workflowType === 'shot' ? (
            // Shot-based prompts
            <Box sx={{ mb: 2 }}>
              <TextField
                label="Positive Prompt"
                value={shot.positivePrompt}
                onChange={(e) => onUpdate({ positivePrompt: e.target.value })}
                multiline
                rows={3}
                fullWidth
                sx={{ mb: 2 }}
                placeholder="Describe what you want to see..."
              />
              <TextField
                label="Negative Prompt"
                value={shot.negativePrompt}
                onChange={(e) => onUpdate({ negativePrompt: e.target.value })}
                multiline
                rows={2}
                fullWidth
                placeholder="Describe what you want to avoid..."
              />
            </Box>
          ) : (
            // Scene-based prompts (HoloCine style)
            <Box sx={{ mb: 2 }}>
              <TextField
                label="Global Caption"
                value={shot.globalCaption || ''}
                onChange={(e) => onUpdate({ globalCaption: e.target.value })}
                multiline
                rows={2}
                fullWidth
                sx={{ mb: 2 }}
                placeholder="Overall scene description..."
              />

              <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                Shot Captions
                <Chip label={shot.shotCaptions?.length || 0} size="small" />
              </Typography>

              {shot.shotCaptions?.map((caption, index) => (
                <Paper key={caption.id} variant="outlined" sx={{ p: 1.5, mb: 1 }}>
                  <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                      Cut {index + 1}
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    <TextField
                      label="Start"
                      type="number"
                      value={caption.startFrame}
                      onChange={(e) =>
                        handleUpdateShotCaption(caption.id, { startFrame: parseInt(e.target.value) || 0 })
                      }
                      size="small"
                      sx={{ width: 80 }}
                      InputProps={{ inputProps: { min: 0 } }}
                    />
                    <TextField
                      label="End"
                      type="number"
                      value={caption.endFrame}
                      onChange={(e) =>
                        handleUpdateShotCaption(caption.id, { endFrame: parseInt(e.target.value) || 0 })
                      }
                      size="small"
                      sx={{ width: 80 }}
                      InputProps={{ inputProps: { min: 0 } }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => handleRemoveShotCaption(caption.id)}
                      color="error"
                    >
                      <Remove fontSize="small" />
                    </IconButton>
                  </Box>
                  <TextField
                    value={caption.prompt}
                    onChange={(e) => handleUpdateShotCaption(caption.id, { prompt: e.target.value })}
                    multiline
                    rows={2}
                    fullWidth
                    size="small"
                    placeholder="Describe this cut..."
                  />
                </Paper>
              ))}

              <Button
                size="small"
                startIcon={<Add />}
                onClick={handleAddShotCaption}
                variant="outlined"
              >
                Add Cut
              </Button>
            </Box>
          )}

          {/* Advanced Settings */}
          <Box sx={{ mb: 2 }}>
            <Button
              size="small"
              startIcon={<Settings />}
              onClick={() => setShowAdvanced(!showAdvanced)}
              sx={{ mb: 1 }}
            >
              {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
            </Button>

            <Collapse in={showAdvanced}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                  <TextField
                    label="Frames"
                    type="number"
                    value={shot.settings.numFrames}
                    onChange={(e) =>
                      onUpdate({
                        settings: { ...shot.settings, numFrames: parseInt(e.target.value) || defaultSettings.numFrames },
                      })
                    }
                    size="small"
                    sx={{ width: 100 }}
                  />
                  <TextField
                    label="FPS"
                    type="number"
                    value={shot.settings.fps}
                    onChange={(e) =>
                      onUpdate({
                        settings: { ...shot.settings, fps: parseInt(e.target.value) || defaultSettings.fps },
                      })
                    }
                    size="small"
                    sx={{ width: 80 }}
                  />
                  <TextField
                    label="Steps"
                    type="number"
                    value={shot.settings.steps || defaultSettings.steps}
                    onChange={(e) =>
                      onUpdate({
                        settings: { ...shot.settings, steps: parseInt(e.target.value) || undefined },
                      })
                    }
                    size="small"
                    sx={{ width: 80 }}
                  />
                  <TextField
                    label="CFG"
                    type="number"
                    value={shot.settings.cfg || defaultSettings.cfg}
                    onChange={(e) =>
                      onUpdate({
                        settings: { ...shot.settings, cfg: parseFloat(e.target.value) || undefined },
                      })
                    }
                    size="small"
                    sx={{ width: 80 }}
                  />
                  <TextField
                    label="Seed"
                    type="number"
                    value={shot.settings.seed || ''}
                    onChange={(e) =>
                      onUpdate({
                        settings: { ...shot.settings, seed: e.target.value ? parseInt(e.target.value) : undefined },
                      })
                    }
                    size="small"
                    sx={{ width: 120 }}
                    placeholder="Random"
                  />
                  <FormControl size="small" sx={{ minWidth: 150 }}>
                    <InputLabel>Resolution</InputLabel>
                    <Select
                      value={shot.settings.resolution}
                      label="Resolution"
                      onChange={(e) =>
                        onUpdate({
                          settings: { ...shot.settings, resolution: e.target.value },
                        })
                      }
                    >
                      <MenuItem value="1280x720">1280x720</MenuItem>
                      <MenuItem value="1920x1080">1920x1080</MenuItem>
                      <MenuItem value="854x480">854x480</MenuItem>
                      <MenuItem value="512x512">512x512</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
                <Button
                  size="small"
                  sx={{ mt: 2 }}
                  onClick={() =>
                    onUpdate({
                      settings: { ...defaultSettings },
                    })
                  }
                >
                  Reset to Defaults
                </Button>
              </Paper>
            </Collapse>
          </Box>

          {/* Render Preview */}
          {shot.outputUrl && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Rendered Output
              </Typography>
              <Card sx={{ maxWidth: 400 }}>
                <CardMedia
                  component="video"
                  src={shot.outputUrl}
                  controls
                  sx={{ width: '100%' }}
                />
              </Card>
            </Box>
          )}

          {/* Error message */}
          {shot.renderStatus === 'failed' && shot.renderJobId && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Render failed. Check the render queue for details.
            </Alert>
          )}

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button
              variant="outlined"
              color="error"
              startIcon={<Delete />}
              onClick={onDelete}
              size="small"
            >
              Delete
            </Button>
            <Button
              variant="contained"
              startIcon={<PlayArrow />}
              onClick={handleQueueShot}
              disabled={shot.renderStatus === 'queued' || shot.renderStatus === 'rendering'}
              size="small"
            >
              {shot.renderStatus === 'completed' ? 'Re-render' : 'Queue'}
            </Button>
          </Box>
        </Box>
      </Collapse>

      {/* Context Menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={handleQueueShot}>
          <ListItemIcon>
            <PlayArrow fontSize="small" />
          </ListItemIcon>
          <ListItemText>Queue for Render</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleDuplicate}>
          <ListItemIcon>
            <ContentCopy fontSize="small" />
          </ListItemIcon>
          <ListItemText>Duplicate</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => onMoveToGroup(undefined)} disabled={!shot.groupId}>
          <ListItemIcon>
            <Folder fontSize="small" />
          </ListItemIcon>
          <ListItemText>Remove from Group</ListItemText>
        </MenuItem>
        {availableGroups.map((group) => (
          <MenuItem
            key={group.id}
            onClick={() => {
              onMoveToGroup(group.id);
              setMenuAnchor(null);
            }}
            disabled={shot.groupId === group.id}
          >
            <ListItemIcon>
              <Folder fontSize="small" sx={{ color: group.color }} />
            </ListItemIcon>
            <ListItemText>Move to {group.name}</ListItemText>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem
          onClick={() => {
            onDelete();
            setMenuAnchor(null);
          }}
        >
          <ListItemIcon>
            <Delete fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>Delete</ListItemText>
        </MenuItem>
      </Menu>
    </Paper>
  );
};

export default ShotItem;
