import React, { useState, useMemo, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Paper,
  Chip,
  IconButton,
  Button,
  Divider,
  Collapse,
  List,
  ListItem,
  ListItemText,
  Alert,
  Tooltip,
  LinearProgress,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  alpha,
  CircularProgress,
  Snackbar,
} from '@mui/material';
import {
  ExpandMore,
  ContentCopy,
  Movie,
  Person,
  LocationOn,
  Edit,
  Check,
  Close,
  Timer,
  Refresh,
  Download,
  Warning,
  Send,
  Computer,
  CheckCircle,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { HoloCineScene } from '../../store/useStore';
import { buildRawPromptString, checkTokenLimits, DEFAULT_HOLOCINE_GENERATION_SETTINGS } from '../../types/holocineTypes';
import { comfyUIRenderService, ComfyUIQueueItem } from '../../services/comfyUIRenderService';

interface ScenesTabProps {
  scenes: HoloCineScene[];
  characterMap?: Record<string, string>;
  storyId: string;
  onUpdateScene?: (sceneId: string, updates: Partial<HoloCineScene>) => void;
  onRegenerateScenes?: () => void;
  onExportScenes?: () => void;
}

const ScenesTab: React.FC<ScenesTabProps> = ({
  scenes,
  characterMap,
  storyId,
  onUpdateScene,
  onRegenerateScenes,
  onExportScenes,
}) => {
  const [expandedScene, setExpandedScene] = useState<string | null>(null);
  const [editingScene, setEditingScene] = useState<string | null>(null);
  const [editedGlobalCaption, setEditedGlobalCaption] = useState('');
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [selectedExportFormat, setSelectedExportFormat] = useState<'raw' | 'structured'>('raw');

  // ComfyUI render state
  const [comfyUIAvailable, setComfyUIAvailable] = useState(false);
  const [renderQueue, setRenderQueue] = useState<ComfyUIQueueItem[]>([]);
  const [sendingScene, setSendingScene] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false,
    message: '',
    severity: 'info'
  });

  // Check ComfyUI availability on mount
  useEffect(() => {
    setComfyUIAvailable(comfyUIRenderService.isAvailable());
    // Refresh queue items
    setRenderQueue(comfyUIRenderService.getAllQueueItems());
  }, [scenes]);

  // Handle sending a single scene to ComfyUI
  const handleSendToComfyUI = async (scene: HoloCineScene) => {
    if (!comfyUIAvailable) {
      setSnackbar({
        open: true,
        message: 'No ComfyUI instance available. Please configure ComfyUI in Settings.',
        severity: 'error'
      });
      return;
    }

    setSendingScene(scene.id);
    try {
      await comfyUIRenderService.queueScene(
        scene,
        DEFAULT_HOLOCINE_GENERATION_SETTINGS
      );
      setRenderQueue(comfyUIRenderService.getAllQueueItems());
      setSnackbar({
        open: true,
        message: `Scene ${scene.sceneNumber} "${scene.title}" sent to ComfyUI`,
        severity: 'success'
      });
    } catch (error: any) {
      setSnackbar({
        open: true,
        message: `Failed to send scene: ${error.message}`,
        severity: 'error'
      });
    } finally {
      setSendingScene(null);
    }
  };

  // Handle sending all scenes to ComfyUI
  const handleSendAllToComfyUI = async () => {
    if (!comfyUIAvailable) {
      setSnackbar({
        open: true,
        message: 'No ComfyUI instance available. Please configure ComfyUI in Settings.',
        severity: 'error'
      });
      return;
    }

    const readyScenes = scenes.filter(s => s.status !== 'generating' && s.status !== 'completed');
    if (readyScenes.length === 0) {
      setSnackbar({
        open: true,
        message: 'No scenes ready for rendering',
        severity: 'info'
      });
      return;
    }

    setSendingScene('all');
    try {
      const results = await comfyUIRenderService.queueScenes(
        readyScenes,
        DEFAULT_HOLOCINE_GENERATION_SETTINGS
      );
      setRenderQueue(comfyUIRenderService.getAllQueueItems());
      const successful = results.filter(r => r.status !== 'failed').length;
      setSnackbar({
        open: true,
        message: `${successful} of ${readyScenes.length} scenes queued for rendering`,
        severity: successful > 0 ? 'success' : 'error'
      });
    } catch (error: any) {
      setSnackbar({
        open: true,
        message: `Failed to queue scenes: ${error.message}`,
        severity: 'error'
      });
    } finally {
      setSendingScene(null);
    }
  };

  // Get render status for a scene
  const getSceneRenderStatus = (sceneId: string): ComfyUIQueueItem | undefined => {
    return renderQueue.find(item => item.sceneId === sceneId);
  };

  // Calculate statistics
  const stats = useMemo(() => {
    const totalDuration = scenes.reduce((sum, s) => sum + s.estimatedDuration, 0);
    const totalShots = scenes.reduce((sum, s) => sum + s.shotCaptions.length, 0);
    const completedScenes = scenes.filter(s => s.status === 'completed').length;
    const uniqueCharacters = new Set(scenes.flatMap(s => s.characters.map(c => c.name)));

    return {
      totalDuration,
      totalShots,
      completedScenes,
      uniqueCharacters: uniqueCharacters.size,
    };
  }, [scenes]);

  const handleCopy = (text: string, itemId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(itemId);
    setTimeout(() => setCopiedItem(null), 2000);
  };

  const handleExpandScene = (sceneId: string) => {
    setExpandedScene(expandedScene === sceneId ? null : sceneId);
  };

  const handleEditScene = (scene: HoloCineScene) => {
    setEditingScene(scene.id);
    setEditedGlobalCaption(scene.globalCaption);
  };

  const handleSaveEdit = (sceneId: string) => {
    if (onUpdateScene) {
      onUpdateScene(sceneId, { globalCaption: editedGlobalCaption });
    }
    setEditingScene(null);
  };

  const handleCancelEdit = () => {
    setEditingScene(null);
    setEditedGlobalCaption('');
  };

  const getStatusColor = (status: HoloCineScene['status']) => {
    switch (status) {
      case 'completed': return 'success';
      case 'generating': return 'primary';
      case 'ready': return 'info';
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  const getSceneRawPrompt = (scene: HoloCineScene): string => {
    return buildRawPromptString(scene.globalCaption, scene.shotCaptions);
  };

  const getSceneStructuredPrompt = (scene: HoloCineScene): string => {
    return JSON.stringify({
      global_caption: scene.globalCaption,
      shot_captions: scene.shotCaptions,
      num_frames: scene.numFrames,
      shot_cut_frames: scene.shotCutFrames,
    }, null, 2);
  };

  // Validate token usage for a scene
  const getTokenValidation = (scene: HoloCineScene) => {
    return checkTokenLimits(scene.globalCaption, scene.shotCaptions);
  };

  if (!scenes || scenes.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Movie sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No HoloCine Scenes Available
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Scenes will be organized automatically after shots and prompts are generated.
        </Typography>
        {onRegenerateScenes && (
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={onRegenerateScenes}
          >
            Generate Scenes
          </Button>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      {/* Overview Card */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box>
              <Typography variant="h6">HoloCine Scenes</Typography>
              <Typography variant="body2" color="text.secondary">
                Multi-shot video sequences for HoloCine generation
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {onRegenerateScenes && (
                <Button size="small" startIcon={<Refresh />} onClick={onRegenerateScenes}>
                  Regenerate
                </Button>
              )}
              <Button
                size="small"
                variant="contained"
                startIcon={<Download />}
                onClick={() => setExportDialogOpen(true)}
              >
                Export All
              </Button>
              <Tooltip title={comfyUIAvailable ? 'Queue all scenes for rendering in ComfyUI' : 'Configure ComfyUI in Settings first'}>
                <span>
                  <Button
                    size="small"
                    variant="contained"
                    color="secondary"
                    startIcon={sendingScene === 'all' ? <CircularProgress size={16} color="inherit" /> : <Send />}
                    onClick={handleSendAllToComfyUI}
                    disabled={!comfyUIAvailable || sendingScene !== null}
                  >
                    Send to ComfyUI
                  </Button>
                </span>
              </Tooltip>
            </Box>
          </Box>

          {/* Stats Grid */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 3 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h4" color="primary.main">
                  {scenes.length}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Scenes
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 3 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h4" color="secondary.main">
                  {stats.totalShots}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Total Shots
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 3 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h4" color="info.main">
                  {Math.round(stats.totalDuration)}s
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Duration
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 3 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h4" color="success.main">
                  {stats.uniqueCharacters}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Characters
                </Typography>
              </Box>
            </Grid>
          </Grid>

          {/* Character Map */}
          {characterMap && Object.keys(characterMap).length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Character References
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {Object.entries(characterMap).map(([charId, ref]) => {
                  const charName = scenes
                    .flatMap(s => s.characters)
                    .find(c => c.id === charId)?.name || charId;
                  return (
                    <Chip
                      key={charId}
                      size="small"
                      icon={<Person />}
                      label={`${ref} = ${charName}`}
                      variant="outlined"
                    />
                  );
                })}
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ComfyUI Status Alert */}
      {!comfyUIAvailable && (
        <Alert severity="info" sx={{ mb: 2 }} icon={<Computer />}>
          <Typography variant="body2">
            <strong>ComfyUI not configured.</strong> Go to Settings → ComfyUI Video Generation to add a ComfyUI instance for HoloCine rendering.
          </Typography>
        </Alert>
      )}

      {/* Scene Cards */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {scenes.map((scene) => {
          const tokenValidation = getTokenValidation(scene);
          const rawPrompt = getSceneRawPrompt(scene);
          const structuredPrompt = getSceneStructuredPrompt(scene);
          const renderStatus = getSceneRenderStatus(scene.id);

          return (
            <Card
              key={scene.id}
              sx={{
                border: expandedScene === scene.id ? 2 : 1,
                borderColor: expandedScene === scene.id ? 'primary.main' : 'divider',
              }}
            >
              <CardContent>
                {/* Scene Header */}
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Chip
                      label={`Scene ${scene.sceneNumber}`}
                      color="primary"
                      size="small"
                      icon={<Movie />}
                    />
                    <Box>
                      <Typography variant="h6">{scene.title}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {scene.shotCaptions.length} shots • {Math.round(scene.estimatedDuration)}s •{' '}
                        {scene.primaryLocation}
                      </Typography>
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {/* Render Status Indicator */}
                    {renderStatus && (
                      <Tooltip title={
                        renderStatus.status === 'running'
                          ? `Rendering: ${renderStatus.progress.toFixed(0)}%`
                          : renderStatus.status === 'completed'
                          ? 'Render completed'
                          : renderStatus.status === 'failed'
                          ? `Failed: ${renderStatus.error}`
                          : 'Queued for rendering'
                      }>
                        {renderStatus.status === 'running' ? (
                          <CircularProgress size={20} variant="determinate" value={renderStatus.progress} />
                        ) : renderStatus.status === 'completed' ? (
                          <CheckCircle color="success" fontSize="small" />
                        ) : renderStatus.status === 'failed' ? (
                          <ErrorIcon color="error" fontSize="small" />
                        ) : (
                          <Computer color="info" fontSize="small" />
                        )}
                      </Tooltip>
                    )}
                    {!tokenValidation.isValid && (
                      <Tooltip title={`Exceeds token limit by ${tokenValidation.excess} tokens`}>
                        <Warning color="warning" />
                      </Tooltip>
                    )}
                    {/* Send to ComfyUI button for individual scene */}
                    <Tooltip title={comfyUIAvailable ? 'Send to ComfyUI' : 'Configure ComfyUI first'}>
                      <span>
                        <IconButton
                          size="small"
                          color="secondary"
                          onClick={() => handleSendToComfyUI(scene)}
                          disabled={!comfyUIAvailable || sendingScene !== null || renderStatus?.status === 'running'}
                        >
                          {sendingScene === scene.id ? (
                            <CircularProgress size={18} color="inherit" />
                          ) : (
                            <Send fontSize="small" />
                          )}
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Chip
                      size="small"
                      label={scene.status}
                      color={getStatusColor(scene.status)}
                    />
                    <IconButton
                      size="small"
                      onClick={() => handleExpandScene(scene.id)}
                    >
                      <ExpandMore
                        sx={{
                          transform: expandedScene === scene.id ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s',
                        }}
                      />
                    </IconButton>
                  </Box>
                </Box>

                {/* Quick Info */}
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 2 }}>
                  {scene.characters.map((char) => (
                    <Chip
                      key={char.id}
                      size="small"
                      icon={<Person />}
                      label={`${char.holoCineRef} ${char.name}`}
                      variant="outlined"
                    />
                  ))}
                  <Chip
                    size="small"
                    icon={<LocationOn />}
                    label={scene.primaryLocation}
                    variant="outlined"
                  />
                  <Chip
                    size="small"
                    icon={<Timer />}
                    label={`${scene.numFrames} frames`}
                    variant="outlined"
                  />
                </Box>

                {/* Expanded Content */}
                <Collapse in={expandedScene === scene.id}>
                  <Divider sx={{ my: 2 }} />

                  <Grid container spacing={3}>
                    {/* Global Caption */}
                    <Grid size={{ xs: 12 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="subtitle2">Global Caption</Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          {editingScene !== scene.id ? (
                            <>
                              <Tooltip title={copiedItem === `${scene.id}-global` ? 'Copied!' : 'Copy'}>
                                <IconButton
                                  size="small"
                                  onClick={() => handleCopy(scene.globalCaption, `${scene.id}-global`)}
                                >
                                  <ContentCopy fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              {onUpdateScene && (
                                <IconButton size="small" onClick={() => handleEditScene(scene)}>
                                  <Edit fontSize="small" />
                                </IconButton>
                              )}
                            </>
                          ) : (
                            <>
                              <IconButton size="small" color="success" onClick={() => handleSaveEdit(scene.id)}>
                                <Check fontSize="small" />
                              </IconButton>
                              <IconButton size="small" color="error" onClick={handleCancelEdit}>
                                <Close fontSize="small" />
                              </IconButton>
                            </>
                          )}
                        </Box>
                      </Box>

                      {editingScene === scene.id ? (
                        <TextField
                          fullWidth
                          multiline
                          rows={4}
                          value={editedGlobalCaption}
                          onChange={(e) => setEditedGlobalCaption(e.target.value)}
                          variant="outlined"
                          size="small"
                        />
                      ) : (
                        <Paper
                          sx={{
                            p: 2,
                            bgcolor: theme => alpha(theme.palette.primary.main, 0.05),
                            border: '1px solid',
                            borderColor: theme => alpha(theme.palette.primary.main, 0.2),
                          }}
                        >
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                            {scene.globalCaption}
                          </Typography>
                        </Paper>
                      )}
                    </Grid>

                    {/* Shot Captions */}
                    <Grid size={{ xs: 12 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Shot Captions ({scene.shotCaptions.length})
                      </Typography>
                      <List dense sx={{ bgcolor: 'background.paper', borderRadius: 1 }}>
                        {scene.shotCaptions.map((caption, index) => (
                          <ListItem
                            key={index}
                            sx={{
                              borderBottom: index < scene.shotCaptions.length - 1 ? '1px solid' : 'none',
                              borderColor: 'divider',
                            }}
                            secondaryAction={
                              <Tooltip title={copiedItem === `${scene.id}-shot-${index}` ? 'Copied!' : 'Copy'}>
                                <IconButton
                                  size="small"
                                  onClick={() => handleCopy(caption, `${scene.id}-shot-${index}`)}
                                >
                                  <ContentCopy fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            }
                          >
                            <ListItemText
                              primary={
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Chip
                                    size="small"
                                    label={index === 0 ? 'Start' : `Cut ${index}`}
                                    color={index === 0 ? 'primary' : 'default'}
                                    sx={{ minWidth: 60 }}
                                  />
                                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                    {caption}
                                  </Typography>
                                </Box>
                              }
                            />
                          </ListItem>
                        ))}
                      </List>
                    </Grid>

                    {/* Export Prompts */}
                    <Grid size={{ xs: 12, md: 6 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="subtitle2">Raw String Format</Typography>
                        <Tooltip title={copiedItem === `${scene.id}-raw` ? 'Copied!' : 'Copy Raw'}>
                          <IconButton
                            size="small"
                            onClick={() => handleCopy(rawPrompt, `${scene.id}-raw`)}
                          >
                            <ContentCopy fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                      <Paper
                        sx={{
                          p: 2,
                          bgcolor: theme => alpha(theme.palette.grey[500], 0.1),
                          maxHeight: 200,
                          overflow: 'auto',
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap' }}
                        >
                          {rawPrompt}
                        </Typography>
                      </Paper>
                    </Grid>

                    <Grid size={{ xs: 12, md: 6 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="subtitle2">Structured JSON</Typography>
                        <Tooltip title={copiedItem === `${scene.id}-json` ? 'Copied!' : 'Copy JSON'}>
                          <IconButton
                            size="small"
                            onClick={() => handleCopy(structuredPrompt, `${scene.id}-json`)}
                          >
                            <ContentCopy fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                      <Paper
                        sx={{
                          p: 2,
                          bgcolor: theme => alpha(theme.palette.grey[500], 0.1),
                          maxHeight: 200,
                          overflow: 'auto',
                        }}
                      >
                        <Typography
                          variant="body2"
                          component="pre"
                          sx={{ fontFamily: 'monospace', fontSize: '0.75rem', margin: 0 }}
                        >
                          {structuredPrompt}
                        </Typography>
                      </Paper>
                    </Grid>

                    {/* Token Usage */}
                    <Grid size={{ xs: 12 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                          Token Usage: {tokenValidation.totalTokens} / 512
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min((tokenValidation.totalTokens / 512) * 100, 100)}
                          color={tokenValidation.isValid ? 'primary' : 'error'}
                          sx={{ flex: 1, height: 8, borderRadius: 4 }}
                        />
                        {!tokenValidation.isValid && (
                          <Chip
                            size="small"
                            color="error"
                            label={`${tokenValidation.excess} over limit`}
                          />
                        )}
                      </Box>
                    </Grid>
                  </Grid>
                </Collapse>
              </CardContent>
            </Card>
          );
        })}
      </Box>

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onClose={() => setExportDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Export HoloCine Scenes</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <Button
              variant={selectedExportFormat === 'raw' ? 'contained' : 'outlined'}
              onClick={() => setSelectedExportFormat('raw')}
            >
              Raw String Format
            </Button>
            <Button
              variant={selectedExportFormat === 'structured' ? 'contained' : 'outlined'}
              onClick={() => setSelectedExportFormat('structured')}
            >
              Structured JSON
            </Button>
          </Box>

          <Paper sx={{ p: 2, maxHeight: 400, overflow: 'auto', bgcolor: 'grey.900' }}>
            <Typography
              variant="body2"
              component="pre"
              sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'grey.100', margin: 0 }}
            >
              {selectedExportFormat === 'raw'
                ? scenes.map(s => `--- Scene ${s.sceneNumber}: ${s.title} ---\n${getSceneRawPrompt(s)}`).join('\n\n')
                : JSON.stringify(
                    scenes.map(s => ({
                      scene_number: s.sceneNumber,
                      title: s.title,
                      global_caption: s.globalCaption,
                      shot_captions: s.shotCaptions,
                      num_frames: s.numFrames,
                      shot_cut_frames: s.shotCutFrames,
                    })),
                    null,
                    2
                  )
              }
            </Typography>
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportDialogOpen(false)}>Close</Button>
          <Button
            variant="contained"
            startIcon={<ContentCopy />}
            onClick={() => {
              const content = selectedExportFormat === 'raw'
                ? scenes.map(s => `--- Scene ${s.sceneNumber}: ${s.title} ---\n${getSceneRawPrompt(s)}`).join('\n\n')
                : JSON.stringify(
                    scenes.map(s => ({
                      scene_number: s.sceneNumber,
                      title: s.title,
                      global_caption: s.globalCaption,
                      shot_captions: s.shotCaptions,
                      num_frames: s.numFrames,
                      shot_cut_frames: s.shotCutFrames,
                    })),
                    null,
                    2
                  );
              navigator.clipboard.writeText(content);
              setCopiedItem('export-all');
              setTimeout(() => setCopiedItem(null), 2000);
            }}
          >
            {copiedItem === 'export-all' ? 'Copied!' : 'Copy All'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
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

export default ScenesTab;
