import React, { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Paper,
  Chip,
  IconButton,
  LinearProgress,
  Collapse,
  List,
  ListItem,
  ListItemText,
  Button,
  Divider,
  Badge,
  Skeleton,
  Tooltip,
  alpha,
  Menu,
  MenuItem,
  ListItemIcon,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  Snackbar,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import {
  ExpandMore,
  Videocam,
  Person,
  LocationOn,
  MusicNote,
  RecordVoiceOver,
  Palette,
  CheckCircle,
  Pending,
  Error as ErrorIcon,
  Refresh,
  Edit,
  Preview,
  Image as ImageIcon,
  HourglassEmpty,
  Movie,
  ContentCopy,
  Queue as QueueIcon,
  Settings as SettingsIcon,
  MoreVert,
  VideoLibrary,
  Cancel,
  Add as AddIcon,
  AutoAwesome as GenerateIcon,
} from '@mui/icons-material';
import { EnhancedStory, EnhancedShot } from '../../types/storyTypes';
import { useStore, RenderJob } from '../../store/useStore';
import { renderQueueManager } from '../../services/renderQueueManager';
import { manualModeAiService } from '../../services/manualModeAiService';

interface ShotlistTabProps {
  storyData: EnhancedStory | null;
  storyId?: string;
  isManualMode?: boolean;
  onUpdateShot: (shotId: string, updates: Partial<EnhancedShot>) => void;
  onAddShot?: (shot: Partial<EnhancedShot>) => void;
  onGenerateAllPrompts?: () => void;
}

// Extended shot type to include part information
interface ExtendedShot extends EnhancedShot {
  partNumber?: number;
  partTitle?: string;
}

const ShotlistTab: React.FC<ShotlistTabProps> = ({
  storyData,
  storyId,
  isManualMode = false,
  onUpdateShot,
  onAddShot,
  onGenerateAllPrompts,
}) => {
  const [expandedShot, setExpandedShot] = useState<string | null>(null);
  const [selectedShot, setSelectedShot] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);
  const [actionMenuAnchor, setActionMenuAnchor] = useState<{ anchor: HTMLElement | null; shotId: string | null }>({ anchor: null, shotId: null });

  // Manual mode states
  const [addShotDialogOpen, setAddShotDialogOpen] = useState(false);
  const [editShotDialogOpen, setEditShotDialogOpen] = useState(false);
  const [editingShot, setEditingShot] = useState<EnhancedShot | null>(null);
  const [newShot, setNewShot] = useState<Partial<EnhancedShot>>({
    description: '',
    shotType: 'medium',
    angle: 'eye-level',
    duration: 3,
    cameraMovement: 'static',
  });
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState<string | null>(null);
  const [isGeneratingAllPrompts, setIsGeneratingAllPrompts] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success'
  });

  // Get render queue from store
  const { renderQueue, removeRenderJob } = useStore();

  // Get render jobs for this story
  const storyRenderJobs = useMemo(() => {
    if (!storyId) return [];
    return renderQueue.filter(job => job.storyId === storyId);
  }, [renderQueue, storyId]);

  // Create a map of shot ID to render job for quick lookup
  const shotRenderJobMap = useMemo(() => {
    const map = new Map<string, RenderJob>();
    storyRenderJobs.forEach(job => {
      if (job.targetId) {
        map.set(job.targetId, job);
      }
    });
    return map;
  }, [storyRenderJobs]);

  // Get render job status for a shot
  const getRenderJobForShot = useCallback((shotId: string): RenderJob | undefined => {
    return shotRenderJobMap.get(shotId);
  }, [shotRenderJobMap]);

  // Add shot to render queue
  const handleAddToRenderQueue = (shot: EnhancedShot) => {
    if (!storyId || !storyData) return;

    // Get generation method from story
    const generationMethod = (storyData as any).generationMethod || 'wan22';

    const config = {
      generationMethod,
      aspectRatio: '16:9',
      fps: '24',
    };

    renderQueueManager.createJobFromShot(storyId, {
      id: shot.id,
      shotNumber: shot.shotNumber,
      title: shot.title,
      visualPrompt: shot.visualPrompt,
      comfyUIPositivePrompt: shot.comfyUIPositivePrompt,
      comfyUINegativePrompt: shot.comfyUINegativePrompt,
      duration: shot.duration,
    }, config as any);
  };

  // Retry a failed render job
  const handleRetryRender = (shot: EnhancedShot) => {
    const existingJob = getRenderJobForShot(shot.id);
    if (existingJob) {
      // Remove the failed job
      removeRenderJob(existingJob.id);
    }
    // Add back to queue
    handleAddToRenderQueue(shot);
  };

  // Cancel/remove a render job
  const handleCancelRender = (shotId: string) => {
    const job = getRenderJobForShot(shotId);
    if (job) {
      removeRenderJob(job.id);
    }
  };

  // Add all shots to render queue
  const handleAddAllToQueue = () => {
    if (!storyData || !storyId) return;

    storyData.shots.forEach(shot => {
      if (shot.comfyUIPositivePrompt && !getRenderJobForShot(shot.id)) {
        handleAddToRenderQueue(shot);
      }
    });
  };

  // Action menu handlers
  const handleActionMenuOpen = (event: React.MouseEvent<HTMLElement>, shotId: string) => {
    event.stopPropagation();
    setActionMenuAnchor({ anchor: event.currentTarget, shotId });
  };

  const handleActionMenuClose = () => {
    setActionMenuAnchor({ anchor: null, shotId: null });
  };

  // Manual mode: Add new shot
  const handleAddShot = () => {
    if (!newShot.description?.trim()) {
      setSnackbar({ open: true, message: 'Shot description is required', severity: 'error' });
      return;
    }
    if (onAddShot) {
      onAddShot({
        ...newShot,
        shotNumber: (storyData?.shots?.length || 0) + 1,
        characters: [],
        locations: [],
      });
      setNewShot({
        description: '',
        shotType: 'medium',
        angle: 'eye-level',
        duration: 3,
        cameraMovement: 'static',
      });
      setAddShotDialogOpen(false);
      setSnackbar({ open: true, message: 'Shot added successfully', severity: 'success' });
    }
  };

  // Manual mode: Open edit dialog for a shot
  const handleOpenEditShot = (shot: EnhancedShot) => {
    setEditingShot({ ...shot });
    setEditShotDialogOpen(true);
    handleActionMenuClose();
  };

  // Manual mode: Save edited shot
  const handleSaveEditedShot = () => {
    if (editingShot) {
      onUpdateShot(editingShot.id, editingShot);
      setEditShotDialogOpen(false);
      setEditingShot(null);
      setSnackbar({ open: true, message: 'Shot updated successfully', severity: 'success' });
    }
  };

  // Manual mode: Generate visual prompt for a single shot
  const handleGeneratePromptForShot = async (shot: EnhancedShot) => {
    setIsGeneratingPrompt(shot.id);
    handleActionMenuClose();

    try {
      const result = await manualModeAiService.generateComfyUIPrompt(
        shot.description,
        shot.characters,
        storyData?.genre
      );

      if (result.success) {
        onUpdateShot(shot.id, {
          comfyUIPositivePrompt: result.text,
          visualPrompt: result.text,
        });
        setSnackbar({ open: true, message: 'Prompt generated successfully', severity: 'success' });
      } else {
        setSnackbar({ open: true, message: result.error || 'Failed to generate prompt', severity: 'error' });
      }
    } catch (error: any) {
      setSnackbar({ open: true, message: error.message || 'Failed to generate prompt', severity: 'error' });
    } finally {
      setIsGeneratingPrompt(null);
    }
  };

  // Manual mode: Generate prompts for all shots
  const handleGenerateAllPrompts = async () => {
    if (!storyData?.shots?.length) return;

    setIsGeneratingAllPrompts(true);
    let successCount = 0;
    let failCount = 0;

    for (const shot of storyData.shots) {
      if (!shot.comfyUIPositivePrompt) {
        try {
          const result = await manualModeAiService.generateComfyUIPrompt(
            shot.description,
            shot.characters,
            storyData?.genre
          );

          if (result.success) {
            onUpdateShot(shot.id, {
              comfyUIPositivePrompt: result.text,
              visualPrompt: result.text,
            });
            successCount++;
          } else {
            failCount++;
          }
        } catch {
          failCount++;
        }
      }
    }

    setIsGeneratingAllPrompts(false);
    setSnackbar({
      open: true,
      message: `Generated ${successCount} prompts${failCount > 0 ? `, ${failCount} failed` : ''}`,
      severity: failCount > 0 ? 'error' : 'success'
    });
  };

  // Calculate render queue stats - must be before early return for hooks rules
  const renderQueueStats = useMemo(() => {
    if (!storyData) {
      return { inQueue: 0, queued: 0, rendering: 0, completed: 0, failed: 0, notInQueue: 0 };
    }
    const inQueue = storyRenderJobs.length;
    const queued = storyRenderJobs.filter(j => j.status === 'queued').length;
    const rendering = storyRenderJobs.filter(j => j.status === 'rendering' || j.status === 'assigned').length;
    const completed = storyRenderJobs.filter(j => j.status === 'completed').length;
    const failed = storyRenderJobs.filter(j => j.status === 'failed').length;
    const notInQueue = storyData.shots.filter(s => s.comfyUIPositivePrompt && !getRenderJobForShot(s.id)).length;

    return { inQueue, queued, rendering, completed, failed, notInQueue };
  }, [storyRenderJobs, storyData, getRenderJobForShot]);

  if (!storyData) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          No story data available
        </Typography>
      </Box>
    );
  }

  const handleShotExpand = (shotId: string) => {
    setExpandedShot(expandedShot === shotId ? null : shotId);
  };

  // Get combined render status (from shot or render queue)
  const getCombinedRenderStatus = (shot: EnhancedShot): {
    status: string;
    color: 'success' | 'primary' | 'warning' | 'error' | 'default' | 'info';
    icon: React.ReactNode;
    label: string;
    progress?: number;
    inQueue: boolean;
  } => {
    const renderJob = getRenderJobForShot(shot.id);

    if (renderJob) {
      switch (renderJob.status) {
        case 'completed':
          return {
            status: 'completed',
            color: 'success',
            icon: <CheckCircle fontSize="small" />,
            label: 'Rendered',
            inQueue: true,
          };
        case 'rendering':
          return {
            status: 'rendering',
            color: 'primary',
            icon: <Movie fontSize="small" />,
            label: `Rendering ${renderJob.progress || 0}%`,
            progress: renderJob.progress,
            inQueue: true,
          };
        case 'assigned':
          return {
            status: 'assigned',
            color: 'info',
            icon: <VideoLibrary fontSize="small" />,
            label: 'Assigned to Node',
            inQueue: true,
          };
        case 'queued':
          return {
            status: 'queued',
            color: 'warning',
            icon: <QueueIcon fontSize="small" />,
            label: 'In Queue',
            inQueue: true,
          };
        case 'failed':
          return {
            status: 'failed',
            color: 'error',
            icon: <ErrorIcon fontSize="small" />,
            label: 'Failed',
            inQueue: true,
          };
        default:
          return {
            status: renderJob.status,
            color: 'default',
            icon: <Pending fontSize="small" />,
            label: renderJob.status,
            inQueue: true,
          };
      }
    }

    // No render job - check if prompt is ready
    if (shot.comfyUIPositivePrompt) {
      return {
        status: 'ready',
        color: 'default',
        icon: <ImageIcon fontSize="small" />,
        label: 'Ready to Queue',
        inQueue: false,
      };
    }

    return {
      status: 'pending',
      color: 'default',
      icon: <HourglassEmpty fontSize="small" />,
      label: 'Awaiting Prompt',
      inQueue: false,
    };
  };

  const handleCopyPrompt = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPrompt(type);
    setTimeout(() => setCopiedPrompt(null), 2000);
  };

  const calculateProgress = () => {
    if (storyData.shots.length === 0) return 0;
    // Use render queue status for progress
    const completedShots = storyData.shots.filter(s => {
      const job = getRenderJobForShot(s.id);
      return job?.status === 'completed';
    }).length;
    return (completedShots / storyData.shots.length) * 100;
  };

  // Group shots by part
  const getPartInfo = (shot: ExtendedShot) => {
    // Check for part info in the shot (extended fields)
    const partNumber = (shot as any).partNumber || (shot as any).part_number;
    const partTitle = (shot as any).partTitle || (shot as any).part_title;
    return { partNumber, partTitle };
  };

  // Render preview placeholder component
  const RenderPreview: React.FC<{ shot: EnhancedShot; aspectRatio?: string }> = ({
    shot,
    aspectRatio = '16/9'
  }) => {
    const hasRender = shot.renderStatus === 'completed' && shot.renderUrl;
    const isRendering = shot.renderStatus === 'rendering';
    const hasPendingPrompts = !shot.comfyUIPositivePrompt;

    return (
      <Box
        sx={{
          width: '100%',
          aspectRatio,
          borderRadius: 2,
          overflow: 'hidden',
          position: 'relative',
          backgroundColor: theme => alpha(theme.palette.background.default, 0.5),
          border: '2px dashed',
          borderColor: theme => hasRender
            ? 'success.main'
            : isRendering
              ? 'primary.main'
              : 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          transition: 'all 0.3s ease',
        }}
      >
        {hasRender ? (
          // Show rendered image/video
          <Box
            component="img"
            src={shot.renderUrl}
            alt={`Shot ${shot.shotNumber} render`}
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : isRendering ? (
          // Show rendering progress
          <>
            <Movie sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
            <Typography variant="body2" color="primary.main" fontWeight="medium">
              Rendering...
            </Typography>
            <LinearProgress
              sx={{ width: '60%', mt: 1, borderRadius: 1 }}
            />
          </>
        ) : hasPendingPrompts ? (
          // Show waiting for prompts
          <>
            <HourglassEmpty sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              Awaiting prompts...
            </Typography>
            <Typography variant="caption" color="text.disabled">
              Prompts will be generated
            </Typography>
          </>
        ) : (
          // Ready to render
          <>
            <ImageIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              Ready to render
            </Typography>
            <Typography variant="caption" color="text.disabled">
              {aspectRatio} • Shot {shot.shotNumber}
            </Typography>
          </>
        )}
      </Box>
    );
  };

  // Prompt display component with pending state
  const PromptDisplay: React.FC<{
    label: string;
    prompt: string | undefined;
    type: 'positive' | 'negative' | 'base';
    shotId: string;
  }> = ({ label, prompt, type, shotId }) => {
    const isPending = !prompt;
    const colorMap = {
      positive: { bg: 'success', border: 'success' },
      negative: { bg: 'error', border: 'error' },
      base: { bg: 'grey', border: 'grey' },
    };
    const colors = colorMap[type];

    return (
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography
            variant="caption"
            sx={{
              color: isPending ? 'text.disabled' : `${colors.bg}.main`,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            {type === 'positive' && '✓'}
            {type === 'negative' && '✗'}
            {label}
            {isPending && (
              <Chip
                size="small"
                label="Pending"
                sx={{
                  ml: 1,
                  height: 18,
                  fontSize: '0.65rem',
                  backgroundColor: theme => alpha(theme.palette.warning.main, 0.1),
                  color: 'warning.main',
                }}
              />
            )}
          </Typography>
          {!isPending && (
            <Tooltip title={copiedPrompt === `${shotId}-${type}` ? 'Copied!' : 'Copy'}>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyPrompt(prompt!, `${shotId}-${type}`);
                }}
                sx={{ p: 0.5 }}
              >
                <ContentCopy fontSize="small" sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        <Paper
          sx={{
            p: 2,
            backgroundColor: theme => isPending
              ? alpha(theme.palette.action.disabled, 0.05)
              : type === 'positive'
                ? alpha(theme.palette.success.main, 0.08)
                : type === 'negative'
                  ? alpha(theme.palette.error.main, 0.08)
                  : alpha(theme.palette.grey[500], 0.08),
            border: '1px solid',
            borderColor: theme => isPending
              ? theme.palette.divider
              : type === 'positive'
                ? alpha(theme.palette.success.main, 0.3)
                : type === 'negative'
                  ? alpha(theme.palette.error.main, 0.3)
                  : alpha(theme.palette.grey[500], 0.3),
            borderStyle: isPending ? 'dashed' : 'solid',
            minHeight: 60,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {isPending ? (
            <Box sx={{ width: '100%' }}>
              <Skeleton variant="text" width="90%" />
              <Skeleton variant="text" width="75%" />
              <Skeleton variant="text" width="60%" />
            </Box>
          ) : (
            <Typography
              variant="body2"
              sx={{
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                lineHeight: 1.5,
                wordBreak: 'break-word',
              }}
            >
              {prompt}
            </Typography>
          )}
        </Paper>
      </Box>
    );
  };

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      {/* Manual Mode Banner */}
      {isManualMode && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2">
            <strong>Manual Mode:</strong> Add and edit shots manually. Use AI to generate visual prompts for rendering.
          </Typography>
        </Alert>
      )}

      {/* Shotlist Overview */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Master Shotlist</Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="body2" color="text.secondary">
                {storyData.shots.length} shots
              </Typography>
              {isManualMode && onAddShot && (
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setAddShotDialogOpen(true)}
                >
                  Add Shot
                </Button>
              )}
              {isManualMode && storyData.shots.some(s => !s.comfyUIPositivePrompt) && (
                <Button
                  size="small"
                  variant="outlined"
                  color="secondary"
                  startIcon={isGeneratingAllPrompts ? <CircularProgress size={16} /> : <GenerateIcon />}
                  onClick={handleGenerateAllPrompts}
                  disabled={isGeneratingAllPrompts}
                >
                  Generate All Prompts
                </Button>
              )}
              <Button size="small" startIcon={<Refresh />}>
                Regenerate
              </Button>
            </Box>
          </Box>

          {/* Progress Overview */}
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="body2">Rendering Progress</Typography>
              <Typography variant="body2" fontWeight="bold">
                {Math.round(calculateProgress())}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={calculateProgress()}
              sx={{ height: 6, borderRadius: 3 }}
            />
          </Box>

          {/* Quick Stats - Using Render Queue */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 2 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" color="success.main">
                  {renderQueueStats.completed}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Rendered
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 2 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" color="primary.main">
                  {renderQueueStats.rendering}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Rendering
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 2 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" color="warning.main">
                  {renderQueueStats.queued}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  In Queue
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 2 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" color="text.secondary">
                  {renderQueueStats.notInQueue}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Not Queued
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 2 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" color="error.main">
                  {renderQueueStats.failed}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Failed
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 2 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" color="text.primary">
                  {storyData.shots.length}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Total Shots
                </Typography>
              </Box>
            </Grid>
          </Grid>

          {/* Add All to Queue Button */}
          {renderQueueStats.notInQueue > 0 && (
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
              <Button
                variant="contained"
                color="primary"
                startIcon={<QueueIcon />}
                onClick={handleAddAllToQueue}
              >
                Add {renderQueueStats.notInQueue} Shot{renderQueueStats.notInQueue !== 1 ? 's' : ''} to Render Queue
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Shot List */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {storyData.shots.map((shot, index) => {
          const extendedShot = shot as ExtendedShot;
          const { partNumber, partTitle } = getPartInfo(extendedShot);
          const prevShot = index > 0 ? storyData.shots[index - 1] as ExtendedShot : null;
          const prevPartNumber = prevShot ? getPartInfo(prevShot).partNumber : null;
          const isNewPart = partNumber && partNumber !== prevPartNumber;

          return (
            <React.Fragment key={shot.id}>
              {/* Part Header - show when entering a new part */}
              {isNewPart && (
                <Paper
                  sx={{
                    p: 2,
                    backgroundColor: theme => alpha(theme.palette.primary.main, 0.08),
                    border: '1px solid',
                    borderColor: theme => alpha(theme.palette.primary.main, 0.2),
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                  }}
                >
                  <Chip
                    label={`Part ${partNumber}`}
                    color="primary"
                    size="small"
                    sx={{ fontWeight: 'bold' }}
                  />
                  <Typography variant="subtitle1" fontWeight="medium">
                    {partTitle || `Part ${partNumber}`}
                  </Typography>
                </Paper>
              )}

              <Card
                sx={{
                  border: selectedShot === shot.id ? 2 : 1,
                  borderColor: selectedShot === shot.id ? 'primary.main' : 'divider',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  '&:hover': {
                    boxShadow: 3,
                  }
                }}
                onClick={() => setSelectedShot(selectedShot === shot.id ? null : shot.id)}
              >
                <CardContent sx={{ pb: 2 }}>
                  {/* Shot Header */}
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                      {/* Render Preview Thumbnail */}
                      <Box sx={{ width: 120, flexShrink: 0 }}>
                        <RenderPreview shot={shot} aspectRatio="16/9" />
                      </Box>

                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <Badge
                            badgeContent={shot.shotNumber}
                            color="primary"
                            sx={{
                              '& .MuiBadge-badge': {
                                fontSize: '0.75rem',
                                minWidth: '20px',
                                height: '20px',
                                borderRadius: '10px'
                              }
                            }}
                          >
                            <Videocam color="primary" />
                          </Badge>
                          <Typography variant="h6">
                            {shot.title || `Shot ${shot.shotNumber}`}
                          </Typography>
                          {partNumber && (
                            <Chip
                              size="small"
                              label={`Part ${partNumber}`}
                              variant="outlined"
                              sx={{ height: 20, fontSize: '0.7rem' }}
                            />
                          )}
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          {shot.duration}s • {shot.shotType} • {shot.angle}
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 1, lineHeight: 1.5 }}>
                          {shot.description.length > 150
                            ? shot.description.substring(0, 150) + '...'
                            : shot.description}
                        </Typography>
                      </Box>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {/* Render Queue Status Chip */}
                      {(() => {
                        const renderStatus = getCombinedRenderStatus(shot);
                        return (
                          <Tooltip title={renderStatus.inQueue ? 'In render queue' : 'Not in render queue'}>
                            <Chip
                              size="small"
                              label={renderStatus.label}
                              color={renderStatus.color}
                              icon={renderStatus.icon as React.ReactElement}
                              sx={{
                                minWidth: 100,
                                '& .MuiChip-icon': { fontSize: 16 }
                              }}
                            />
                          </Tooltip>
                        );
                      })()}

                      {/* Action Menu Button */}
                      <IconButton
                        size="small"
                        onClick={(e) => handleActionMenuOpen(e, shot.id)}
                      >
                        <MoreVert fontSize="small" />
                      </IconButton>

                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShotExpand(shot.id);
                        }}
                      >
                        <ExpandMore
                          sx={{
                            transform: expandedShot === shot.id ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s'
                          }}
                        />
                      </IconButton>
                    </Box>
                  </Box>

                  {/* Quick Info Chips */}
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                    {shot.characters.length > 0 && (
                      <Chip
                        size="small"
                        icon={<Person />}
                        label={`${shot.characters.length} characters`}
                        variant="outlined"
                      />
                    )}
                    {shot.locations.length > 0 && (
                      <Chip
                        size="small"
                        icon={<LocationOn />}
                        label={`${shot.locations.length} locations`}
                        variant="outlined"
                      />
                    )}
                    {shot.narration && (
                      <Chip
                        size="small"
                        icon={<RecordVoiceOver />}
                        label="Narration"
                        variant="outlined"
                      />
                    )}
                    {shot.musicCue && (
                      <Chip
                        size="small"
                        icon={<MusicNote />}
                        label="Music"
                        variant="outlined"
                      />
                    )}
                    {shot.comfyUIPositivePrompt ? (
                      <Chip
                        size="small"
                        icon={<Palette />}
                        label="Prompts Ready"
                        variant="filled"
                        color="success"
                      />
                    ) : (
                      <Chip
                        size="small"
                        icon={<HourglassEmpty />}
                        label="Prompts Pending"
                        variant="outlined"
                        color="warning"
                      />
                    )}
                  </Box>

                  {/* Expanded Details */}
                  <Collapse in={expandedShot === shot.id}>
                    <Divider sx={{ my: 2 }} />
                    <Grid container spacing={3}>
                      {/* Render Preview - Larger in expanded view */}
                      <Grid size={{ xs: 12, md: 5 }}>
                        <Typography variant="subtitle2" gutterBottom>
                          Render Preview
                        </Typography>
                        <RenderPreview shot={shot} aspectRatio="16/9" />
                        {/* Action Buttons Based on Render Queue Status */}
                        {(() => {
                          const renderStatus = getCombinedRenderStatus(shot);
                          const renderJob = getRenderJobForShot(shot.id);
                          return (
                            <Box sx={{ mt: 1, display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
                              {/* Not in queue - Add to queue */}
                              {!renderStatus.inQueue && shot.comfyUIPositivePrompt && (
                                <Button
                                  size="small"
                                  variant="contained"
                                  color="primary"
                                  startIcon={<QueueIcon />}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAddToRenderQueue(shot);
                                  }}
                                >
                                  Add to Queue
                                </Button>
                              )}

                              {/* Queued - Cancel option */}
                              {renderJob?.status === 'queued' && (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="warning"
                                  startIcon={<Cancel />}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCancelRender(shot.id);
                                  }}
                                >
                                  Remove from Queue
                                </Button>
                              )}

                              {/* Rendering - Show progress */}
                              {(renderJob?.status === 'rendering' || renderJob?.status === 'assigned') && (
                                <Chip
                                  label={`Rendering ${renderJob.progress || 0}%`}
                                  color="primary"
                                  icon={<Movie />}
                                />
                              )}

                              {/* Completed - Preview and re-render options */}
                              {renderJob?.status === 'completed' && (
                                <>
                                  {renderJob.outputUrl && (
                                    <Button size="small" variant="outlined" startIcon={<Preview />}>
                                      Full Preview
                                    </Button>
                                  )}
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<Refresh />}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRetryRender(shot);
                                    }}
                                  >
                                    Re-render
                                  </Button>
                                </>
                              )}

                              {/* Failed - Retry option */}
                              {renderJob?.status === 'failed' && (
                                <>
                                  <Tooltip title={renderJob.error || 'Unknown error'}>
                                    <Chip
                                      label="Failed"
                                      color="error"
                                      icon={<ErrorIcon />}
                                      size="small"
                                    />
                                  </Tooltip>
                                  <Button
                                    size="small"
                                    variant="contained"
                                    color="error"
                                    startIcon={<Refresh />}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRetryRender(shot);
                                    }}
                                  >
                                    Retry
                                  </Button>
                                </>
                              )}

                              {/* No prompt yet */}
                              {!shot.comfyUIPositivePrompt && (
                                <Chip
                                  label="Awaiting prompt generation"
                                  color="default"
                                  icon={<HourglassEmpty />}
                                  size="small"
                                />
                              )}
                            </Box>
                          );
                        })()}
                      </Grid>

                      {/* Prompts Section */}
                      <Grid size={{ xs: 12, md: 7 }}>
                        <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Palette fontSize="small" />
                          AI Generation Prompts
                        </Typography>

                        <PromptDisplay
                          label="Positive Prompt (ComfyUI)"
                          prompt={shot.comfyUIPositivePrompt}
                          type="positive"
                          shotId={shot.id}
                        />

                        <PromptDisplay
                          label="Negative Prompt (ComfyUI)"
                          prompt={shot.comfyUINegativePrompt}
                          type="negative"
                          shotId={shot.id}
                        />

                        {shot.visualPrompt && (
                          <PromptDisplay
                            label="Base Visual Prompt"
                            prompt={shot.visualPrompt}
                            type="base"
                            shotId={shot.id}
                          />
                        )}
                      </Grid>

                      {/* Technical Details */}
                      <Grid size={{ xs: 12, md: 6 }}>
                        <Typography variant="subtitle2" gutterBottom>
                          Technical Details
                        </Typography>
                        <List dense>
                          <ListItem>
                            <ListItemText
                              primary="Camera Movement"
                              secondary={shot.cameraMovement || 'Static'}
                            />
                          </ListItem>
                          <ListItem>
                            <ListItemText
                              primary="Shot Type"
                              secondary={shot.shotType}
                            />
                          </ListItem>
                          <ListItem>
                            <ListItemText
                              primary="Angle"
                              secondary={shot.angle}
                            />
                          </ListItem>
                          <ListItem>
                            <ListItemText
                              primary="Duration"
                              secondary={`${shot.duration} seconds`}
                            />
                          </ListItem>
                        </List>
                      </Grid>

                      {/* Characters & Locations */}
                      <Grid size={{ xs: 12, md: 6 }}>
                        <Typography variant="subtitle2" gutterBottom>
                          Scene Elements
                        </Typography>
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            Characters:
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {shot.characters.length > 0 ? (
                              shot.characters.map(char => (
                                <Chip key={char} size="small" label={char} />
                              ))
                            ) : (
                              <Typography variant="caption" color="text.secondary">
                                None specified
                              </Typography>
                            )}
                          </Box>
                        </Box>
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            Locations:
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {shot.locations.length > 0 ? (
                              shot.locations.map(loc => (
                                <Chip key={loc} size="small" label={loc} />
                              ))
                            ) : (
                              <Typography variant="caption" color="text.secondary">
                                None specified
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </Grid>

                      {/* Audio Elements */}
                      {(shot.narration || shot.musicCue || (shot.dialogue && shot.dialogue.length > 0)) && (
                        <Grid size={{ xs: 12 }}>
                          <Typography variant="subtitle2" gutterBottom>
                            Audio Elements
                          </Typography>

                          {shot.narration && (
                            <Box sx={{ mb: 2 }}>
                              <Typography variant="body2" color="text.secondary" gutterBottom>
                                Narration:
                              </Typography>
                              <Paper sx={{ p: 2, backgroundColor: theme => alpha(theme.palette.primary.main, 0.05) }}>
                                <Typography variant="body2">
                                  {shot.narration}
                                </Typography>
                              </Paper>
                            </Box>
                          )}

                          {shot.dialogue && shot.dialogue.length > 0 && (
                            <Box sx={{ mb: 2 }}>
                              <Typography variant="body2" color="text.secondary" gutterBottom>
                                Dialogue:
                              </Typography>
                              {shot.dialogue.map((line, i) => (
                                <Paper key={i} sx={{ p: 1.5, mb: 1, backgroundColor: theme => alpha(theme.palette.secondary.main, 0.05) }}>
                                  <Typography variant="body2">
                                    <strong>{line.character}:</strong> {line.text}
                                  </Typography>
                                </Paper>
                              ))}
                            </Box>
                          )}

                          {shot.musicCue && (
                            <Box>
                              <Typography variant="body2" color="text.secondary" gutterBottom>
                                Music Cue:
                              </Typography>
                              <Chip label={shot.musicCue} icon={<MusicNote />} />
                            </Box>
                          )}
                        </Grid>
                      )}

                      {/* Action Buttons */}
                      <Grid size={{ xs: 12 }}>
                        <Divider sx={{ mb: 2 }} />
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <Button size="small" startIcon={<Palette />}>
                            Edit Prompts
                          </Button>
                          {shot.comfyUIPositivePrompt && (
                            <Button
                              size="small"
                              variant="outlined"
                              color="success"
                              startIcon={<ContentCopy />}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyPrompt(shot.comfyUIPositivePrompt || '', `${shot.id}-pos-btn`);
                              }}
                            >
                              {copiedPrompt === `${shot.id}-pos-btn` ? 'Copied!' : 'Copy Positive'}
                            </Button>
                          )}
                          {shot.comfyUINegativePrompt && (
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              startIcon={<ContentCopy />}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyPrompt(shot.comfyUINegativePrompt || '', `${shot.id}-neg-btn`);
                              }}
                            >
                              {copiedPrompt === `${shot.id}-neg-btn` ? 'Copied!' : 'Copy Negative'}
                            </Button>
                          )}
                        </Box>
                      </Grid>
                    </Grid>
                  </Collapse>
                </CardContent>
              </Card>
            </React.Fragment>
          );
        })}
      </Box>

      {storyData.shots.length === 0 && (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <Videocam sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No shots available
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Shots will appear here once the story has been analyzed and broken down.
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Shot Action Menu */}
      <Menu
        anchorEl={actionMenuAnchor.anchor}
        open={Boolean(actionMenuAnchor.anchor)}
        onClose={handleActionMenuClose}
        onClick={handleActionMenuClose}
      >
        {actionMenuAnchor.shotId && (() => {
          const shot = storyData.shots.find(s => s.id === actionMenuAnchor.shotId);
          if (!shot) return null;
          const renderJob = getRenderJobForShot(shot.id);
          const hasPrompt = !!shot.comfyUIPositivePrompt;

          return (
            <>
              {/* Add to Queue - only if has prompt and not in queue */}
              {hasPrompt && !renderJob && (
                <MenuItem onClick={() => handleAddToRenderQueue(shot)}>
                  <ListItemIcon><QueueIcon fontSize="small" /></ListItemIcon>
                  <ListItemText>Add to Render Queue</ListItemText>
                </MenuItem>
              )}

              {/* Remove from Queue - only if queued */}
              {renderJob?.status === 'queued' && (
                <MenuItem onClick={() => handleCancelRender(shot.id)}>
                  <ListItemIcon><Cancel fontSize="small" /></ListItemIcon>
                  <ListItemText>Remove from Queue</ListItemText>
                </MenuItem>
              )}

              {/* Retry - only if failed or completed */}
              {(renderJob?.status === 'failed' || renderJob?.status === 'completed') && (
                <MenuItem onClick={() => handleRetryRender(shot)}>
                  <ListItemIcon><Refresh fontSize="small" /></ListItemIcon>
                  <ListItemText>{renderJob.status === 'failed' ? 'Retry Render' : 'Re-render'}</ListItemText>
                </MenuItem>
              )}

              {/* View in Render Queue */}
              {renderJob && (
                <MenuItem onClick={() => window.location.href = '/render-queue'}>
                  <ListItemIcon><VideoLibrary fontSize="small" /></ListItemIcon>
                  <ListItemText>View in Render Queue</ListItemText>
                </MenuItem>
              )}

              <Divider />

              {/* Copy Prompts */}
              {shot.comfyUIPositivePrompt && (
                <MenuItem onClick={() => handleCopyPrompt(shot.comfyUIPositivePrompt || '', 'menu-pos')}>
                  <ListItemIcon><ContentCopy fontSize="small" /></ListItemIcon>
                  <ListItemText>Copy Positive Prompt</ListItemText>
                </MenuItem>
              )}
              {shot.comfyUINegativePrompt && (
                <MenuItem onClick={() => handleCopyPrompt(shot.comfyUINegativePrompt || '', 'menu-neg')}>
                  <ListItemIcon><ContentCopy fontSize="small" /></ListItemIcon>
                  <ListItemText>Copy Negative Prompt</ListItemText>
                </MenuItem>
              )}

              <Divider />

              {/* Generate Prompt - Manual mode */}
              {isManualMode && !hasPrompt && (
                <MenuItem
                  onClick={() => handleGeneratePromptForShot(shot)}
                  disabled={isGeneratingPrompt === shot.id}
                >
                  <ListItemIcon>
                    {isGeneratingPrompt === shot.id ? (
                      <CircularProgress size={20} />
                    ) : (
                      <GenerateIcon fontSize="small" />
                    )}
                  </ListItemIcon>
                  <ListItemText>Generate Prompt</ListItemText>
                </MenuItem>
              )}

              {/* Edit */}
              <MenuItem onClick={() => handleOpenEditShot(shot)}>
                <ListItemIcon><Edit fontSize="small" /></ListItemIcon>
                <ListItemText>Edit Shot</ListItemText>
              </MenuItem>

              {/* Settings */}
              <MenuItem>
                <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Render Settings</ListItemText>
              </MenuItem>
            </>
          );
        })()}
      </Menu>

      {/* Add Shot Dialog */}
      <Dialog
        open={addShotDialogOpen}
        onClose={() => setAddShotDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add New Shot</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Shot Description"
              value={newShot.description || ''}
              onChange={(e) => setNewShot({ ...newShot, description: e.target.value })}
              fullWidth
              multiline
              rows={3}
              required
              placeholder="Describe what happens in this shot..."
            />
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <FormControl fullWidth>
                  <InputLabel>Shot Type</InputLabel>
                  <Select
                    value={newShot.shotType || 'medium'}
                    label="Shot Type"
                    onChange={(e) => setNewShot({ ...newShot, shotType: e.target.value })}
                  >
                    <MenuItem value="wide">Wide Shot</MenuItem>
                    <MenuItem value="medium">Medium Shot</MenuItem>
                    <MenuItem value="close-up">Close-up</MenuItem>
                    <MenuItem value="extreme-close-up">Extreme Close-up</MenuItem>
                    <MenuItem value="over-shoulder">Over Shoulder</MenuItem>
                    <MenuItem value="pov">POV</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <FormControl fullWidth>
                  <InputLabel>Angle</InputLabel>
                  <Select
                    value={newShot.angle || 'eye-level'}
                    label="Angle"
                    onChange={(e) => setNewShot({ ...newShot, angle: e.target.value })}
                  >
                    <MenuItem value="eye-level">Eye Level</MenuItem>
                    <MenuItem value="high">High Angle</MenuItem>
                    <MenuItem value="low">Low Angle</MenuItem>
                    <MenuItem value="dutch">Dutch Angle</MenuItem>
                    <MenuItem value="birds-eye">Bird's Eye</MenuItem>
                    <MenuItem value="worms-eye">Worm's Eye</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="Duration (seconds)"
                  type="number"
                  value={newShot.duration || 3}
                  onChange={(e) => setNewShot({ ...newShot, duration: parseFloat(e.target.value) || 3 })}
                  fullWidth
                  slotProps={{ htmlInput: { min: 1, max: 30, step: 0.5 } }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <FormControl fullWidth>
                  <InputLabel>Camera Movement</InputLabel>
                  <Select
                    value={newShot.cameraMovement || 'static'}
                    label="Camera Movement"
                    onChange={(e) => setNewShot({ ...newShot, cameraMovement: e.target.value })}
                  >
                    <MenuItem value="static">Static</MenuItem>
                    <MenuItem value="pan">Pan</MenuItem>
                    <MenuItem value="tilt">Tilt</MenuItem>
                    <MenuItem value="dolly">Dolly</MenuItem>
                    <MenuItem value="zoom">Zoom</MenuItem>
                    <MenuItem value="tracking">Tracking</MenuItem>
                    <MenuItem value="crane">Crane</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddShotDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAddShot}
            disabled={!newShot.description?.trim()}
          >
            Add Shot
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Shot Dialog */}
      <Dialog
        open={editShotDialogOpen}
        onClose={() => setEditShotDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Edit Shot {editingShot?.shotNumber}</Typography>
            {editingShot && !editingShot.comfyUIPositivePrompt && (
              <Button
                size="small"
                variant="outlined"
                startIcon={isGeneratingPrompt === editingShot.id ? <CircularProgress size={16} /> : <GenerateIcon />}
                onClick={() => editingShot && handleGeneratePromptForShot(editingShot)}
                disabled={isGeneratingPrompt === editingShot?.id}
              >
                Generate Prompt
              </Button>
            )}
          </Box>
        </DialogTitle>
        <DialogContent>
          {editingShot && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <TextField
                label="Shot Description"
                value={editingShot.description || ''}
                onChange={(e) => setEditingShot({ ...editingShot, description: e.target.value })}
                fullWidth
                multiline
                rows={3}
              />
              <Grid container spacing={2}>
                <Grid size={{ xs: 4 }}>
                  <FormControl fullWidth>
                    <InputLabel>Shot Type</InputLabel>
                    <Select
                      value={editingShot.shotType || 'medium'}
                      label="Shot Type"
                      onChange={(e) => setEditingShot({ ...editingShot, shotType: e.target.value })}
                    >
                      <MenuItem value="wide">Wide Shot</MenuItem>
                      <MenuItem value="medium">Medium Shot</MenuItem>
                      <MenuItem value="close-up">Close-up</MenuItem>
                      <MenuItem value="extreme-close-up">Extreme Close-up</MenuItem>
                      <MenuItem value="over-shoulder">Over Shoulder</MenuItem>
                      <MenuItem value="pov">POV</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <FormControl fullWidth>
                    <InputLabel>Angle</InputLabel>
                    <Select
                      value={editingShot.angle || 'eye-level'}
                      label="Angle"
                      onChange={(e) => setEditingShot({ ...editingShot, angle: e.target.value })}
                    >
                      <MenuItem value="eye-level">Eye Level</MenuItem>
                      <MenuItem value="high">High Angle</MenuItem>
                      <MenuItem value="low">Low Angle</MenuItem>
                      <MenuItem value="dutch">Dutch Angle</MenuItem>
                      <MenuItem value="birds-eye">Bird's Eye</MenuItem>
                      <MenuItem value="worms-eye">Worm's Eye</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <TextField
                    label="Duration (seconds)"
                    type="number"
                    value={editingShot.duration || 3}
                    onChange={(e) => setEditingShot({ ...editingShot, duration: parseFloat(e.target.value) || 3 })}
                    fullWidth
                    slotProps={{ htmlInput: { min: 1, max: 30, step: 0.5 } }}
                  />
                </Grid>
              </Grid>

              <Divider sx={{ my: 1 }} />

              <Typography variant="subtitle2">Visual Prompts</Typography>
              <TextField
                label="Positive Prompt (ComfyUI)"
                value={editingShot.comfyUIPositivePrompt || ''}
                onChange={(e) => setEditingShot({ ...editingShot, comfyUIPositivePrompt: e.target.value })}
                fullWidth
                multiline
                rows={3}
                placeholder="Describe what should be in the shot..."
              />
              <TextField
                label="Negative Prompt (ComfyUI)"
                value={editingShot.comfyUINegativePrompt || ''}
                onChange={(e) => setEditingShot({ ...editingShot, comfyUINegativePrompt: e.target.value })}
                fullWidth
                multiline
                rows={2}
                placeholder="What to avoid in the shot..."
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditShotDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEditedShot}>
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ShotlistTab;
