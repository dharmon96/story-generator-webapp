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
} from '@mui/icons-material';
import { EnhancedStory, EnhancedShot } from '../../types/storyTypes';

interface ShotlistTabProps {
  storyData: EnhancedStory | null;
  onUpdateShot: (shotId: string, updates: Partial<EnhancedShot>) => void;
}

const ShotlistTab: React.FC<ShotlistTabProps> = ({ storyData, onUpdateShot }) => {
  const [expandedShot, setExpandedShot] = useState<string | null>(null);
  const [selectedShot, setSelectedShot] = useState<string | null>(null);

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
        {storyData.shots.map((shot, index) => (
          <Card 
            key={shot.id} 
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
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
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
                  <Box>
                    <Typography variant="h6">
                      {shot.title || `Shot ${shot.shotNumber}`}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {shot.duration}s • {shot.shotType} • {shot.angle}
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
                    onClick={() => handleShotExpand(shot.id)}
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

              {/* Shot Description */}
              <Typography variant="body2" sx={{ mb: 2, lineHeight: 1.6 }}>
                {shot.description}
              </Typography>

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
                {shot.visualPrompt && (
                  <Chip 
                    size="small" 
                    icon={<Palette />} 
                    label="Visual Prompt"
                    variant="outlined"
                  />
                )}
                {shot.comfyUIPositivePrompt && (
                  <Chip 
                    size="small" 
                    icon={<Palette />} 
                    label="ComfyUI Ready"
                    variant="filled"
                    color="success"
                  />
                )}
              </Box>

              {/* Expanded Details */}
              <Collapse in={expandedShot === shot.id}>
                <Divider sx={{ my: 2 }} />
                <Grid container spacing={2}>
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

                  {/* Visual Prompts */}
                  {(shot.visualPrompt || shot.comfyUIPositivePrompt || shot.comfyUINegativePrompt) && (
                    <Grid size={{ xs: 12 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        AI Generation Prompts
                      </Typography>
                      
                      {shot.visualPrompt && (
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                            Base Visual Prompt:
                          </Typography>
                          <Paper sx={{ p: 2, backgroundColor: theme => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50', mb: 1, border: '1px solid', borderColor: theme => theme.palette.mode === 'dark' ? 'grey.700' : 'grey.300' }}>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                              {shot.visualPrompt}
                            </Typography>
                          </Paper>
                        </Box>
                      )}
                      
                      {shot.comfyUIPositivePrompt && (
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="caption" color="success.main" gutterBottom display="block">
                            ComfyUI Positive Prompt:
                          </Typography>
                          <Paper sx={{ 
                            p: 2, 
                            backgroundColor: theme => theme.palette.mode === 'dark' ? 'rgba(16, 185, 129, 0.1)' : 'success.50',
                            border: '1px solid',
                            borderColor: theme => theme.palette.mode === 'dark' ? 'rgba(16, 185, 129, 0.3)' : 'success.200'
                          }}>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                              {shot.comfyUIPositivePrompt}
                            </Typography>
                          </Paper>
                        </Box>
                      )}
                      
                      {shot.comfyUINegativePrompt && (
                        <Box sx={{ mb: 1 }}>
                          <Typography variant="caption" color="error.main" gutterBottom display="block">
                            ComfyUI Negative Prompt:
                          </Typography>
                          <Paper sx={{ 
                            p: 2, 
                            backgroundColor: theme => theme.palette.mode === 'dark' ? 'rgba(239, 68, 68, 0.1)' : 'error.50',
                            border: '1px solid',
                            borderColor: theme => theme.palette.mode === 'dark' ? 'rgba(239, 68, 68, 0.3)' : 'error.200'
                          }}>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                              {shot.comfyUINegativePrompt}
                            </Typography>
                          </Paper>
                        </Box>
                      )}
                    </Grid>
                  )}

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
                          <Paper sx={{ p: 2, backgroundColor: theme => theme.palette.mode === 'dark' ? 'rgba(99, 102, 241, 0.1)' : 'primary.50' }}>
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
                            <Paper key={i} sx={{ p: 1.5, mb: 1, backgroundColor: theme => theme.palette.mode === 'dark' ? 'rgba(244, 63, 94, 0.1)' : 'secondary.50' }}>
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
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', pt: 1, flexWrap: 'wrap' }}>
                      <Button size="small" startIcon={<Palette />}>
                        Edit Prompts
                      </Button>
                      {shot.comfyUIPositivePrompt && (
                        <Button 
                          size="small" 
                          variant="outlined" 
                          color="success"
                          onClick={() => navigator.clipboard.writeText(shot.comfyUIPositivePrompt || '')}
                        >
                          Copy Positive
                        </Button>
                      )}
                      {shot.comfyUINegativePrompt && (
                        <Button 
                          size="small" 
                          variant="outlined" 
                          color="error"
                          onClick={() => navigator.clipboard.writeText(shot.comfyUINegativePrompt || '')}
                        >
                          Copy Negative
                        </Button>
                      )}
                      <Button size="small" startIcon={<Preview />}>
                        Preview
                      </Button>
                      {shot.renderStatus === 'pending' && (
                        <Button size="small" variant="contained" startIcon={<PlayArrow />}>
                          Render
                        </Button>
                      )}
                      {shot.renderStatus === 'failed' && (
                        <Button size="small" variant="outlined" color="error" startIcon={<Refresh />}>
                          Retry
                        </Button>
                      )}
                    </Box>
                  </Grid>
                </Grid>
              </Collapse>
            </CardContent>
          </Card>
        ))}
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