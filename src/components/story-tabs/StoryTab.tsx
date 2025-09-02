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
} from '@mui/icons-material';
import { EnhancedStory } from '../../types/storyTypes';

interface StoryTabProps {
  storyData: EnhancedStory | null;
  isGenerating: boolean;
  onUpdateStory: (updates: Partial<EnhancedStory>) => void;
}

const StoryTab: React.FC<StoryTabProps> = ({ storyData, isGenerating, onUpdateStory }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [editedTitle, setEditedTitle] = useState('');
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  
  // Update edited content when storyData changes
  React.useEffect(() => {
    if (storyData) {
      setEditedContent(storyData.content || '');
      setEditedTitle(storyData.title || '');
    }
  }, [storyData]);

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
      updatedAt: new Date(),
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedTitle(storyData.title);
    setEditedContent(storyData.content);
    setIsEditing(false);
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

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      {/* Story Header */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
            <Box sx={{ flex: 1 }}>
              {isEditing ? (
                <TextField
                  fullWidth
                  variant="outlined"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  sx={{ mb: 2 }}
                  placeholder="Story title..."
                />
              ) : (
                <Typography variant="h4" gutterBottom>
                  {storyData.title}
                </Typography>
              )}
              
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
            </Box>

            <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
              {isEditing ? (
                <>
                  <Button 
                    startIcon={<SaveIcon />} 
                    variant="contained"
                    onClick={handleSave}
                  >
                    Save
                  </Button>
                  <Button 
                    startIcon={<CancelIcon />} 
                    onClick={handleCancel}
                  >
                    Cancel
                  </Button>
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
          <Typography variant="h6" gutterBottom>
            Story Content
          </Typography>
          
          {isEditing ? (
            <TextField
              fullWidth
              multiline
              rows={20}
              variant="outlined"
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              placeholder="Write your story here..."
            />
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
            Story elements (characters, locations, music cues) will appear here as the generation pipeline processes the story.
          </Typography>
        </Alert>
      )}
    </Box>
  );
};

export default StoryTab;