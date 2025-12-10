import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Chip,
  Grid,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Avatar,
  LinearProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Snackbar,
  CircularProgress,
  Tooltip,
  alpha,
} from '@mui/material';
import {
  AutoStories as StoryIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  ExpandMore,
  Person as PersonIcon,
  LocationOn as LocationIcon,
  MusicNote as MusicIcon,
  Download as DownloadIcon,
  Share as ShareIcon,
  AutoAwesome as GenerateIcon,
  AutoFixHigh as EnhanceIcon,
  Title as TitleIcon,
} from '@mui/icons-material';
import { EnhancedStory } from '../../types/storyTypes';
import { manualModeAiService } from '../../services/manualModeAiService';

// Available genres
const GENRES = [
  'Drama', 'Comedy', 'Thriller', 'Sci-Fi', 'Romance',
  'Horror', 'Mystery', 'Fantasy', 'Action', 'Documentary'
];

interface StoryTabProps {
  storyData: EnhancedStory | null;
  isGenerating: boolean;
  isManualMode?: boolean;
  onUpdateStory: (updates: Partial<EnhancedStory>) => void;
}

const StoryTab: React.FC<StoryTabProps> = ({ storyData, isGenerating, isManualMode = false, onUpdateStory }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [editedTitle, setEditedTitle] = useState('');
  const [editedGenre, setEditedGenre] = useState('');
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success'
  });

  // Update edited content when storyData changes
  React.useEffect(() => {
    if (storyData) {
      setEditedContent(storyData.content || '');
      setEditedTitle(storyData.title || '');
      setEditedGenre(storyData.genre || 'Drama');
    }
  }, [storyData]);

  // In manual mode, start in editing mode by default
  // isEditing intentionally excluded - we only want this to run once when entering manual mode
  React.useEffect(() => {
    if (isManualMode && storyData && !isEditing) {
      setIsEditing(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManualMode, storyData]);

  if (!storyData) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {isGenerating ? (
          <>
            <StoryIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
            <Typography variant="h6" color="primary" gutterBottom>
              Generating Story...
            </Typography>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              The AI is creating your story content. This may take a few moments.
            </Typography>
            <LinearProgress sx={{ width: '300px', mt: 2 }} />
          </>
        ) : (
          <>
            <StoryIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No Story Content Available
            </Typography>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              The story content will appear here once generation is complete.
            </Typography>
          </>
        )}
      </Box>
    );
  }

  const handleSave = () => {
    onUpdateStory({
      title: editedTitle,
      content: editedContent,
      genre: editedGenre,
      updatedAt: new Date(),
    });
    if (!isManualMode) {
      setIsEditing(false);
    }
    setSnackbar({ open: true, message: 'Story saved successfully', severity: 'success' });
  };

  const handleCancel = () => {
    setEditedTitle(storyData.title);
    setEditedContent(storyData.content);
    setEditedGenre(storyData.genre || 'Drama');
    if (!isManualMode) {
      setIsEditing(false);
    }
  };

  // Generate title from content
  const handleGenerateTitle = async () => {
    if (!editedContent.trim()) {
      setSnackbar({ open: true, message: 'Write some story content first to generate a title', severity: 'error' });
      return;
    }

    setIsGeneratingTitle(true);
    try {
      const result = await manualModeAiService.generateTitle(editedContent);
      if (result.success) {
        setEditedTitle(result.text);
        setSnackbar({ open: true, message: 'Title generated successfully', severity: 'success' });
      } else {
        setSnackbar({ open: true, message: result.error || 'Failed to generate title', severity: 'error' });
      }
    } catch (error: any) {
      setSnackbar({ open: true, message: error.message || 'Failed to generate title', severity: 'error' });
    } finally {
      setIsGeneratingTitle(false);
    }
  };

  // Generate story content
  const handleGenerateContent = async () => {
    setIsGeneratingContent(true);
    try {
      const result = await manualModeAiService.generateStory(
        editedTitle || 'A compelling story',
        editedGenre
      );
      if (result.success) {
        setEditedContent(result.text);
        setSnackbar({ open: true, message: 'Story content generated successfully', severity: 'success' });
      } else {
        setSnackbar({ open: true, message: result.error || 'Failed to generate content', severity: 'error' });
      }
    } catch (error: any) {
      setSnackbar({ open: true, message: error.message || 'Failed to generate content', severity: 'error' });
    } finally {
      setIsGeneratingContent(false);
    }
  };

  // Enhance existing content
  const handleEnhanceContent = async () => {
    if (!editedContent.trim()) {
      setSnackbar({ open: true, message: 'Write some content first to enhance', severity: 'error' });
      return;
    }

    setIsGeneratingContent(true);
    try {
      const result = await manualModeAiService.enhanceStory(editedContent);
      if (result.success) {
        setEditedContent(result.text);
        setSnackbar({ open: true, message: 'Story enhanced successfully', severity: 'success' });
      } else {
        setSnackbar({ open: true, message: result.error || 'Failed to enhance content', severity: 'error' });
      }
    } catch (error: any) {
      setSnackbar({ open: true, message: error.message || 'Failed to enhance content', severity: 'error' });
    } finally {
      setIsGeneratingContent(false);
    }
  };

  const handleExport = () => {
    const element = document.createElement('a');
    const file = new Blob([storyData.content], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${storyData.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const getStatusColor = () => {
    switch (storyData.status) {
      case 'completed': return 'success';
      case 'processing': return 'primary';
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  const wordCount = (storyData.content || '').split(' ').filter(word => word.length > 0).length;
  const estimatedReadTime = Math.max(1, Math.ceil(wordCount / 200)); // Average reading speed, minimum 1 min

  const isAnyGenerating = isGeneratingTitle || isGeneratingContent;

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      {/* Manual Mode Header Banner */}
      {isManualMode && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2">
            <strong>Manual Mode:</strong> Edit your story directly. Use the AI buttons to generate or enhance content.
          </Typography>
        </Alert>
      )}

      {/* Story Header */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
            <Box sx={{ flex: 1, mr: 2 }}>
              {isEditing || isManualMode ? (
                <Box sx={{ mb: 2 }}>
                  {/* Title with generate button */}
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 2 }}>
                    <TextField
                      fullWidth
                      variant="outlined"
                      label="Story Title"
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      placeholder="Enter a title or generate one..."
                      disabled={isAnyGenerating}
                    />
                    {isManualMode && (
                      <Tooltip title="Generate title from content">
                        <span>
                          <IconButton
                            onClick={handleGenerateTitle}
                            disabled={isGeneratingTitle || !editedContent.trim()}
                            sx={{
                              backgroundColor: theme => alpha(theme.palette.primary.main, 0.1),
                              '&:hover': { backgroundColor: theme => alpha(theme.palette.primary.main, 0.2) },
                            }}
                          >
                            {isGeneratingTitle ? <CircularProgress size={24} /> : <TitleIcon />}
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                  </Box>

                  {/* Genre dropdown */}
                  <FormControl fullWidth sx={{ mb: 2 }}>
                    <InputLabel>Genre</InputLabel>
                    <Select
                      value={editedGenre}
                      label="Genre"
                      onChange={(e) => setEditedGenre(e.target.value)}
                      disabled={isAnyGenerating}
                    >
                      {GENRES.map(genre => (
                        <MenuItem key={genre} value={genre.toLowerCase()}>{genre}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              ) : (
                <>
                  <Typography variant="h4" gutterBottom>
                    {storyData.title}
                  </Typography>

                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                    <Chip
                      label={storyData.status}
                      color={getStatusColor()}
                      size="small"
                    />
                    <Chip
                      label={storyData.genre}
                      variant="outlined"
                      size="small"
                    />
                    <Chip
                      label={`${wordCount} words`}
                      variant="outlined"
                      size="small"
                    />
                    <Chip
                      label={`~${estimatedReadTime} min read`}
                      variant="outlined"
                      size="small"
                    />
                  </Box>
                </>
              )}
            </Box>

            <Box sx={{ display: 'flex', gap: 1, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {isEditing || isManualMode ? (
                <>
                  <Button
                    startIcon={<SaveIcon />}
                    variant="contained"
                    onClick={handleSave}
                    disabled={isAnyGenerating}
                  >
                    Save
                  </Button>
                  {!isManualMode && (
                    <Button
                      startIcon={<CancelIcon />}
                      onClick={handleCancel}
                    >
                      Cancel
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <IconButton
                    onClick={() => setIsEditing(true)}
                    title="Edit story"
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    onClick={handleExport}
                    title="Export story"
                  >
                    <DownloadIcon />
                  </IconButton>
                  <IconButton title="Share story">
                    <ShareIcon />
                  </IconButton>
                </>
              )}
            </Box>
          </Box>

          {/* Story Stats */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'primary.50' }}>
                <Typography variant="h6" color="primary">
                  {storyData.shots.length}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Total Shots
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'secondary.50' }}>
                <Typography variant="h6" color="secondary.main">
                  {storyData.characters.length}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Characters
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'info.50' }}>
                <Typography variant="h6" color="info.main">
                  {storyData.locations.length}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Locations
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'success.50' }}>
                <Typography variant="h6" color="success.main">
                  {storyData.musicCues.length}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Music Cues
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Story Content */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              Story Content
            </Typography>
            {(isEditing || isManualMode) && (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Tooltip title="Generate story from title/genre">
                  <span>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={isGeneratingContent ? <CircularProgress size={16} /> : <GenerateIcon />}
                      onClick={handleGenerateContent}
                      disabled={isAnyGenerating}
                      sx={{ minWidth: 120 }}
                    >
                      Generate
                    </Button>
                  </span>
                </Tooltip>
                <Tooltip title="Enhance and expand existing content">
                  <span>
                    <Button
                      size="small"
                      variant="outlined"
                      color="secondary"
                      startIcon={isGeneratingContent ? <CircularProgress size={16} /> : <EnhanceIcon />}
                      onClick={handleEnhanceContent}
                      disabled={isAnyGenerating || !editedContent.trim()}
                      sx={{ minWidth: 120 }}
                    >
                      Enhance
                    </Button>
                  </span>
                </Tooltip>
              </Box>
            )}
          </Box>

          {isEditing || isManualMode ? (
            <Box sx={{ position: 'relative' }}>
              <TextField
                fullWidth
                multiline
                rows={20}
                variant="outlined"
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                placeholder={isManualMode
                  ? "Write your story here, or use the Generate button to create content from your title and genre..."
                  : "Write your story here..."
                }
                disabled={isAnyGenerating}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    ...(isGeneratingContent && {
                      borderColor: 'primary.main',
                      boxShadow: theme => `0 0 8px ${alpha(theme.palette.primary.main, 0.4)}`,
                    }),
                  },
                }}
              />
              {isGeneratingContent && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    bgcolor: theme => alpha(theme.palette.background.paper, 0.9),
                    p: 3,
                    borderRadius: 2,
                  }}
                >
                  <CircularProgress size={40} sx={{ mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">
                    Generating story content...
                  </Typography>
                </Box>
              )}
            </Box>
          ) : (
            <Paper sx={{
              p: 3,
              bgcolor: theme => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
              color: theme => theme.palette.mode === 'dark' ? 'grey.100' : 'grey.900',
              maxHeight: 500,
              overflow: 'auto',
              border: '1px solid',
              borderColor: theme => theme.palette.mode === 'dark' ? 'grey.700' : 'grey.300'
            }}>
              <Typography
                variant="body1"
                sx={{
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.8,
                  fontSize: '1.1rem',
                  color: 'inherit'
                }}
              >
                {storyData.content || 'No story content available yet.'}
              </Typography>
            </Paper>
          )}
        </CardContent>
      </Card>

      {/* Story Elements */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Characters */}
        {storyData.characters.length > 0 && (
          <Accordion 
            expanded={expandedSection === 'characters'}
            onChange={() => setExpandedSection(expandedSection === 'characters' ? null : 'characters')}
          >
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PersonIcon color="primary" />
                <Typography variant="h6">
                  Characters ({storyData.characters.length})
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                {storyData.characters.map((character) => (
                  <Grid size={{ xs: 12, md: 6 }} key={character.id}>
                    <Card sx={{ height: '100%' }}>
                      <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                          <Avatar sx={{ bgcolor: 'primary.main' }}>
                            {character.name.charAt(0)}
                          </Avatar>
                          <Box>
                            <Typography variant="h6">{character.name}</Typography>
                            <Chip 
                              size="small" 
                              label={character.role} 
                              color="primary" 
                              variant="outlined"
                            />
                          </Box>
                        </Box>
                        
                        <Typography variant="body2" color="text.secondary" paragraph>
                          {character.physicalDescription}
                        </Typography>
                        
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                          <Chip size="small" label={`Age: ${character.age}`} />
                          <Chip size="small" label={`Importance: ${character.importanceLevel}/5`} />
                          {character.screenTime > 0 && (
                            <Chip size="small" label={`${character.screenTime}s screen time`} />
                          )}
                        </Box>

                        {character.distinctiveFeatures.length > 0 && (
                          <Box sx={{ mt: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                              Features: {character.distinctiveFeatures.join(', ')}
                            </Typography>
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </AccordionDetails>
          </Accordion>
        )}

        {/* Locations */}
        {storyData.locations.length > 0 && (
          <Accordion 
            expanded={expandedSection === 'locations'}
            onChange={() => setExpandedSection(expandedSection === 'locations' ? null : 'locations')}
          >
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LocationIcon color="info" />
                <Typography variant="h6">
                  Locations ({storyData.locations.length})
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                {storyData.locations.map((location) => (
                  <Grid size={{ xs: 12, md: 6 }} key={location.id}>
                    <Card sx={{ height: '100%' }}>
                      <CardContent>
                        <Typography variant="h6" gutterBottom>
                          {location.name}
                        </Typography>
                        
                        <Box sx={{ display: 'flex', gap: 0.5, mb: 2 }}>
                          <Chip 
                            size="small" 
                            label={location.type} 
                            color="info"
                          />
                          <Chip 
                            size="small" 
                            label={location.timeOfDay} 
                            variant="outlined"
                          />
                          <Chip 
                            size="small" 
                            label={location.lighting} 
                            variant="outlined"
                          />
                        </Box>
                        
                        <Typography variant="body2" color="text.secondary" paragraph>
                          {location.description}
                        </Typography>
                        
                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                          {location.atmosphere}
                        </Typography>

                        {location.keyElements.length > 0 && (
                          <Box sx={{ mt: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                              Key Elements: {location.keyElements.join(', ')}
                            </Typography>
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </AccordionDetails>
          </Accordion>
        )}

        {/* Music Cues */}
        {storyData.musicCues.length > 0 && (
          <Accordion 
            expanded={expandedSection === 'music'}
            onChange={() => setExpandedSection(expandedSection === 'music' ? null : 'music')}
          >
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <MusicIcon color="secondary" />
                <Typography variant="h6">
                  Music Cues ({storyData.musicCues.length})
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <List>
                {storyData.musicCues.map((musicCue, index) => (
                  <React.Fragment key={musicCue.id}>
                    {index > 0 && <Divider />}
                    <ListItem>
                      <ListItemIcon>
                        <MusicIcon />
                      </ListItemIcon>
                      <ListItemText
                        primary={musicCue.name}
                        secondary={
                          <Box>
                            <Typography variant="body2" component="div" gutterBottom>
                              {musicCue.description}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                              <Chip size="small" label={musicCue.mood} />
                              <Chip size="small" label={musicCue.genre} variant="outlined" />
                              <Chip size="small" label={musicCue.tempo} variant="outlined" />
                              <Chip size="small" label={`${musicCue.duration}s`} variant="outlined" />
                            </Box>
                            {musicCue.instruments.length > 0 && (
                              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                                Instruments: {musicCue.instruments.join(', ')}
                              </Typography>
                            )}
                          </Box>
                        }
                      />
                    </ListItem>
                  </React.Fragment>
                ))}
              </List>
            </AccordionDetails>
          </Accordion>
        )}
      </Box>

      {/* Empty State for Elements */}
      {storyData.characters.length === 0 && storyData.locations.length === 0 && storyData.musicCues.length === 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            {isManualMode
              ? "Use the Style tab to add characters and locations for your story."
              : "Story elements (characters, locations, music cues) will appear here as the generation pipeline processes the story."
            }
          </Typography>
        </Alert>
      )}

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

export default StoryTab;