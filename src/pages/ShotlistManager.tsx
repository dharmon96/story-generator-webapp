/**
 * Shotlist Manager Page
 *
 * Main page for managing standalone shotlists.
 * Features:
 * - List all shotlists with thumbnails and stats
 * - Create new shotlists
 * - Open shotlist editor
 * - Delete shotlists
 * - Quick stats for render progress
 */

import React, { useState, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  IconButton,
  Grid,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Tooltip,
  LinearProgress,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Alert,
} from '@mui/material';
import {
  Add,
  Delete,
  Edit,
  Movie,
  Videocam,
  MoreVert,
  ContentCopy,
  Folder,
  CheckCircle,
  HourglassEmpty,
  Error as ErrorIcon,
  PlayArrow,
  Queue as QueueIcon,
} from '@mui/icons-material';
import { useStore } from '../store/useStore';
import { Shotlist, calculateShotlistStats } from '../types/shotlistTypes';

interface ShotlistManagerProps {
  onOpenShotlist?: (shotlistId: string) => void;
}

const ShotlistManager: React.FC<ShotlistManagerProps> = ({ onOpenShotlist }) => {
  const { shotlists, addShotlist, deleteShotlist } = useStore();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedShotlist, setSelectedShotlist] = useState<string | null>(null);
  const [newShotlistTitle, setNewShotlistTitle] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<{ anchor: HTMLElement | null; shotlistId: string | null }>({
    anchor: null,
    shotlistId: null,
  });

  // Calculate overall stats
  const overallStats = useMemo(() => {
    let totalShots = 0;
    let completedShots = 0;
    let renderingShots = 0;
    let queuedShots = 0;

    shotlists.forEach((sl) => {
      const stats = calculateShotlistStats(sl.shots);
      totalShots += stats.total;
      completedShots += stats.completed;
      renderingShots += stats.rendering;
      queuedShots += stats.queued;
    });

    return { totalShots, completedShots, renderingShots, queuedShots };
  }, [shotlists]);

  // Handle create new shotlist
  const handleCreateShotlist = () => {
    const title = newShotlistTitle.trim() || 'New Shotlist';
    const newShotlist = addShotlist({ title });
    setNewShotlistTitle('');
    setCreateDialogOpen(false);

    // Open the new shotlist for editing
    if (onOpenShotlist) {
      onOpenShotlist(newShotlist.id);
    }
  };

  // Handle delete shotlist
  const handleDeleteShotlist = () => {
    if (selectedShotlist) {
      deleteShotlist(selectedShotlist);
    }
    setSelectedShotlist(null);
    setDeleteDialogOpen(false);
  };

  // Handle menu open
  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, shotlistId: string) => {
    event.stopPropagation();
    setMenuAnchor({ anchor: event.currentTarget, shotlistId });
  };

  const handleMenuClose = () => {
    setMenuAnchor({ anchor: null, shotlistId: null });
  };

  // Handle duplicate shotlist
  const handleDuplicateShotlist = (shotlistId: string) => {
    const original = shotlists.find((sl) => sl.id === shotlistId);
    if (original) {
      addShotlist({
        title: `${original.title} (Copy)`,
        description: original.description,
        defaultWorkflowType: original.defaultWorkflowType,
        defaultGenerationMethod: original.defaultGenerationMethod,
        defaultSettings: { ...original.defaultSettings },
        defaultNegativePrompt: original.defaultNegativePrompt,
        // Note: shots and groups are NOT copied - it's a new empty shotlist with same settings
      });
    }
    handleMenuClose();
  };

  // Get render progress for a shotlist
  const getRenderProgress = (shotlist: Shotlist) => {
    const stats = calculateShotlistStats(shotlist.shots);
    if (stats.total === 0) return 0;
    return (stats.completed / stats.total) * 100;
  };

  // Get status chip for shotlist
  const getStatusChip = (shotlist: Shotlist) => {
    const stats = calculateShotlistStats(shotlist.shots);

    if (stats.total === 0) {
      return <Chip label="Empty" size="small" color="default" />;
    }
    if (stats.completed === stats.total) {
      return <Chip label="Complete" size="small" color="success" icon={<CheckCircle />} />;
    }
    if (stats.rendering > 0) {
      return <Chip label={`${stats.rendering} rendering`} size="small" color="primary" icon={<Movie />} />;
    }
    if (stats.queued > 0) {
      return <Chip label={`${stats.queued} queued`} size="small" color="warning" icon={<QueueIcon />} />;
    }
    if (stats.failed > 0) {
      return <Chip label={`${stats.failed} failed`} size="small" color="error" icon={<ErrorIcon />} />;
    }
    return <Chip label="Ready" size="small" color="default" icon={<HourglassEmpty />} />;
  };

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
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Videocam />
              Shotlist Manager
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.5 }}>
              Create and manage standalone shotlists for video generation
            </Typography>
          </Box>

          {/* Quick Stats */}
          <Box sx={{ display: 'flex', gap: 3 }}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h4" fontWeight="bold">{shotlists.length}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>Shotlists</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.3)', pl: 3 }}>
              <Typography variant="h4" fontWeight="bold">{overallStats.totalShots}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>Total Shots</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.3)', pl: 3 }}>
              <Typography variant="h4" fontWeight="bold" sx={{ color: '#a5d6a7' }}>
                {overallStats.completedShots}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>Rendered</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.3)', pl: 3 }}>
              <Typography variant="h4" fontWeight="bold" sx={{ color: '#90caf9' }}>
                {overallStats.renderingShots + overallStats.queuedShots}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>In Progress</Typography>
            </Box>
          </Box>

          {/* Create Button */}
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setCreateDialogOpen(true)}
            sx={{
              bgcolor: 'rgba(255,255,255,0.2)',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' },
            }}
          >
            New Shotlist
          </Button>
        </Box>
      </Paper>

      {/* Shotlists Grid */}
      {shotlists.length === 0 ? (
        <Alert severity="info" sx={{ mt: 3 }}>
          <Typography variant="body1" gutterBottom>
            <strong>No shotlists yet!</strong>
          </Typography>
          <Typography variant="body2">
            Create a new shotlist to start organizing your shots. Each shotlist can contain
            multiple shots with individual generation settings, organized into groups.
          </Typography>
          <Button
            variant="outlined"
            startIcon={<Add />}
            onClick={() => setCreateDialogOpen(true)}
            sx={{ mt: 2 }}
          >
            Create Your First Shotlist
          </Button>
        </Alert>
      ) : (
        <Grid container spacing={3}>
          {shotlists.map((shotlist) => {
            const stats = calculateShotlistStats(shotlist.shots);
            const progress = getRenderProgress(shotlist);

            return (
              <Grid key={shotlist.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                <Card
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: 6,
                    },
                  }}
                  onClick={() => onOpenShotlist?.(shotlist.id)}
                >
                  {/* Thumbnail / Preview Area */}
                  <Box
                    sx={{
                      height: 120,
                      bgcolor: 'grey.200',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    {/* TODO: Show actual thumbnail from first rendered shot */}
                    <Folder sx={{ fontSize: 48, color: 'grey.400' }} />

                    {/* Progress overlay */}
                    {stats.total > 0 && (
                      <Box
                        sx={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                        }}
                      >
                        <LinearProgress
                          variant="determinate"
                          value={progress}
                          sx={{ height: 4 }}
                          color={progress === 100 ? 'success' : 'primary'}
                        />
                      </Box>
                    )}

                    {/* Menu button */}
                    <IconButton
                      size="small"
                      sx={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        bgcolor: 'rgba(255,255,255,0.8)',
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' },
                      }}
                      onClick={(e) => handleMenuOpen(e, shotlist.id)}
                    >
                      <MoreVert fontSize="small" />
                    </IconButton>
                  </Box>

                  <CardContent sx={{ flex: 1 }}>
                    <Typography variant="h6" noWrap gutterBottom>
                      {shotlist.title}
                    </Typography>

                    {shotlist.description && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          mb: 1,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {shotlist.description}
                      </Typography>
                    )}

                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                      {getStatusChip(shotlist)}
                      <Chip
                        label={`${stats.total} shot${stats.total !== 1 ? 's' : ''}`}
                        size="small"
                        variant="outlined"
                      />
                      {shotlist.groups.length > 0 && (
                        <Chip
                          label={`${shotlist.groups.length} group${shotlist.groups.length !== 1 ? 's' : ''}`}
                          size="small"
                          variant="outlined"
                        />
                      )}
                    </Box>

                    <Typography variant="caption" color="text.secondary">
                      Updated: {shotlist.updatedAt ? new Date(shotlist.updatedAt).toLocaleDateString() : 'Never'}
                    </Typography>
                  </CardContent>

                  <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        size="small"
                        startIcon={<Edit />}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenShotlist?.(shotlist.id);
                        }}
                      >
                        Edit
                      </Button>
                      <Tooltip title="Delete shotlist">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedShotlist(shotlist.id);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    {stats.pending > 0 && (
                      <Tooltip title="Queue all pending shots">
                        <Button
                          size="small"
                          color="primary"
                          startIcon={<PlayArrow />}
                          onClick={(e) => {
                            e.stopPropagation();
                            // TODO: Queue all pending shots
                          }}
                        >
                          Queue All
                        </Button>
                      </Tooltip>
                    )}
                  </CardActions>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Shotlist</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Shotlist Title"
            fullWidth
            value={newShotlistTitle}
            onChange={(e) => setNewShotlistTitle(e.target.value)}
            placeholder="My Shotlist"
            onKeyPress={(e) => e.key === 'Enter' && handleCreateShotlist()}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            You can add shots and configure settings after creating the shotlist.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateShotlist} variant="contained" startIcon={<Add />}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Shotlist?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this shotlist? This will also delete all shots and groups within it.
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteShotlist} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor.anchor}
        open={Boolean(menuAnchor.anchor)}
        onClose={handleMenuClose}
        onClick={handleMenuClose}
      >
        <MenuItem onClick={() => onOpenShotlist?.(menuAnchor.shotlistId!)}>
          <ListItemIcon><Edit fontSize="small" /></ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleDuplicateShotlist(menuAnchor.shotlistId!)}>
          <ListItemIcon><ContentCopy fontSize="small" /></ListItemIcon>
          <ListItemText>Duplicate Settings</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setSelectedShotlist(menuAnchor.shotlistId);
            setDeleteDialogOpen(true);
          }}
        >
          <ListItemIcon><Delete fontSize="small" color="error" /></ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>Delete</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default ShotlistManager;
