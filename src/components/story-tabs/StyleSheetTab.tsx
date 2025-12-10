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
  Skeleton,
  Tooltip,
  alpha,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Snackbar,
  CircularProgress,
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
  HourglassEmpty,
  Add as AddIcon,
  AutoAwesome as GenerateIcon,
  AutoFixHigh as EnhanceIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { EnhancedCharacter, Location } from '../../types/storyTypes';
import { manualModeAiService } from '../../services/manualModeAiService';

interface StyleSheetTabProps {
  characters: EnhancedCharacter[];
  locations: Location[];
  storyId: string;
  isManualMode?: boolean;
  storyContent?: string;
  onUpdateCharacter?: (characterId: string, updates: Partial<EnhancedCharacter>) => void;
  onUpdateLocation?: (locationId: string, updates: Partial<Location>) => void;
  onAddCharacter?: (character: Partial<EnhancedCharacter>) => void;
  onAddLocation?: (location: Partial<Location>) => void;
  onGenerateStyleSheet?: () => void;
}

const StyleSheetTab: React.FC<StyleSheetTabProps> = ({
  characters = [],
  locations = [],
  storyId,
  isManualMode = false,
  storyContent,
  onUpdateCharacter,
  onUpdateLocation,
  onAddCharacter,
  onAddLocation,
  onGenerateStyleSheet,
}) => {
  const [editingCharacter, setEditingCharacter] = useState<string | null>(null);
  const [editingLocation, setEditingLocation] = useState<string | null>(null);
  const [characterEdits, setCharacterEdits] = useState<Partial<EnhancedCharacter>>({});
  const [locationEdits, setLocationEdits] = useState<Partial<Location>>({});
  const [expandedCharacter, setExpandedCharacter] = useState<string | false>(false);
  const [expandedLocation, setExpandedLocation] = useState<string | false>(false);
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);

  // Dialog states for adding new characters/locations
  const [addCharacterDialogOpen, setAddCharacterDialogOpen] = useState(false);
  const [addLocationDialogOpen, setAddLocationDialogOpen] = useState(false);
  const [newCharacter, setNewCharacter] = useState<Partial<EnhancedCharacter>>({
    name: '',
    role: 'supporting',
    physicalDescription: '',
    age: '',
    gender: 'unspecified',
    clothing: '',
    personality: '',
    importanceLevel: 3,
  });
  const [newLocation, setNewLocation] = useState<Partial<Location>>({
    name: '',
    type: 'interior',
    description: '',
    atmosphere: '',
    lighting: 'natural',
    timeOfDay: 'midday',
  });

  // AI generation states
  const [isGeneratingCharacter, setIsGeneratingCharacter] = useState(false);
  const [isGeneratingLocation, setIsGeneratingLocation] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success'
  });

  // Prompt display component with pending state
  const PromptDisplay: React.FC<{
    label: string;
    prompt: string | undefined;
    entityId: string;
    onCopy: (text: string, id: string) => void;
  }> = ({ label, prompt, entityId, onCopy }) => {
    const isPending = !prompt;

    return (
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          mt: 2,
          bgcolor: theme => isPending
            ? alpha(theme.palette.action.disabled, 0.05)
            : theme.palette.mode === 'dark'
              ? 'grey.900'
              : 'grey.50',
          border: '1px solid',
          borderColor: theme => isPending
            ? theme.palette.divider
            : theme.palette.mode === 'dark'
              ? 'grey.700'
              : 'grey.300',
          borderStyle: isPending ? 'dashed' : 'solid',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography
            variant="subtitle2"
            sx={{
              color: isPending ? 'text.disabled' : 'text.primary',
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            {label}
            {isPending && (
              <Chip
                size="small"
                icon={<HourglassEmpty sx={{ fontSize: '0.9rem' }} />}
                label="Pending"
                sx={{
                  ml: 1,
                  height: 20,
                  fontSize: '0.65rem',
                  backgroundColor: theme => alpha(theme.palette.warning.main, 0.1),
                  color: 'warning.main',
                  '& .MuiChip-icon': { color: 'warning.main' },
                }}
              />
            )}
          </Typography>
          {!isPending && (
            <Tooltip title={copiedPrompt === entityId ? 'Copied!' : 'Copy prompt'}>
              <IconButton
                size="small"
                onClick={() => onCopy(prompt!, entityId)}
              >
                <ContentCopy fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        {isPending ? (
          <Box>
            <Skeleton variant="text" width="90%" />
            <Skeleton variant="text" width="75%" />
            <Skeleton variant="text" width="60%" />
          </Box>
        ) : (
          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
            {prompt}
          </Typography>
        )}
      </Paper>
    );
  };

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

  const copyToClipboard = (text: string, entityId?: string) => {
    navigator.clipboard.writeText(text);
    if (entityId) {
      setCopiedPrompt(entityId);
      setTimeout(() => setCopiedPrompt(null), 2000);
    }
  };

  // Handle adding new character
  const handleAddCharacter = () => {
    if (!newCharacter.name?.trim()) {
      setSnackbar({ open: true, message: 'Character name is required', severity: 'error' });
      return;
    }
    if (onAddCharacter) {
      onAddCharacter(newCharacter);
      setNewCharacter({
        name: '',
        role: 'supporting',
        physicalDescription: '',
        age: '',
        gender: 'unspecified',
        clothing: '',
        personality: '',
        importanceLevel: 3,
      });
      setAddCharacterDialogOpen(false);
      setSnackbar({ open: true, message: 'Character added successfully', severity: 'success' });
    }
  };

  // Handle adding new location
  const handleAddLocation = () => {
    if (!newLocation.name?.trim()) {
      setSnackbar({ open: true, message: 'Location name is required', severity: 'error' });
      return;
    }
    if (onAddLocation) {
      onAddLocation(newLocation);
      setNewLocation({
        name: '',
        type: 'interior',
        description: '',
        atmosphere: '',
        lighting: 'natural',
        timeOfDay: 'midday',
      });
      setAddLocationDialogOpen(false);
      setSnackbar({ open: true, message: 'Location added successfully', severity: 'success' });
    }
  };

  // Generate character with AI
  const handleGenerateCharacter = async () => {
    setIsGeneratingCharacter(true);
    try {
      const result = await manualModeAiService.generateCharacter(
        newCharacter.name || 'an interesting character',
        storyContent
      );
      if (result.success) {
        try {
          // Try to parse JSON response
          const parsed = JSON.parse(result.text);
          setNewCharacter(prev => ({
            ...prev,
            name: parsed.name || prev.name,
            physicalDescription: parsed.physical_description || parsed.physicalDescription || '',
            age: parsed.age_range || parsed.age || '',
            clothing: parsed.clothing || '',
            personality: parsed.personality || '',
            role: parsed.role === 'protagonist' ? 'protagonist' :
                  parsed.role === 'antagonist' ? 'antagonist' : 'supporting',
          }));
        } catch {
          // If not JSON, use as physical description
          setNewCharacter(prev => ({
            ...prev,
            physicalDescription: result.text,
          }));
        }
        setSnackbar({ open: true, message: 'Character details generated', severity: 'success' });
      } else {
        setSnackbar({ open: true, message: result.error || 'Failed to generate', severity: 'error' });
      }
    } catch (error: any) {
      setSnackbar({ open: true, message: error.message, severity: 'error' });
    } finally {
      setIsGeneratingCharacter(false);
    }
  };

  // Generate location with AI
  const handleGenerateLocation = async () => {
    setIsGeneratingLocation(true);
    try {
      const result = await manualModeAiService.generateLocation(
        newLocation.name || 'an atmospheric location',
        storyContent
      );
      if (result.success) {
        try {
          // Try to parse JSON response
          const parsed = JSON.parse(result.text);
          setNewLocation(prev => ({
            ...prev,
            name: parsed.name || prev.name,
            description: parsed.description || '',
            atmosphere: parsed.atmosphere || '',
            type: parsed.type === 'exterior' ? 'exterior' :
                  parsed.type === 'mixed' ? 'mixed' : 'interior',
            lighting: parsed.lighting || prev.lighting,
            timeOfDay: parsed.time_of_day || parsed.timeOfDay || prev.timeOfDay,
          }));
        } catch {
          // If not JSON, use as description
          setNewLocation(prev => ({
            ...prev,
            description: result.text,
          }));
        }
        setSnackbar({ open: true, message: 'Location details generated', severity: 'success' });
      } else {
        setSnackbar({ open: true, message: result.error || 'Failed to generate', severity: 'error' });
      }
    } catch (error: any) {
      setSnackbar({ open: true, message: error.message, severity: 'error' });
    } finally {
      setIsGeneratingLocation(false);
    }
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
      {/* Manual Mode Banner */}
      {isManualMode && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2">
            <strong>Manual Mode:</strong> Add characters and locations referenced in your story. Use AI to generate details.
          </Typography>
        </Alert>
      )}

      {/* Header Summary */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Style Sheet Summary</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {isManualMode && onAddCharacter && (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setAddCharacterDialogOpen(true)}
                >
                  Add Character
                </Button>
              )}
              {isManualMode && onAddLocation && (
                <Button
                  variant="contained"
                  size="small"
                  color="secondary"
                  startIcon={<AddIcon />}
                  onClick={() => setAddLocationDialogOpen(true)}
                >
                  Add Location
                </Button>
              )}
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
                          
                          <PromptDisplay
                            label="Visual Prompt for AI Generation"
                            prompt={character.visualPrompt}
                            entityId={`char-${character.id}`}
                            onCopy={copyToClipboard}
                          />
                          {onUpdateCharacter && character.visualPrompt && (
                            <Box sx={{ display: 'flex', gap: 1, mt: 1, justifyContent: 'flex-end' }}>
                              <IconButton
                                size="small"
                                onClick={() => handleCharacterEdit(character)}
                                title="Edit character"
                              >
                                <Edit fontSize="small" />
                              </IconButton>
                            </Box>
                          )}
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
                          
                          <PromptDisplay
                            label="Visual Prompt for AI Generation"
                            prompt={location.visualPrompt}
                            entityId={`loc-${location.id}`}
                            onCopy={copyToClipboard}
                          />
                          {onUpdateLocation && location.visualPrompt && (
                            <Box sx={{ display: 'flex', gap: 1, mt: 1, justifyContent: 'flex-end' }}>
                              <IconButton
                                size="small"
                                onClick={() => handleLocationEdit(location)}
                                title="Edit location"
                              >
                                <Edit fontSize="small" />
                              </IconButton>
                            </Box>
                          )}
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

      {/* Add Character Dialog */}
      <Dialog
        open={addCharacterDialogOpen}
        onClose={() => setAddCharacterDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Add Character</Typography>
            <Tooltip title="Generate character details with AI">
              <IconButton
                onClick={handleGenerateCharacter}
                disabled={isGeneratingCharacter}
                color="primary"
              >
                {isGeneratingCharacter ? <CircularProgress size={24} /> : <GenerateIcon />}
              </IconButton>
            </Tooltip>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Character Name"
              value={newCharacter.name || ''}
              onChange={(e) => setNewCharacter({ ...newCharacter, name: e.target.value })}
              fullWidth
              required
              placeholder="Enter name or concept for AI generation"
            />
            <FormControl fullWidth>
              <InputLabel>Role</InputLabel>
              <Select
                value={newCharacter.role || 'supporting'}
                label="Role"
                onChange={(e) => setNewCharacter({ ...newCharacter, role: e.target.value as any })}
              >
                <MenuItem value="protagonist">Protagonist</MenuItem>
                <MenuItem value="antagonist">Antagonist</MenuItem>
                <MenuItem value="supporting">Supporting</MenuItem>
                <MenuItem value="background">Background</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Physical Description"
              value={newCharacter.physicalDescription || ''}
              onChange={(e) => setNewCharacter({ ...newCharacter, physicalDescription: e.target.value })}
              fullWidth
              multiline
              rows={3}
              placeholder="Describe physical appearance..."
            />
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="Age"
                  value={newCharacter.age || ''}
                  onChange={(e) => setNewCharacter({ ...newCharacter, age: e.target.value })}
                  fullWidth
                  placeholder="e.g., 30s, young adult"
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <FormControl fullWidth>
                  <InputLabel>Gender</InputLabel>
                  <Select
                    value={newCharacter.gender || 'unspecified'}
                    label="Gender"
                    onChange={(e) => setNewCharacter({ ...newCharacter, gender: e.target.value })}
                  >
                    <MenuItem value="male">Male</MenuItem>
                    <MenuItem value="female">Female</MenuItem>
                    <MenuItem value="non-binary">Non-binary</MenuItem>
                    <MenuItem value="unspecified">Unspecified</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            <TextField
              label="Clothing Style"
              value={newCharacter.clothing || ''}
              onChange={(e) => setNewCharacter({ ...newCharacter, clothing: e.target.value })}
              fullWidth
              placeholder="Typical attire..."
            />
            <TextField
              label="Personality"
              value={newCharacter.personality || ''}
              onChange={(e) => setNewCharacter({ ...newCharacter, personality: e.target.value })}
              fullWidth
              multiline
              rows={2}
              placeholder="Key personality traits..."
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddCharacterDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAddCharacter}
            disabled={!newCharacter.name?.trim()}
          >
            Add Character
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Location Dialog */}
      <Dialog
        open={addLocationDialogOpen}
        onClose={() => setAddLocationDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Add Location</Typography>
            <Tooltip title="Generate location details with AI">
              <IconButton
                onClick={handleGenerateLocation}
                disabled={isGeneratingLocation}
                color="primary"
              >
                {isGeneratingLocation ? <CircularProgress size={24} /> : <GenerateIcon />}
              </IconButton>
            </Tooltip>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Location Name"
              value={newLocation.name || ''}
              onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })}
              fullWidth
              required
              placeholder="Enter name or concept for AI generation"
            />
            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                value={newLocation.type || 'interior'}
                label="Type"
                onChange={(e) => setNewLocation({ ...newLocation, type: e.target.value as any })}
              >
                <MenuItem value="interior">Interior</MenuItem>
                <MenuItem value="exterior">Exterior</MenuItem>
                <MenuItem value="mixed">Mixed</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Description"
              value={newLocation.description || ''}
              onChange={(e) => setNewLocation({ ...newLocation, description: e.target.value })}
              fullWidth
              multiline
              rows={3}
              placeholder="Describe the location..."
            />
            <TextField
              label="Atmosphere"
              value={newLocation.atmosphere || ''}
              onChange={(e) => setNewLocation({ ...newLocation, atmosphere: e.target.value })}
              fullWidth
              multiline
              rows={2}
              placeholder="Mood and feeling of the space..."
            />
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <FormControl fullWidth>
                  <InputLabel>Lighting</InputLabel>
                  <Select
                    value={newLocation.lighting || 'natural'}
                    label="Lighting"
                    onChange={(e) => setNewLocation({ ...newLocation, lighting: e.target.value as any })}
                  >
                    <MenuItem value="natural">Natural</MenuItem>
                    <MenuItem value="artificial">Artificial</MenuItem>
                    <MenuItem value="mixed">Mixed</MenuItem>
                    <MenuItem value="dramatic">Dramatic</MenuItem>
                    <MenuItem value="soft">Soft</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <FormControl fullWidth>
                  <InputLabel>Time of Day</InputLabel>
                  <Select
                    value={newLocation.timeOfDay || 'day'}
                    label="Time of Day"
                    onChange={(e) => setNewLocation({ ...newLocation, timeOfDay: e.target.value as any })}
                  >
                    <MenuItem value="dawn">Dawn</MenuItem>
                    <MenuItem value="morning">Morning</MenuItem>
                    <MenuItem value="midday">Midday</MenuItem>
                    <MenuItem value="afternoon">Afternoon</MenuItem>
                    <MenuItem value="evening">Evening</MenuItem>
                    <MenuItem value="night">Night</MenuItem>
                    <MenuItem value="variable">Variable</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddLocationDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAddLocation}
            disabled={!newLocation.name?.trim()}
          >
            Add Location
          </Button>
        </DialogActions>
      </Dialog>

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

export default StyleSheetTab;