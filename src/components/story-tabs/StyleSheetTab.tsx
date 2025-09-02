import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Avatar,
  List,
  ListItem,
  ListItemText,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  TextField,
  Button,
  IconButton,
  Paper,
  Alert,
} from '@mui/material';
import {
  ExpandMore,
  Person,
  LocationOn,
  Edit,
  Save,
  Cancel,
  ContentCopy,
  Refresh,
} from '@mui/icons-material';
import { EnhancedCharacter, Location } from '../../types/storyTypes';

interface StyleSheetTabProps {
  characters: EnhancedCharacter[];
  locations: Location[];
  storyId: string;
  onUpdateCharacter?: (characterId: string, updates: Partial<EnhancedCharacter>) => void;
  onUpdateLocation?: (locationId: string, updates: Partial<Location>) => void;
  onGenerateStyleSheet?: () => void;
}

const StyleSheetTab: React.FC<StyleSheetTabProps> = ({
  characters = [],
  locations = [],
  storyId,
  onUpdateCharacter,
  onUpdateLocation,
  onGenerateStyleSheet,
}) => {
  const [editingCharacter, setEditingCharacter] = useState<string | null>(null);
  const [editingLocation, setEditingLocation] = useState<string | null>(null);
  const [characterEdits, setCharacterEdits] = useState<Partial<EnhancedCharacter>>({});
  const [locationEdits, setLocationEdits] = useState<Partial<Location>>({});
  const [expandedCharacter, setExpandedCharacter] = useState<string | false>(false);
  const [expandedLocation, setExpandedLocation] = useState<string | false>(false);

  const handleCharacterEdit = (character: EnhancedCharacter) => {
    setEditingCharacter(character.id);
    setCharacterEdits({
      physicalDescription: character.physicalDescription,
      clothing: character.clothing,
      visualPrompt: character.visualPrompt,
    });
  };

  const handleLocationEdit = (location: Location) => {
    setEditingLocation(location.id);
    setLocationEdits({
      description: location.description,
      atmosphere: location.atmosphere,
      visualPrompt: location.visualPrompt,
    });
  };

  const saveCharacterEdits = () => {
    if (editingCharacter && onUpdateCharacter) {
      onUpdateCharacter(editingCharacter, characterEdits);
    }
    setEditingCharacter(null);
    setCharacterEdits({});
  };

  const saveLocationEdits = () => {
    if (editingLocation && onUpdateLocation) {
      onUpdateLocation(editingLocation, locationEdits);
    }
    setEditingLocation(null);
    setLocationEdits({});
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'protagonist': return 'primary';
      case 'antagonist': return 'error';
      case 'supporting': return 'warning';
      default: return 'default';
    }
  };

  const getImportanceStars = (level: number) => {
    return '★'.repeat(level) + '☆'.repeat(5 - level);
  };

  return (
    <Box>
      {/* Header Summary */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Style Sheet Summary</Typography>
            {onGenerateStyleSheet && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<Refresh />}
                onClick={onGenerateStyleSheet}
              >
                Regenerate
              </Button>
            )}
          </Box>
          
          <Grid container spacing={3}>
            <Grid size={{ xs: 6, md: 3 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h4" color="primary.main">
                  {characters.length}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Characters
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h4" color="secondary.main">
                  {locations.length}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Locations
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h4" color="success.main">
                  {characters.filter(c => c.visualPrompt).length}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Visual Prompts
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h4" color="warning.main">
                  {characters.filter(c => c.role === 'protagonist').length}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Main Characters
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {(!characters.length && !locations.length) ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body1">
            No style sheet data available yet. The style sheet will be generated after the character analysis step completes.
          </Typography>
          {onGenerateStyleSheet && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<Refresh />}
              onClick={onGenerateStyleSheet}
              sx={{ mt: 1 }}
            >
              Generate Style Sheet
            </Button>
          )}
        </Alert>
      ) : (
        <Grid container spacing={3}>
          {/* Characters Section */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Person /> Characters ({characters.length})
                </Typography>
                <Divider sx={{ mb: 2 }} />
                
                {characters.map((character) => (
                  <Accordion
                    key={character.id}
                    expanded={expandedCharacter === character.id}
                    onChange={(e, isExpanded) => setExpandedCharacter(isExpanded ? character.id : false)}
                    sx={{ mb: 1 }}
                  >
                    <AccordionSummary expandIcon={<ExpandMore />}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                        <Avatar sx={{ 
                          bgcolor: getRoleColor(character.role) === 'primary' ? 'primary.main' : 
                                   getRoleColor(character.role) === 'error' ? 'error.main' :
                                   getRoleColor(character.role) === 'warning' ? 'warning.main' :
                                   'grey.500',
                          width: 40,
                          height: 40
                        }}>
                          {character.name.charAt(0)}
                        </Avatar>
                        <Box sx={{ flexGrow: 1 }}>
                          <Typography variant="subtitle1" fontWeight="bold">
                            {character.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {character.age} • {character.physicalDescription?.slice(0, 50)}...
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 1, mt: 0.5, alignItems: 'center' }}>
                            <Chip 
                              label={character.role} 
                              size="small" 
                              color={getRoleColor(character.role) as any}
                              variant="filled"
                            />
                            <Typography variant="caption" sx={{ color: 'warning.main' }}>
                              {getImportanceStars(character.importanceLevel || 3)}
                            </Typography>
                            {character.screenTime && (
                              <Chip 
                                label={`${character.screenTime}s`} 
                                size="small" 
                                variant="outlined"
                              />
                            )}
                          </Box>
                        </Box>
                      </Box>
                    </AccordionSummary>
                    
                    <AccordionDetails>
                      {editingCharacter === character.id ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <TextField
                            fullWidth
                            multiline
                            rows={3}
                            label="Physical Description"
                            value={characterEdits.physicalDescription || ''}
                            onChange={(e) => setCharacterEdits({ ...characterEdits, physicalDescription: e.target.value })}
                          />
                          <TextField
                            fullWidth
                            multiline
                            rows={2}
                            label="Clothing"
                            value={characterEdits.clothing || ''}
                            onChange={(e) => setCharacterEdits({ ...characterEdits, clothing: e.target.value })}
                          />
                          <TextField
                            fullWidth
                            multiline
                            rows={3}
                            label="Visual Prompt"
                            value={characterEdits.visualPrompt || ''}
                            onChange={(e) => setCharacterEdits({ ...characterEdits, visualPrompt: e.target.value })}
                          />
                          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                            <Button
                              size="small"
                              startIcon={<Cancel />}
                              onClick={() => {
                                setEditingCharacter(null);
                                setCharacterEdits({});
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="small"
                              variant="contained"
                              startIcon={<Save />}
                              onClick={saveCharacterEdits}
                            >
                              Save
                            </Button>
                          </Box>
                        </Box>
                      ) : (
                        <Box>
                          <List dense>
                            <ListItem>
                              <ListItemText
                                primary="Physical Description"
                                secondary={character.physicalDescription}
                              />
                            </ListItem>
                            <ListItem>
                              <ListItemText
                                primary="Age & Gender"
                                secondary={`${character.age}, ${character.gender}`}
                              />
                            </ListItem>
                            <ListItem>
                              <ListItemText
                                primary="Clothing"
                                secondary={character.clothing}
                              />
                            </ListItem>
                            {character.distinctiveFeatures && character.distinctiveFeatures.length > 0 && (
                              <ListItem>
                                <ListItemText
                                  primary="Distinctive Features"
                                  secondary={character.distinctiveFeatures.join(', ')}
                                />
                              </ListItem>
                            )}
                            <ListItem>
                              <ListItemText
                                primary="Personality"
                                secondary={character.personality}
                              />
                            </ListItem>
                            {character.screenTime && (
                              <ListItem>
                                <ListItemText
                                  primary="Estimated Screen Time"
                                  secondary={`${character.screenTime} seconds`}
                                />
                              </ListItem>
                            )}
                          </List>
                          
                          <Paper variant="outlined" sx={{ p: 2, mt: 2, bgcolor: theme => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50', border: '1px solid', borderColor: theme => theme.palette.mode === 'dark' ? 'grey.700' : 'grey.300' }}>
                            <Typography variant="subtitle2" gutterBottom>
                              Visual Prompt for AI Generation
                            </Typography>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', mb: 1 }}>
                              {character.visualPrompt}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                              <IconButton
                                size="small"
                                onClick={() => copyToClipboard(character.visualPrompt)}
                                title="Copy prompt"
                              >
                                <ContentCopy fontSize="small" />
                              </IconButton>
                              {onUpdateCharacter && (
                                <IconButton
                                  size="small"
                                  onClick={() => handleCharacterEdit(character)}
                                  title="Edit character"
                                >
                                  <Edit fontSize="small" />
                                </IconButton>
                              )}
                            </Box>
                          </Paper>
                        </Box>
                      )}
                    </AccordionDetails>
                  </Accordion>
                ))}
              </CardContent>
            </Card>
          </Grid>

          {/* Locations Section */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LocationOn /> Locations ({locations.length})
                </Typography>
                <Divider sx={{ mb: 2 }} />
                
                {locations.map((location) => (
                  <Accordion
                    key={location.id}
                    expanded={expandedLocation === location.id}
                    onChange={(e, isExpanded) => setExpandedLocation(isExpanded ? location.id : false)}
                    sx={{ mb: 1 }}
                  >
                    <AccordionSummary expandIcon={<ExpandMore />}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                        <Avatar sx={{ bgcolor: 'secondary.main' }}>
                          <LocationOn />
                        </Avatar>
                        <Box sx={{ flexGrow: 1 }}>
                          <Typography variant="subtitle1">
                            {location.name}
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                            <Chip label={location.type} size="small" variant="outlined" />
                            <Chip label={location.timeOfDay} size="small" variant="outlined" />
                          </Box>
                        </Box>
                      </Box>
                    </AccordionSummary>
                    
                    <AccordionDetails>
                      {editingLocation === location.id ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <TextField
                            fullWidth
                            multiline
                            rows={3}
                            label="Description"
                            value={locationEdits.description || ''}
                            onChange={(e) => setLocationEdits({ ...locationEdits, description: e.target.value })}
                          />
                          <TextField
                            fullWidth
                            multiline
                            rows={2}
                            label="Atmosphere"
                            value={locationEdits.atmosphere || ''}
                            onChange={(e) => setLocationEdits({ ...locationEdits, atmosphere: e.target.value })}
                          />
                          <TextField
                            fullWidth
                            multiline
                            rows={3}
                            label="Visual Prompt"
                            value={locationEdits.visualPrompt || ''}
                            onChange={(e) => setLocationEdits({ ...locationEdits, visualPrompt: e.target.value })}
                          />
                          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                            <Button
                              size="small"
                              startIcon={<Cancel />}
                              onClick={() => {
                                setEditingLocation(null);
                                setLocationEdits({});
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="small"
                              variant="contained"
                              startIcon={<Save />}
                              onClick={saveLocationEdits}
                            >
                              Save
                            </Button>
                          </Box>
                        </Box>
                      ) : (
                        <Box>
                          <List dense>
                            <ListItem>
                              <ListItemText
                                primary="Description"
                                secondary={location.description}
                              />
                            </ListItem>
                            <ListItem>
                              <ListItemText
                                primary="Atmosphere"
                                secondary={location.atmosphere}
                              />
                            </ListItem>
                            <ListItem>
                              <ListItemText
                                primary="Lighting"
                                secondary={`${location.lighting} lighting`}
                              />
                            </ListItem>
                            {location.weather && (
                              <ListItem>
                                <ListItemText
                                  primary="Weather"
                                  secondary={location.weather}
                                />
                              </ListItem>
                            )}
                            {location.keyElements && location.keyElements.length > 0 && (
                              <ListItem>
                                <ListItemText
                                  primary="Key Visual Elements"
                                  secondary={location.keyElements.join(', ')}
                                />
                              </ListItem>
                            )}
                          </List>
                          
                          {location.colorPalette && location.colorPalette.length > 0 && (
                            <Box sx={{ mb: 2 }}>
                              <Typography variant="subtitle2" gutterBottom>
                                Color Palette
                              </Typography>
                              <Box sx={{ display: 'flex', gap: 1 }}>
                                {location.colorPalette.map((color, index) => (
                                  <Box
                                    key={index}
                                    sx={{
                                      width: 30,
                                      height: 30,
                                      bgcolor: color,
                                      borderRadius: 1,
                                      border: '1px solid rgba(0,0,0,0.2)',
                                    }}
                                    title={color}
                                  />
                                ))}
                              </Box>
                            </Box>
                          )}
                          
                          <Paper variant="outlined" sx={{ p: 2, mt: 2, bgcolor: theme => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50', border: '1px solid', borderColor: theme => theme.palette.mode === 'dark' ? 'grey.700' : 'grey.300' }}>
                            <Typography variant="subtitle2" gutterBottom>
                              Visual Prompt for AI Generation
                            </Typography>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', mb: 1 }}>
                              {location.visualPrompt}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                              <IconButton
                                size="small"
                                onClick={() => copyToClipboard(location.visualPrompt)}
                                title="Copy prompt"
                              >
                                <ContentCopy fontSize="small" />
                              </IconButton>
                              {onUpdateLocation && (
                                <IconButton
                                  size="small"
                                  onClick={() => handleLocationEdit(location)}
                                  title="Edit location"
                                >
                                  <Edit fontSize="small" />
                                </IconButton>
                              )}
                            </Box>
                          </Paper>
                        </Box>
                      )}
                    </AccordionDetails>
                  </Accordion>
                ))}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );
};

export default StyleSheetTab;