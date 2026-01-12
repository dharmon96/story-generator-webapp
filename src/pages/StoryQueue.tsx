import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  IconButton,
  Button,
  Chip,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Collapse,
} from '@mui/material';
import {
  PlayArrow,
  Pause,
  Delete,
  ArrowUpward,
  ArrowDownward,
  Clear,
  CheckCircle,
  Error as ErrorIcon,
  HourglassEmpty,
  Visibility,
  Stop,
  Refresh,
  Movie,
  MovieFilter,
  Build,
  ExpandMore,
  ExpandLess,
  ReplayOutlined,
} from '@mui/icons-material';
import { useStore } from '../store/useStore';
import { debugService } from '../services/debugService';
import { nodeDiscoveryService } from '../services/nodeDiscovery';
import { queueProcessor, ProcessingStatus } from '../services/queueProcessor';
import { GENERATION_METHODS, SHOT_BASED_PIPELINE } from '../types/generationMethods';
import CustomStoryDialog from '../components/CustomStoryDialog';

interface StoryQueueProps {
  onOpenStory?: (storyId: string, queueItemId: string) => void;
}

const StoryQueue: React.FC<StoryQueueProps> = ({ onOpenStory }) => {
  const { queue, renderQueue, removeFromQueue, clearCompletedQueue, moveQueueItem, updateQueueItem, addStory, reQueueItem, settings, getModelConfigsFromAssignments, agents, pipelineAssignments } = useStore();
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customStoryDialogOpen, setCustomStoryDialogOpen] = useState(false);
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>({
    isProcessing: false,
    currentItemId: null,
    startedAt: null,
    queueLength: 0,
    errors: [],
    stoppedDueToError: false,
    stopReason: null
  });

  // Toggle error expansion for a queue item
  const toggleErrorExpansion = (itemId: string) => {
    setExpandedErrors(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  // Logging function
  const addDebugLog = useCallback((message: string, level: 'info' | 'error' | 'success' | 'warning' = 'info') => {
    // Route to centralized debug service
    switch (level) {
      case 'success':
        debugService.success('queue', message);
        break;
      case 'error':
        debugService.error('queue', message);
        break;
      case 'warning':
        debugService.warn('queue', message);
        break;
      default:
        debugService.info('queue', message);
        break;
    }
  }, []);

  // Initialize component and subscribe to queue processor status
  useEffect(() => {
    const mountId = Math.random().toString(36).substring(2, 9);
    const mountTime = new Date().toLocaleTimeString();
    
    addDebugLog(`📊 ===== StoryQueue mounted [${mountId}] at ${mountTime} =====`);
    addDebugLog(`📊 Queue items: ${queue.length}, Processing enabled: ${settings.processingEnabled}`);
    addDebugLog(`📊 Available nodes: ${nodeDiscoveryService.getNodes().length}`);
    
    // Subscribe to queue processor status changes
    const unsubscribe = queueProcessor.onStatusChange((status) => {
      setProcessingStatus(status);
      addDebugLog(`📊 Queue processor status updated: isProcessing=${status.isProcessing}, currentItem=${status.currentItemId}`);
    });
    
    // Get initial status
    const initialStatus = queueProcessor.getStatus();
    setProcessingStatus(initialStatus);
    
    addDebugLog(`📊 ===== End mount [${mountId}] =====`);
    
    // Cleanup function
    return () => {
      addDebugLog(`📊 🔄 StoryQueue unmounting [${mountId}]`);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount


  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const item = queue[index];
    moveQueueItem(item.id, 'up');
  };

  const handleMoveDown = (index: number) => {
    if (index === queue.length - 1) return;
    const item = queue[index];
    moveQueueItem(item.id, 'down');
  };

  const handleDelete = (id: string) => {
    setSelectedItem(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (selectedItem) {
      // Stop processing this item if it's currently being processed
      if (processingStatus.currentItemId === selectedItem) {
        queueProcessor.stopProcessing();
      }
      removeFromQueue(selectedItem);
    }
    setDeleteDialogOpen(false);
    setSelectedItem(null);
  };

  const handleToggleProcessing = useCallback(async () => {
    const isCurrentlyProcessing = processingStatus.isProcessing;
    addDebugLog(`🎛️ Toggle processing: ${isCurrentlyProcessing} -> ${!isCurrentlyProcessing}`);
    
    if (!isCurrentlyProcessing) {
      // Start processing
      try {
        addDebugLog('🚀 Starting queue processing...', 'success');

        // Clear any previous errors
        queueProcessor.clearErrors();

        // Sync agents to legacy nodeDiscoveryService for pipeline compatibility
        nodeDiscoveryService.syncFromAgents(agents);

        // Use the bridge function to get modelConfigs from pipelineAssignments
        const modelConfigs = getModelConfigsFromAssignments();
        addDebugLog(`📋 Model configs: ${modelConfigs.length} configured, steps: ${modelConfigs.map(c => c.step).join(', ')}`);

        await queueProcessor.startProcessing(
          queue,
          modelConfigs,
          updateQueueItem,
          addStory
        );
        
      } catch (error: any) {
        addDebugLog(`❌ Failed to start processing: ${error.message}`, 'error');
      }
    } else {
      // Stop processing
      addDebugLog('🛑 Stopping queue processing');
      queueProcessor.stopProcessing();
      
      // Re-queue any processing items for retry
      const processingItems = queue.filter(item => item.status === 'processing');
      if (processingItems.length > 0) {
        addDebugLog(`🔄 Re-queuing ${processingItems.length} interrupted items`);
        processingItems.forEach(item => {
          reQueueItem(item.id);
        });
      }
    }
  }, [processingStatus.isProcessing, queue, getModelConfigsFromAssignments, updateQueueItem, addStory, reQueueItem, addDebugLog, agents]);

  const handleOpenStory = (item: any) => {
    if (onOpenStory) {
      // During generation, the story ID is the same as the queue item ID
      // After completion, item.storyId contains the final story ID
      const storyId = item.storyId || item.id;
      onOpenStory(storyId, item.id);
    }
  };

  const handleCancelItem = (id: string) => {
    // Cancel a specific item
    updateQueueItem(id, { status: 'failed' as const, error: 'Cancelled by user' });
  };

  const getStepDisplayName = (step: string): string => {
    // Step names in HoloCine-optimized pipeline order:
    // 1. Story → 2. Segments → 3. Shots → 4. Characters → 5. HoloCine Scenes → (optional: prompts, narration, music)
    const stepNames: Record<string, string> = {
      'story': '📝 Writing Story',
      'segments': '📑 Segmenting Story',
      'shots': '🎬 Creating Shots',
      'characters': '👥 Analyzing Characters',
      'holocine_scenes': '🎥 Building HoloCine Scenes',
      'prompts': '🎨 ComfyUI Prompts (Optional)',
      'comfyui_prompts': '🖼️ ComfyUI Prompts',
      'narration': '🎙️ Adding Narration',
      'music': '🎵 Adding Music',
      'completed': '✅ Finalizing',
      'processing': '⏳ Processing...'
    };
    return stepNames[step] || step;
  };

  /**
   * Get render status for a completed story with shot counts
   */
  interface RenderStatusInfo {
    status: 'rendered' | 'rendering' | 'ready_to_render';
    totalShots: number;
    completedShots: number;
    renderingShots: number;
    failedShots: number;
  }

  const getRenderStatus = (storyId: string | undefined): RenderStatusInfo | null => {
    if (!storyId) return null;

    // Find all render jobs for this story
    const storyRenderJobs = renderQueue.filter(job => job.storyId === storyId);

    if (storyRenderJobs.length === 0) {
      return {
        status: 'ready_to_render',
        totalShots: 0,
        completedShots: 0,
        renderingShots: 0,
        failedShots: 0
      };
    }

    const totalShots = storyRenderJobs.length;
    const completedShots = storyRenderJobs.filter(job => job.status === 'completed').length;
    const renderingShots = storyRenderJobs.filter(job =>
      job.status === 'rendering' || job.status === 'assigned'
    ).length;
    const failedShots = storyRenderJobs.filter(job => job.status === 'failed').length;

    let status: 'rendered' | 'rendering' | 'ready_to_render';
    if (completedShots === totalShots) {
      status = 'rendered';
    } else if (renderingShots > 0 || completedShots > 0) {
      status = 'rendering';
    } else {
      status = 'ready_to_render';
    }

    return {
      status,
      totalShots,
      completedShots,
      renderingShots,
      failedShots
    };
  };

  const getStatusIcon = (status: string, renderInfo?: RenderStatusInfo | null) => {
    // For completed items, show render-specific icons
    if (status === 'completed' && renderInfo) {
      switch (renderInfo.status) {
        case 'rendered':
          return <MovieFilter sx={{ color: '#4caf50' }} />;  // Green film icon
        case 'rendering':
          return <Movie sx={{ color: '#2196f3' }} />;  // Blue film icon
        case 'ready_to_render':
          return <Movie sx={{ color: '#ff9800' }} />;  // Orange film icon
      }
    }

    switch (status) {
      case 'completed':
        return <CheckCircle color="success" />;
      case 'failed':
        return <ErrorIcon color="error" />;
      case 'processing':
        return <HourglassEmpty color="primary" />;
      default:
        return <HourglassEmpty color="disabled" />;
    }
  };

  const getStatusLabel = (status: string, renderInfo?: RenderStatusInfo | null): string => {
    if (status === 'completed' && renderInfo) {
      switch (renderInfo.status) {
        case 'rendered':
          return `Rendered (${renderInfo.totalShots} shots)`;
        case 'rendering':
          return `Rendering ${renderInfo.completedShots}/${renderInfo.totalShots}`;
        case 'ready_to_render':
          return 'Ready to Render';
      }
    }
    return status;
  };

  const getStatusColor = (status: string, renderInfo?: RenderStatusInfo | null): any => {
    // For completed items, show render-specific colors
    if (status === 'completed' && renderInfo) {
      switch (renderInfo.status) {
        case 'rendered':
          return 'success';  // Green
        case 'rendering':
          return 'primary';  // Blue
        case 'ready_to_render':
          return 'warning';  // Orange
      }
    }

    switch (status) {
      case 'completed':
        return 'success';
      case 'failed':
        return 'error';
      case 'processing':
        return 'primary';
      default:
        return 'default';
    }
  };

  const calculateETA = () => {
    const processingItems = queue.filter(item => item.status === 'processing' || item.status === 'queued');
    const avgTime = 12; // minutes per story
    const totalMinutes = processingItems.length * avgTime;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  /**
   * Get pipeline info for a queue item
   * Shows the video generation method and LLM model being used
   */
  const getPipelineInfo = (item: typeof queue[0]) => {
    const methodId = item.config.generationMethod || 'wan22';
    const method = GENERATION_METHODS.find(m => m.id === methodId);

    // Find LLM model from pipeline assignments (for the 'story' step)
    const storyAssignment = pipelineAssignments?.find(
      a => a.stepId === 'story' && a.enabled
    );
    const llmModel = storyAssignment?.modelId || 'Default LLM';

    // Shorten model name for display
    const shortLlmName = llmModel
      .replace('llama3.1:', '')
      .replace('llama3:', '')
      .replace('qwen2.5:', '')
      .replace(':latest', '')
      .split(':')[0];

    return {
      method,
      methodName: method?.name || methodId,
      methodIcon: method?.icon || '🎬',
      methodColor: method?.color || '#666',
      llmModel: shortLlmName,
      pipelineType: method?.pipelineType || 'shot-based'
    };
  };

  // Auto-start only for high-priority items (from Generate button)
  // Excludes custom/manual stories - they are processed step-by-step manually
  useEffect(() => {
    const highPriorityQueuedItems = queue.filter(item =>
      item.status === 'queued' &&
      item.priority >= 10 &&
      !item.isCustom &&    // Never auto-process custom stories
      !item.manualMode     // Never auto-process manual mode stories
    );

    // Only auto-start if we have genuinely new high-priority items and we're not processing
    if (highPriorityQueuedItems.length > 0 && !processingStatus.isProcessing && settings.processingEnabled) {
      debugService.info('queue', `🚀 High-priority queued items detected! Auto-starting processing for ${highPriorityQueuedItems.length} items`);
      
      // Start processing immediately for high-priority items
      const startImmediateProcessing = async () => {
        try {
          addDebugLog('🚀 Starting immediate processing for high-priority items...', 'success');

          // Sync agents to legacy nodeDiscoveryService for pipeline compatibility
          nodeDiscoveryService.syncFromAgents(agents);

          const modelConfigs = getModelConfigsFromAssignments();
          await queueProcessor.startProcessing(
            queue,
            modelConfigs,
            updateQueueItem,
            addStory
          );
          
        } catch (error: any) {
          addDebugLog(`❌ Failed to start immediate processing: ${error.message}`, 'error');
        }
      };
      
      startImmediateProcessing();
    }
  }, [queue, processingStatus.isProcessing, updateQueueItem, addStory, addDebugLog, settings.processingEnabled, getModelConfigsFromAssignments, pipelineAssignments, agents]);

  // Manual queue processing only starts when user clicks "Start Processing" button

  // Calculate queue stats
  const queueStats = {
    total: queue.length,
    queued: queue.filter(item => item.status === 'queued').length,
    processing: queue.filter(item => item.status === 'processing').length,
    completed: queue.filter(item => item.status === 'completed').length,
    failed: queue.filter(item => item.status === 'failed').length,
  };

  // Calculate render stats
  const renderStats = {
    total: renderQueue.length,
    queued: renderQueue.filter(j => j.status === 'queued').length,
    rendering: renderQueue.filter(j => j.status === 'rendering' || j.status === 'assigned').length,
    completed: renderQueue.filter(j => j.status === 'completed').length,
  };

  return (
    <Box>
      {/* Header Banner with Stats */}
      <Paper
        sx={{
          p: 3,
          mb: 3,
          background: processingStatus.isProcessing
            ? 'linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%)'
            : 'linear-gradient(135deg, #1a237e 0%, #311b92 100%)',
          color: 'white',
          borderRadius: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          {/* Title and Status */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box>
              <Typography variant="h4" fontWeight="bold">
                Story Queue
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                {processingStatus.isProcessing ? (
                  <>Processing • {processingStatus.currentItemId ? `Working on story...` : 'Idle'}</>
                ) : (
                  `${queueStats.queued} stories waiting • ${renderStats.queued} shots ready to render`
                )}
              </Typography>
            </Box>
          </Box>

          {/* Stats Cards */}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ textAlign: 'center', px: 2 }}>
              <Typography variant="h4" fontWeight="bold">{queueStats.total}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>Total</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', px: 2, borderLeft: '1px solid rgba(255,255,255,0.3)' }}>
              <Typography variant="h4" fontWeight="bold" sx={{ color: '#90caf9' }}>{queueStats.processing}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>Processing</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', px: 2, borderLeft: '1px solid rgba(255,255,255,0.3)' }}>
              <Typography variant="h4" fontWeight="bold" sx={{ color: '#a5d6a7' }}>{queueStats.completed}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>Complete</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', px: 2, borderLeft: '1px solid rgba(255,255,255,0.3)' }}>
              <Typography variant="h4" fontWeight="bold" sx={{ color: '#ffcc80' }}>{renderStats.queued}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>Render Queue</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', px: 2, borderLeft: '1px solid rgba(255,255,255,0.3)' }}>
              <Typography variant="body2" sx={{ opacity: 0.8 }}>ETA</Typography>
              <Typography variant="h5" fontWeight="bold">{calculateETA()}</Typography>
            </Box>
          </Box>

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              startIcon={<Build />}
              onClick={() => setCustomStoryDialogOpen(true)}
              sx={{
                bgcolor: 'rgba(255,255,255,0.2)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' }
              }}
            >
              Custom Story
            </Button>
            <Button
              variant="contained"
              startIcon={processingStatus.isProcessing ? <Pause /> : <PlayArrow />}
              onClick={handleToggleProcessing}
              sx={{
                bgcolor: processingStatus.isProcessing ? 'error.main' : 'rgba(255,255,255,0.2)',
                '&:hover': {
                  bgcolor: processingStatus.isProcessing ? 'error.dark' : 'rgba(255,255,255,0.3)'
                }
              }}
            >
              {processingStatus.isProcessing ? 'Stop' : 'Start'}
            </Button>
            <Tooltip title="Clear completed">
              <IconButton
                onClick={() => clearCompletedQueue()}
                disabled={!queue.some(item => item.status === 'completed')}
                sx={{ color: 'white', opacity: queue.some(item => item.status === 'completed') ? 1 : 0.5 }}
              >
                <Clear />
              </IconButton>
            </Tooltip>
            <Tooltip title="Clear all">
              <IconButton
                onClick={() => {
                  if (window.confirm('Are you sure you want to clear ALL items from the queue?')) {
                    queue.forEach(item => {
                      if (item.status !== 'processing') {
                        removeFromQueue(item.id);
                      }
                    });
                  }
                }}
                disabled={queue.length === 0}
                sx={{ color: 'white', opacity: queue.length > 0 ? 1 : 0.5 }}
              >
                <Delete />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Current Processing Info */}
        {processingStatus.isProcessing && processingStatus.currentItemId && (() => {
          const item = queue.find(q => q.id === processingStatus.currentItemId);
          return item ? (
            <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ opacity: 0.8 }}>
                    Currently Processing: <strong>{item.config.prompt?.slice(0, 50) || 'Story'}...</strong>
                  </Typography>
                  {item.currentStep && (
                    <Typography variant="caption" sx={{ opacity: 0.7 }}>
                      Step: {getStepDisplayName(item.currentStep)}
                    </Typography>
                  )}
                </Box>
                <Box sx={{ width: 200 }}>
                  <LinearProgress
                    variant="determinate"
                    value={item.progress}
                    sx={{
                      height: 8,
                      borderRadius: 4,
                      bgcolor: 'rgba(255,255,255,0.2)',
                      '& .MuiLinearProgress-bar': { bgcolor: 'white' }
                    }}
                  />
                  <Typography variant="caption" sx={{ opacity: 0.8 }}>{item.progress}%</Typography>
                </Box>
              </Box>
            </Box>
          ) : null;
        })()}

        {/* Errors */}
        {processingStatus.errors.length > 0 && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {processingStatus.errors.map((error, i) => (
              <Typography key={i} variant="body2">• {error}</Typography>
            ))}
          </Alert>
        )}
      </Paper>

      {/* Configuration Error Banner - Prominent alert when queue stopped due to config error */}
      {processingStatus.stoppedDueToError && processingStatus.stopReason === 'configuration' && (
        <Alert
          severity="error"
          variant="filled"
          sx={{
            mb: 3,
            '& .MuiAlert-message': { width: '100%' }
          }}
          action={
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  // Clear errors and allow restart
                  queueProcessor.clearErrors();
                }}
              >
                Dismiss
              </Button>
              <Button
                color="inherit"
                size="small"
                variant="outlined"
                onClick={handleToggleProcessing}
              >
                Retry
              </Button>
            </Box>
          }
        >
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            Queue Stopped - Configuration Error
          </Typography>
          <Typography variant="body2">
            The story queue was automatically stopped due to a configuration error that would likely affect all items.
            Please check your settings (API keys, model configurations, node connections) and try again.
          </Typography>
          {processingStatus.errors.length > 0 && (
            <Box sx={{ mt: 1, p: 1, bgcolor: 'rgba(0,0,0,0.1)', borderRadius: 1 }}>
              <Typography variant="caption" component="div" sx={{ fontFamily: 'monospace' }}>
                {processingStatus.errors[processingStatus.errors.length - 1]}
              </Typography>
            </Box>
          )}
        </Alert>
      )}

      {/* Queue Table - Full Width */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              Queue Items ({queue.length})
            </Typography>
            {pipelineAssignments && pipelineAssignments.length > 0 && (
              <Typography variant="body2" color="text.secondary">
                {pipelineAssignments.filter(a => a.enabled && a.modelId).length} steps configured
              </Typography>
            )}
          </Box>
              
              {queue.length === 0 ? (
                <Alert severity="info">
                  No items in queue. Add stories from the Story Generator to begin processing.
                </Alert>
              ) : (
                <TableContainer component={Paper} variant="outlined">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Position</TableCell>
                        <TableCell>Story</TableCell>
                        <TableCell>Pipeline</TableCell>
                        <TableCell>Priority</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Progress</TableCell>
                        <TableCell>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {queue.map((item, index) => (
                        <React.Fragment key={item.id}>
                        <TableRow
                          sx={{
                            // Custom stories have a distinct visual style
                            ...(item.isCustom && {
                              bgcolor: 'rgba(255, 152, 0, 0.08)',
                              borderLeft: '4px solid #ff9800',
                            }),
                            // Manual mode stories (converted from auto)
                            ...(item.manualMode && !item.isCustom && {
                              bgcolor: 'rgba(156, 39, 176, 0.08)',
                              borderLeft: '4px solid #9c27b0',
                            }),
                            // Failed stories have a red tint
                            ...(item.status === 'failed' && {
                              bgcolor: 'rgba(244, 67, 54, 0.08)',
                              borderLeft: '4px solid #f44336',
                            }),
                          }}
                        >
                          <TableCell>{index + 1}</TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {/* Custom story icon */}
                              {item.isCustom && (
                                <Tooltip title="Custom Story - Manual Control">
                                  <Build sx={{ fontSize: 18, color: 'warning.main' }} />
                                </Tooltip>
                              )}
                              {item.manualMode && !item.isCustom && (
                                <Tooltip title="Manual Mode - Converted from Auto">
                                  <Build sx={{ fontSize: 18, color: 'secondary.main' }} />
                                </Tooltip>
                              )}
                              <Box>
                                <Typography variant="body2" noWrap sx={{ maxWidth: 180 }}>
                                  {item.stepData?.title || item.config.prompt || 'Auto-generated'}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {item.config.genre}
                                  {item.isCustom && (
                                    <Chip
                                      label="Custom"
                                      size="small"
                                      sx={{
                                        ml: 1,
                                        height: 16,
                                        fontSize: '0.65rem',
                                        bgcolor: 'warning.main',
                                        color: 'warning.contrastText',
                                      }}
                                    />
                                  )}
                                </Typography>
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const pipeline = getPipelineInfo(item);
                              return (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                  <Tooltip title={`Video: ${pipeline.methodName} (${pipeline.pipelineType})`}>
                                    <Chip
                                      size="small"
                                      label={pipeline.methodName}
                                      icon={<span style={{ marginLeft: 6 }}>{pipeline.methodIcon}</span>}
                                      sx={{
                                        bgcolor: `${pipeline.methodColor}20`,
                                        color: pipeline.methodColor,
                                        borderColor: pipeline.methodColor,
                                        fontWeight: 500,
                                        fontSize: '0.7rem',
                                        height: 22,
                                      }}
                                      variant="outlined"
                                    />
                                  </Tooltip>
                                  <Tooltip title={`LLM: ${pipeline.llmModel}`}>
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        color: 'text.secondary',
                                        fontSize: '0.65rem',
                                        display: 'block',
                                        maxWidth: 100,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      LLM: {pipeline.llmModel}
                                    </Typography>
                                  </Tooltip>
                                </Box>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={item.priority >= 10 ? 'Immediate' : 'Normal'}
                              size="small"
                              color={item.priority >= 10 ? 'error' : 'primary'}
                              variant={item.priority >= 10 ? 'filled' : 'outlined'}
                            />
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const renderInfo = item.status === 'completed' ? getRenderStatus(item.storyId) : null;
                              return (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <Chip
                                    icon={getStatusIcon(item.status, renderInfo)}
                                    label={getStatusLabel(item.status, renderInfo)}
                                    size="small"
                                    color={getStatusColor(item.status, renderInfo)}
                                  />
                                  {/* Show error expand button for failed items */}
                                  {item.status === 'failed' && item.error && (
                                    <Tooltip title={expandedErrors.has(item.id) ? "Hide error details" : "Show error details"}>
                                      <IconButton
                                        size="small"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleErrorExpansion(item.id);
                                        }}
                                        sx={{ p: 0.25 }}
                                      >
                                        {expandedErrors.has(item.id) ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                </Box>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Box sx={{ flex: 1 }}>
                                {/* Custom stories show step progress instead of percentage */}
                                {item.isCustom || item.manualMode ? (
                                  <>
                                    <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
                                      {SHOT_BASED_PIPELINE.map((step, stepIdx) => {
                                        const isCompleted = item.completedSteps?.includes(step.id);
                                        const isSkipped = item.skippedSteps?.includes(step.id);
                                        return (
                                          <Tooltip
                                            key={step.id}
                                            title={`${step.name}${isCompleted ? ' ✓' : isSkipped ? ' (skipped)' : ''}`}
                                          >
                                            <Box
                                              sx={{
                                                width: 16,
                                                height: 8,
                                                borderRadius: 1,
                                                bgcolor: isSkipped
                                                  ? 'grey.300'
                                                  : isCompleted
                                                    ? 'success.main'
                                                    : 'grey.400',
                                                opacity: isSkipped ? 0.4 : 1,
                                              }}
                                            />
                                          </Tooltip>
                                        );
                                      })}
                                    </Box>
                                    <Typography variant="caption" color="text.secondary">
                                      {item.completedSteps?.length || 0}/{SHOT_BASED_PIPELINE.length - (item.skippedSteps?.length || 0)} steps
                                      {item.skippedSteps && item.skippedSteps.length > 0 && (
                                        <> • {item.skippedSteps.length} skipped</>
                                      )}
                                    </Typography>
                                  </>
                                ) : (
                                  <>
                                    <LinearProgress
                                      variant="determinate"
                                      value={item.progress}
                                      sx={{ width: '100%', height: 8, borderRadius: 4 }}
                                    />
                                    <Typography variant="caption" color="text.secondary">
                                      {item.progress}%
                                      {item.status === 'processing' && item.currentStep && (
                                        <> • {getStepDisplayName(item.currentStep)}</>
                                      )}
                                    </Typography>
                                  </>
                                )}
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                              <Tooltip title="Open Story Details">
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenStory(item);
                                  }}
                                  disabled={!item.storyId}
                                  color="primary"
                                >
                                  <Visibility />
                                </IconButton>
                              </Tooltip>
                              {item.status === 'processing' ? (
                                <Tooltip title="Cancel Processing">
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCancelItem(item.id);
                                    }}
                                    color="warning"
                                  >
                                    <Stop />
                                  </IconButton>
                                </Tooltip>
                              ) : item.status === 'failed' ? (
                                <Tooltip title="Re-queue for Processing">
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      reQueueItem(item.id);
                                    }}
                                    color="primary"
                                  >
                                    <Refresh />
                                  </IconButton>
                                </Tooltip>
                              ) : (
                                <>
                                  <Tooltip title="Move Up">
                                    <IconButton
                                      size="small"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMoveUp(index);
                                      }}
                                      disabled={index === 0}
                                    >
                                      <ArrowUpward />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Move Down">
                                    <IconButton
                                      size="small"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMoveDown(index);
                                      }}
                                      disabled={index === queue.length - 1}
                                    >
                                      <ArrowDownward />
                                    </IconButton>
                                  </Tooltip>
                                </>
                              )}
                              <Tooltip title="Delete">
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(item.id);
                                  }}
                                  disabled={item.status === 'processing'}
                                  color="error"
                                >
                                  <Delete />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>
                        {/* Expandable error row */}
                        {item.status === 'failed' && item.error && (
                          <TableRow>
                            <TableCell colSpan={7} sx={{ py: 0, borderBottom: expandedErrors.has(item.id) ? undefined : 'none' }}>
                              <Collapse in={expandedErrors.has(item.id)} timeout="auto" unmountOnExit>
                                <Alert
                                  severity="error"
                                  sx={{ my: 1 }}
                                  action={
                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                      <Button
                                        size="small"
                                        startIcon={<ReplayOutlined />}
                                        onClick={() => reQueueItem(item.id)}
                                        color="inherit"
                                      >
                                        Retry
                                      </Button>
                                    </Box>
                                  }
                                >
                                  <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                                    {item.currentStep ? `Failed at step: ${getStepDisplayName(item.currentStep)}` : 'Generation Failed'}
                                  </Typography>
                                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                    {item.error}
                                  </Typography>
                                </Alert>
                              </Collapse>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          Are you sure you want to remove this item from the queue?
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Custom Story Dialog */}
      <CustomStoryDialog
        open={customStoryDialogOpen}
        onClose={() => setCustomStoryDialogOpen(false)}
        onStoryCreated={(storyId, queueItemId) => {
          // Navigate to the story view when custom story is created
          if (onOpenStory) {
            onOpenStory(storyId, queueItemId);
          }
        }}
      />
    </Box>
  );
};

export default StoryQueue;