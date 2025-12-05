import React, { useState } from 'react';
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
} from '@mui/material';
import {
  PlayArrow,
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
} from '@mui/icons-material';
import { EnhancedStory, EnhancedShot } from '../../types/storyTypes';

interface ShotlistTabProps {
  storyData: EnhancedStory | null;
  onUpdateShot: (shotId: string, updates: Partial<EnhancedShot>) => void;
}

// Extended shot type to include part information
interface ExtendedShot extends EnhancedShot {
  partNumber?: number;
  partTitle?: string;
}

const ShotlistTab: React.FC<ShotlistTabProps> = ({ storyData, onUpdateShot }) => {
  const [expandedShot, setExpandedShot] = useState<string | null>(null);
  const [selectedShot, setSelectedShot] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);

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

  const handleCopyPrompt = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPrompt(type);
    setTimeout(() => setCopiedPrompt(null), 2000);
  };

  const getStatusIcon = (status: EnhancedShot['renderStatus']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle color="success" fontSize="small" />;
      case 'rendering':
      case 'prompt-generated':
        return <Pending color="primary" fontSize="small" />;
      case 'failed':
        return <ErrorIcon color="error" fontSize="small" />;
      default:
        return <Pending color="disabled" fontSize="small" />;
    }
  };

  const getStatusColor = (status: EnhancedShot['renderStatus']) => {
    switch (status) {
      case 'completed': return 'success';
      case 'rendering': return 'primary';
      case 'prompt-generated': return 'info';
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  const calculateProgress = () => {
    if (storyData.shots.length === 0) return 0;
    const completedShots = storyData.shots.filter(s => s.renderStatus === 'completed').length;
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
      {/* Shotlist Overview */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Master Shotlist</Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {storyData.shots.length} shots
              </Typography>
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

          {/* Quick Stats */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 3 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" color="success.main">
                  {storyData.shots.filter(s => s.renderStatus === 'completed').length}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Completed
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 3 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" color="primary.main">
                  {storyData.shots.filter(s => s.renderStatus === 'rendering' || s.renderStatus === 'prompt-generated').length}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  In Progress
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 3 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" color="text.secondary">
                  {storyData.shots.filter(s => s.renderStatus === 'pending').length}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Pending
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 3 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" color="error.main">
                  {storyData.shots.filter(s => s.renderStatus === 'failed').length}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Failed
                </Typography>
              </Box>
            </Grid>
          </Grid>
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
                      <Chip
                        size="small"
                        label={shot.renderStatus.replace('-', ' ')}
                        color={getStatusColor(shot.renderStatus)}
                        icon={getStatusIcon(shot.renderStatus)}
                      />
                      <IconButton size="small">
                        <Edit fontSize="small" />
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
                        <Box sx={{ mt: 1, display: 'flex', gap: 1, justifyContent: 'center' }}>
                          {shot.renderStatus === 'pending' && shot.comfyUIPositivePrompt && (
                            <Button size="small" variant="contained" startIcon={<PlayArrow />}>
                              Render Shot
                            </Button>
                          )}
                          {shot.renderStatus === 'completed' && (
                            <Button size="small" variant="outlined" startIcon={<Preview />}>
                              Full Preview
                            </Button>
                          )}
                          {shot.renderStatus === 'failed' && (
                            <Button size="small" variant="outlined" color="error" startIcon={<Refresh />}>
                              Retry Render
                            </Button>
                          )}
                        </Box>
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
    </Box>
  );
};

export default ShotlistTab;
