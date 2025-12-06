import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Grid,
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
} from '@mui/icons-material';
import { useStore, Story } from '../store/useStore';
import { debugService } from '../services/debugService';
import { nodeDiscoveryService } from '../services/nodeDiscovery';
import { queueProcessor, ProcessingStatus } from '../services/queueProcessor';

interface StoryQueueProps {
  onOpenStory?: (storyId: string, queueItemId: string) => void;
}

const StoryQueue: React.FC<StoryQueueProps> = ({ onOpenStory }) => {
  const { queue, removeFromQueue, clearCompletedQueue, moveQueueItem, updateQueueItem, addStory, reQueueItem, settings } = useStore();
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>({
    isProcessing: false,
    currentItemId: null,
    startedAt: null,
    queueLength: 0,
    errors: []
  });

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
        
        await queueProcessor.startProcessing(
          queue,
          settings.modelConfigs || [],
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
  }, [processingStatus.isProcessing, queue, settings.modelConfigs, updateQueueItem, addStory, reQueueItem, addDebugLog]);

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

  const getStatusIcon = (status: string) => {
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

  const getStatusColor = (status: string): any => {
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

  // Auto-start only for high-priority items (from Generate button)
  useEffect(() => {
    const highPriorityQueuedItems = queue.filter(item => 
      item.status === 'queued' && 
      item.priority >= 10
    );
    
    // Only auto-start if we have genuinely new high-priority items and we're not processing
    if (highPriorityQueuedItems.length > 0 && !processingStatus.isProcessing && settings.processingEnabled) {
      debugService.info('queue', `🚀 High-priority queued items detected! Auto-starting processing for ${highPriorityQueuedItems.length} items`);
      
      // Start processing immediately for high-priority items
      const startImmediateProcessing = async () => {
        try {
          addDebugLog('🚀 Starting immediate processing for high-priority items...', 'success');
          
          await queueProcessor.startProcessing(
            queue,
            settings.modelConfigs || [],
            updateQueueItem,
            addStory
          );
          
        } catch (error: any) {
          addDebugLog(`❌ Failed to start immediate processing: ${error.message}`, 'error');
        }
      };
      
      startImmediateProcessing();
    }
  }, [queue, processingStatus.isProcessing, updateQueueItem, addStory, addDebugLog, settings.processingEnabled, settings.modelConfigs]);

  // Manual queue processing only starts when user clicks "Start Processing" button

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">Story Queue</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<Clear />}
            onClick={() => {
              clearCompletedQueue();
              console.log('Cleared completed items');
            }}
            disabled={!queue.some(item => item.status === 'completed')}
          >
            Clear Completed
          </Button>
          <Button
            variant="outlined"
            startIcon={<Delete />}
            onClick={() => {
              if (window.confirm('Are you sure you want to clear ALL items from the queue?')) {
                queue.forEach(item => {
                  if (item.status !== 'processing') {
                    removeFromQueue(item.id);
                  }
                });
              }
            }}
            color="error"
            disabled={queue.length === 0 || queue.every(item => item.status === 'processing')}
          >
            Clear All
          </Button>
          <Button
            variant="contained"
            startIcon={processingStatus.isProcessing ? <Pause /> : <PlayArrow />}
            onClick={handleToggleProcessing}
            color={processingStatus.isProcessing ? 'error' : 'primary'}
          >
            {processingStatus.isProcessing ? 'Stop Processing' : 'Start Processing'}
          </Button>
        </Box>
      </Box>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Queue Items
              </Typography>
              
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
                        <TableCell>Genre</TableCell>
                        <TableCell>Priority</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Progress</TableCell>
                        <TableCell>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {queue.map((item, index) => (
                        <TableRow key={item.id}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell>
                            <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                              {item.config.prompt || 'Auto-generated'}
                            </Typography>
                          </TableCell>
                          <TableCell>{item.config.genre}</TableCell>
                          <TableCell>
                            <Chip 
                              label={item.priority >= 10 ? 'Immediate' : 'Normal'} 
                              size="small" 
                              color={item.priority >= 10 ? 'error' : 'primary'}
                              variant={item.priority >= 10 ? 'filled' : 'outlined'}
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              icon={getStatusIcon(item.status)}
                              label={item.status}
                              size="small"
                              color={getStatusColor(item.status)}
                            />
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Box sx={{ flex: 1 }}>
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
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Queue Statistics
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">Total Items</Typography>
                  <Typography variant="h4">{queue.length}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Processing</Typography>
                  <Typography variant="h4">
                    {queue.filter(item => item.status === 'processing').length}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Completed</Typography>
                  <Typography variant="h4">
                    {queue.filter(item => item.status === 'completed').length}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Estimated Time</Typography>
                  <Typography variant="h4">{calculateETA()}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Processing Settings
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Alert severity={processingStatus.isProcessing ? 'success' : 'info'}>
                  Queue processing is {processingStatus.isProcessing ? 'active' : 'paused'}
                  {processingStatus.currentItemId && (() => {
                    const item = queue.find(q => q.id === processingStatus.currentItemId);
                    return item ? (
                      <>
                        <br />
                        <strong>Processing:</strong> {item.config.prompt.slice(0, 30)}...
                        {item.currentStep && (
                          <>
                            <br />
                            <strong>Step:</strong> {getStepDisplayName(item.currentStep)}
                          </>
                        )}
                      </>
                    ) : null;
                  })()}
                </Alert>
                
                <Alert severity="info" sx={{ mt: 1, fontSize: '0.875rem' }}>
                  <strong>Processing Modes:</strong><br />
                  • <strong>Immediate:</strong> Stories from "Generate" button start automatically<br />
                  • <strong>Normal:</strong> Batch processing starts when you click "Start Processing"<br />
                  • Immediate stories always process first (highest priority)
                </Alert>
                
                <Button 
                  size="small" 
                  variant="outlined" 
                  onClick={() => {
                    console.log('🔍 DEBUG STATE DUMP:');
                    console.log('📊 Queue:', queue);
                    console.log('📊 Settings:', settings);
                    console.log('📊 Processing Status:', processingStatus);
                    console.log('📊 Available nodes:', nodeDiscoveryService.getNodes());
                    
                    // Show a brief alert
                    alert(`Debug info logged to console:\n- Queue items: ${queue.length}\n- Processing: ${processingStatus.isProcessing}\n- Current item: ${processingStatus.currentItemId || 'none'}\n- Errors: ${processingStatus.errors.length}\n- Nodes: ${nodeDiscoveryService.getNodes().length}`);
                  }}
                >
                  🐛 Debug State
                </Button>
                
                {processingStatus.errors.length > 0 && (
                  <Alert severity="error" sx={{ mb: 1 }}>
                    <Typography variant="body2" fontWeight="bold">Processing Errors:</Typography>
                    {processingStatus.errors.map((error, index) => (
                      <Typography key={index} variant="body2" component="div">
                        • {error}
                      </Typography>
                    ))}
                  </Alert>
                )}
                
                {settings.modelConfigs && settings.modelConfigs.length > 0 ? (
                  <>
                    <Typography variant="body2">
                      Configured models: <strong>{settings.modelConfigs.filter(c => c.enabled).length}</strong>
                    </Typography>
                    <Typography variant="body2">
                      Processing queue: <strong>{queue.filter(q => q.status === 'queued').length} queued</strong>
                    </Typography>
                    <Typography variant="body2">
                      Auto-retry on failure: <strong>{settings.autoRetry ? `Yes (${settings.retryAttempts} attempts)` : 'No'}</strong>
                    </Typography>
                  </>
                ) : (
                  <Alert severity="warning">
                    No model configurations found. Please configure models in Settings.
                  </Alert>
                )}
              </Box>
            </CardContent>
          </Card>

        </Grid>
      </Grid>

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
    </Box>
  );
};

export default StoryQueue;