/**
 * Video Render Queue Page
 *
 * Displays the video render queue with job statuses, node assignments,
 * and controls for managing the render pipeline.
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Chip,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Switch,
  FormControlLabel,
  Card,
  CardContent,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Collapse,
  Grid,
} from '@mui/material';
import {
  PlayArrow,
  Delete,
  Clear,
  CheckCircle,
  Error as ErrorIcon,
  HourglassEmpty,
  Movie,
  Computer,
  ExpandMore,
  ExpandLess,
  Visibility,
  Replay,
} from '@mui/icons-material';
import { useStore, RenderJob } from '../store/useStore';
import { renderQueueManager } from '../services/renderQueueManager';
import { nodeDiscoveryService } from '../services/nodeDiscovery';

const RenderQueue: React.FC = () => {
  const { renderQueue, renderQueueEnabled, setRenderQueueEnabled, updateRenderJob, removeRenderJob, clearCompletedRenderJobs, clearAllRenderJobs } = useStore();
  const [nodeStatuses, setNodeStatuses] = useState<{ nodeId: string; nodeName: string; busy: boolean; currentJob: string | null }[]>([]);
  const [queueStats, setQueueStats] = useState({ queued: 0, rendering: 0, completed: 0, failed: 0, total: 0 });
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [confirmClearDialog, setConfirmClearDialog] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Update stats periodically
  useEffect(() => {
    const updateStats = () => {
      setNodeStatuses(renderQueueManager.getNodeStatuses());
      setQueueStats(renderQueueManager.getQueueStats());
    };

    updateStats();
    const interval = setInterval(updateStats, 2000);
    return () => clearInterval(interval);
  }, [renderQueue]);

  // Handle toggle auto-render
  const handleToggleAutoRender = (enabled: boolean) => {
    setRenderQueueEnabled(enabled);
    if (enabled) {
      renderQueueManager.start();
    } else {
      renderQueueManager.stop();
    }
  };

  // Handle manual job start
  const handleStartJob = async (jobId: string) => {
    try {
      await renderQueueManager.processJobManually(jobId);
    } catch (error: any) {
      alert(`Failed to start job: ${error.message}`);
    }
  };

  // Handle retry failed job
  const handleRetryJob = (jobId: string) => {
    updateRenderJob(jobId, {
      status: 'queued',
      error: undefined,
      attempts: 0,
      progress: 0,
      assignedNode: undefined
    });
  };

  // Get status icon
  const getStatusIcon = (status: RenderJob['status']) => {
    switch (status) {
      case 'queued':
        return <HourglassEmpty fontSize="small" sx={{ color: 'grey.500' }} />;
      case 'assigned':
      case 'rendering':
        return <Movie fontSize="small" sx={{ color: 'primary.main' }} className="animate-spin" />;
      case 'completed':
        return <CheckCircle fontSize="small" sx={{ color: 'success.main' }} />;
      case 'failed':
        return <ErrorIcon fontSize="small" sx={{ color: 'error.main' }} />;
      default:
        return null;
    }
  };

  // Get status chip
  const getStatusChip = (status: RenderJob['status']) => {
    const colors: Record<string, 'default' | 'primary' | 'success' | 'error' | 'warning'> = {
      queued: 'default',
      assigned: 'warning',
      rendering: 'primary',
      completed: 'success',
      failed: 'error'
    };

    return (
      <Chip
        size="small"
        icon={getStatusIcon(status) || undefined}
        label={status.charAt(0).toUpperCase() + status.slice(1)}
        color={colors[status] || 'default'}
        sx={{ minWidth: 90 }}
      />
    );
  };

  // Toggle job expansion
  const toggleJobExpansion = (jobId: string) => {
    setExpandedJobs(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  // Group jobs by story
  const jobsByStory = renderQueue.reduce((acc, job) => {
    const storyId = job.storyId;
    if (!acc[storyId]) {
      acc[storyId] = [];
    }
    acc[storyId].push(job);
    return acc;
  }, {} as Record<string, RenderJob[]>);

  const availableNodes = nodeStatuses.filter(n => !n.busy).length;
  const busyNodes = nodeStatuses.filter(n => n.busy).length;

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Paper
        sx={{
          p: 3,
          mb: 3,
          background: 'linear-gradient(135deg, #1a237e 0%, #311b92 100%)',
          color: 'white',
          borderRadius: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Movie sx={{ fontSize: 40 }} />
            <Box>
              <Typography variant="h4" fontWeight="bold">
                Video Render Queue
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                Manage video rendering jobs across your ComfyUI nodes
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={renderQueueEnabled}
                  onChange={(e) => handleToggleAutoRender(e.target.checked)}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': {
                      color: '#4caf50',
                    },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                      backgroundColor: '#4caf50',
                    },
                  }}
                />
              }
              label={
                <Typography variant="body2" sx={{ color: 'white' }}>
                  Auto-Render
                </Typography>
              }
            />

            <Tooltip title="Clear completed jobs">
              <IconButton
                onClick={() => clearCompletedRenderJobs()}
                sx={{ color: 'white' }}
              >
                <Clear />
              </IconButton>
            </Tooltip>

            <Tooltip title="Clear all jobs">
              <IconButton
                onClick={() => setConfirmClearDialog(true)}
                sx={{ color: 'white' }}
              >
                <Delete />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Paper>

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 2 }}>
          <Card sx={{ bgcolor: 'background.paper' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4" fontWeight="bold" color="grey.600">
                {queueStats.queued}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Queued
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 6, md: 2 }}>
          <Card sx={{ bgcolor: 'primary.50' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4" fontWeight="bold" color="primary.main">
                {queueStats.rendering}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Rendering
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 6, md: 2 }}>
          <Card sx={{ bgcolor: 'success.50' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4" fontWeight="bold" color="success.main">
                {queueStats.completed}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Completed
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 6, md: 2 }}>
          <Card sx={{ bgcolor: 'error.50' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4" fontWeight="bold" color="error.main">
                {queueStats.failed}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Failed
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ bgcolor: 'info.50' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                <Typography variant="h4" fontWeight="bold" color="info.main">
                  {availableNodes}
                </Typography>
                <Typography variant="body2" color="text.secondary">/</Typography>
                <Typography variant="h5" color="text.secondary">
                  {nodeStatuses.length}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                Nodes Available
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Node Status */}
      {nodeStatuses.length > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            Render Nodes
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {nodeStatuses.map(node => (
              <Chip
                key={node.nodeId}
                icon={node.busy ? <Movie fontSize="small" /> : <Computer fontSize="small" />}
                label={`${node.nodeName}${node.busy ? ' (Rendering)' : ''}`}
                color={node.busy ? 'primary' : 'default'}
                variant={node.busy ? 'filled' : 'outlined'}
              />
            ))}
          </Box>
        </Paper>
      )}

      {/* No nodes warning */}
      {nodeStatuses.length === 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          No ComfyUI nodes available. Please configure ComfyUI nodes in Settings to enable video rendering.
        </Alert>
      )}

      {/* Empty state */}
      {renderQueue.length === 0 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Movie sx={{ fontSize: 60, color: 'grey.400', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No Render Jobs
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Video render jobs will appear here when you generate HoloCine scenes or shots with video prompts.
          </Typography>
        </Paper>
      )}

      {/* Jobs Table */}
      {renderQueue.length > 0 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.100' }}>
                <TableCell width={40}></TableCell>
                <TableCell>Job</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Progress</TableCell>
                <TableCell>Node</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {renderQueue.map((job) => (
                <React.Fragment key={job.id}>
                  <TableRow
                    sx={{
                      '&:hover': { bgcolor: 'grey.50' },
                      ...(job.status === 'failed' && { bgcolor: 'error.50' })
                    }}
                  >
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={() => toggleJobExpansion(job.id)}
                      >
                        {expandedJobs.has(job.id) ? <ExpandLess /> : <ExpandMore />}
                      </IconButton>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {job.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Story: {job.storyId.slice(0, 8)}...
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={job.type === 'holocine_scene' ? 'Scene' : 'Shot'}
                        variant="outlined"
                        color={job.type === 'holocine_scene' ? 'secondary' : 'default'}
                      />
                    </TableCell>
                    <TableCell>{getStatusChip(job.status)}</TableCell>
                    <TableCell sx={{ minWidth: 150 }}>
                      {(job.status === 'rendering' || job.status === 'assigned') && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <LinearProgress
                            variant="determinate"
                            value={job.progress}
                            sx={{ flex: 1 }}
                          />
                          <Typography variant="caption" sx={{ minWidth: 40 }}>
                            {job.progress.toFixed(0)}%
                          </Typography>
                        </Box>
                      )}
                      {job.status === 'completed' && (
                        <Typography variant="caption" color="success.main">
                          Done
                        </Typography>
                      )}
                      {job.status === 'failed' && (
                        <Typography variant="caption" color="error.main">
                          Attempt {job.attempts}/{job.maxAttempts}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {job.assignedNode ? (
                        <Chip
                          size="small"
                          icon={<Computer fontSize="small" />}
                          label={nodeStatuses.find(n => n.nodeId === job.assignedNode)?.nodeName || job.assignedNode.slice(0, 8)}
                          variant="outlined"
                        />
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          --
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                        {job.status === 'queued' && (
                          <Tooltip title="Start now">
                            <IconButton
                              size="small"
                              onClick={() => handleStartJob(job.id)}
                              color="primary"
                            >
                              <PlayArrow fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {job.status === 'failed' && (
                          <Tooltip title="Retry">
                            <IconButton
                              size="small"
                              onClick={() => handleRetryJob(job.id)}
                              color="warning"
                            >
                              <Replay fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {job.outputUrl && (
                          <Tooltip title="Preview">
                            <IconButton
                              size="small"
                              onClick={() => setPreviewUrl(job.outputUrl!)}
                              color="info"
                            >
                              <Visibility fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Remove">
                          <IconButton
                            size="small"
                            onClick={() => removeRenderJob(job.id)}
                            color="error"
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>

                  {/* Expanded details */}
                  <TableRow>
                    <TableCell colSpan={7} sx={{ p: 0, borderBottom: 0 }}>
                      <Collapse in={expandedJobs.has(job.id)} timeout="auto" unmountOnExit>
                        <Box sx={{ p: 2, bgcolor: 'grey.50' }}>
                          <Grid container spacing={2}>
                            <Grid size={{ xs: 12, md: 6 }}>
                              <Typography variant="caption" color="text.secondary">
                                Positive Prompt:
                              </Typography>
                              <Paper sx={{ p: 1, mt: 0.5, maxHeight: 100, overflow: 'auto' }}>
                                <Typography variant="body2" sx={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                                  {job.positivePrompt.slice(0, 500)}{job.positivePrompt.length > 500 ? '...' : ''}
                                </Typography>
                              </Paper>
                            </Grid>
                            <Grid size={{ xs: 12, md: 3 }}>
                              <Typography variant="caption" color="text.secondary">
                                Settings:
                              </Typography>
                              <Paper sx={{ p: 1, mt: 0.5 }}>
                                <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                                  Workflow: {job.settings.workflow}<br />
                                  Frames: {job.settings.numFrames}<br />
                                  FPS: {job.settings.fps}<br />
                                  Resolution: {job.settings.resolution}
                                </Typography>
                              </Paper>
                            </Grid>
                            <Grid size={{ xs: 12, md: 3 }}>
                              {job.error && (
                                <>
                                  <Typography variant="caption" color="error.main">
                                    Error:
                                  </Typography>
                                  <Paper sx={{ p: 1, mt: 0.5, bgcolor: 'error.50' }}>
                                    <Typography variant="body2" sx={{ fontSize: '0.75rem' }} color="error">
                                      {job.error}
                                    </Typography>
                                  </Paper>
                                </>
                              )}
                              {job.outputUrl && (
                                <>
                                  <Typography variant="caption" color="success.main">
                                    Output:
                                  </Typography>
                                  <Paper sx={{ p: 1, mt: 0.5, bgcolor: 'success.50' }}>
                                    <Typography variant="body2" sx={{ fontSize: '0.75rem' }} noWrap>
                                      {job.outputUrl}
                                    </Typography>
                                  </Paper>
                                </>
                              )}
                            </Grid>
                          </Grid>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Clear All Confirmation Dialog */}
      <Dialog open={confirmClearDialog} onClose={() => setConfirmClearDialog(false)}>
        <DialogTitle>Clear All Render Jobs?</DialogTitle>
        <DialogContent>
          <Typography>
            This will remove all {queueStats.total} render jobs from the queue, including any that are currently rendering.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClearDialog(false)}>Cancel</Button>
          <Button
            onClick={() => {
              clearAllRenderJobs();
              setConfirmClearDialog(false);
            }}
            color="error"
            variant="contained"
          >
            Clear All
          </Button>
        </DialogActions>
      </Dialog>

      {/* Video Preview Dialog */}
      <Dialog open={!!previewUrl} onClose={() => setPreviewUrl(null)} maxWidth="md" fullWidth>
        <DialogTitle>Video Preview</DialogTitle>
        <DialogContent>
          {previewUrl && (
            <video
              src={previewUrl}
              controls
              autoPlay
              style={{ width: '100%', maxHeight: '60vh' }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewUrl(null)}>Close</Button>
          {previewUrl && (
            <Button
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              variant="contained"
            >
              Open in New Tab
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RenderQueue;
