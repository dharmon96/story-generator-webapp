import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardContent,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Slider,
  Switch,
  FormControlLabel,
  Tooltip,
} from '@mui/material';
import {
  Shuffle,
  PlayArrow,
  Queue,
  ExpandMore,
  Settings,
  Casino,
} from '@mui/icons-material';
import { useStore } from '../store/useStore';
import GenerationMethodSelector from '../components/GenerationMethodSelector';
import { GenerationMethodId } from '../types/generationMethods';

const genres = ['Drama', 'Comedy', 'Thriller', 'Sci-Fi', 'Romance', 'Horror', 'Mystery', 'Fantasy', 'Auto'];
const lengths = ['Short', 'Medium', 'Long', 'Auto'];
const visualStyles = [
  'Cinematic', 'Anime', 'Realistic', 'Cartoon', 'Noir', 'Retro', 'Futuristic', 
  'Watercolor', 'Oil Painting', 'Comic Book', 'Auto'
];
const aspectRatios = ['Vertical (9:16)', 'Horizontal (16:9)', 'Square (1:1)'];
const frameRates = ['24fps', '30fps', '60fps'];

interface StoryGeneratorProps {
  onNavigateToStory?: (storyId: string, queueItemId: string) => void;
}

const StoryGenerator: React.FC<StoryGeneratorProps> = ({ onNavigateToStory }) => {
  const { addToQueue } = useStore();
  const navigate = useNavigate();
  
  const [config, setConfig] = useState({
    prompt: '',
    genre: 'Auto',
    length: 'Medium',
    visualStyle: 'Cinematic',
    aspectRatio: 'Vertical (9:16)',
    fps: '30fps',
    autoPrompt: false,
    priority: 5,
    characterConsistency: true,
    musicGeneration: true,
    narrationGeneration: true,
    generationMethod: 'holocine' as GenerationMethodId, // Default: HoloCine for scene-based generation
    generateComfyUIPrompts: false, // Legacy: Skip ComfyUI prompts when using HoloCine
  });

  const [advancedSettings, setAdvancedSettings] = useState({
    temperature: 0.7,
    maxTokens: 2000,
    topP: 0.9,
    frequencyPenalty: 0.0,
    presencePenalty: 0.0,
  });

  const handleRandomize = (field: string) => {
    const randomizers: Record<string, () => string> = {
      genre: () => genres[Math.floor(Math.random() * (genres.length - 1))],
      length: () => lengths[Math.floor(Math.random() * (lengths.length - 1))],
      visualStyle: () => visualStyles[Math.floor(Math.random() * (visualStyles.length - 1))],
      prompt: () => generateRandomPrompt(),
    };
    
    if (randomizers[field]) {
      setConfig({ ...config, [field]: randomizers[field]() });
    }
  };

  const generateRandomPrompt = () => {
    const prompts = [
      "A detective discovers their partner is the serial killer they've been hunting",
      "An AI becomes self-aware and falls in love with its creator",
      "Time travelers accidentally change history and must fix it",
      "A child's imaginary friend turns out to be real",
      "The last human on Earth isn't actually alone",
    ];
    return prompts[Math.floor(Math.random() * prompts.length)];
  };

  const handleRandomizeAll = () => {
    setConfig({
      ...config,
      prompt: generateRandomPrompt(),
      genre: genres[Math.floor(Math.random() * (genres.length - 1))],
      length: lengths[Math.floor(Math.random() * (lengths.length - 1))],
      visualStyle: visualStyles[Math.floor(Math.random() * (visualStyles.length - 1))],
    });
  };

  const handleGenerate = async () => {
    console.log('🎬 Generate Story clicked!');
    console.log('🎬 Story config:', config);
    
    // Validate required fields
    if (!config.prompt.trim() && config.genre === 'Auto') {
      console.log('❌ Validation failed: No prompt provided and genre is Auto');
      alert('Please provide a story prompt or select a specific genre');
      return;
    }
    
    // Generate unique IDs
    const storyId = `story_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const queueItemId = `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`🆔 Generated IDs: storyId=${storyId}, queueItemId=${queueItemId}`);
    
    // Create queue item with highest priority (10) for immediate generation
    const queueItem = {
      id: queueItemId,
      config,
      priority: 10, // Always use highest priority for Generate button
      status: 'queued' as const,
      progress: 0,
      storyId,
    };
    
    try {
      console.log('➕ Adding to queue:', queueItem);
      
      // Add to queue
      addToQueue(queueItem);
      
      console.log(`✅ Story added to queue successfully: "${queueItem.config.prompt.slice(0, 50)}..."`);
      console.log('🧭 Navigating to queue page...');
      
      // Auto-navigate to the story queue to show processing
      navigate('/queue');
      
    } catch (error) {
      console.error('❌ Failed to add story to queue:', error);
      // Show error to user
      alert(`Failed to add story to queue: ${error instanceof Error ? error.message : 'Unknown error occurred'}`);
    }
  };

  const handleAddToQueue = () => {
    // Add to queue with user-selected priority from slider
    addToQueue({
      config,
      priority: config.priority, // Use the priority from the slider (1-10)
      status: 'queued',
      progress: 0,
    });
    
    // Optional: Show confirmation
    console.log(`📋 Added to queue with priority ${config.priority}`);
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Story Generator
      </Typography>


      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h6">Story Configuration</Typography>
                <Button
                  startIcon={<Casino />}
                  onClick={handleRandomizeAll}
                  variant="outlined"
                  size="small"
                >
                  Randomize All
                </Button>
              </Box>

              {/* Generation Method Selector */}
              <GenerationMethodSelector
                value={config.generationMethod}
                onChange={(method) => setConfig({
                  ...config,
                  generationMethod: method,
                  // Auto-adjust ComfyUI prompts based on method
                  generateComfyUIPrompts: method !== 'holocine'
                })}
              />

              <Grid container spacing={2}>
                <Grid size={12}>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                      fullWidth
                      multiline
                      rows={4}
                      label="Story Prompt"
                      value={config.prompt}
                      onChange={(e) => setConfig({ ...config, prompt: e.target.value })}
                      placeholder="Enter your story idea or leave blank for auto-generation..."
                    />
                    <Tooltip title="Randomize Prompt">
                      <IconButton onClick={() => handleRandomize('prompt')} color="primary">
                        <Shuffle />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <FormControl fullWidth>
                      <InputLabel>Genre</InputLabel>
                      <Select
                        value={config.genre}
                        label="Genre"
                        onChange={(e) => setConfig({ ...config, genre: e.target.value })}
                      >
                        {genres.map(genre => (
                          <MenuItem key={genre} value={genre}>{genre}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <IconButton onClick={() => handleRandomize('genre')} color="primary">
                      <Shuffle />
                    </IconButton>
                  </Box>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <FormControl fullWidth>
                      <InputLabel>Length</InputLabel>
                      <Select
                        value={config.length}
                        label="Length"
                        onChange={(e) => setConfig({ ...config, length: e.target.value })}
                      >
                        {lengths.map(length => (
                          <MenuItem key={length} value={length}>{length}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <IconButton onClick={() => handleRandomize('length')} color="primary">
                      <Shuffle />
                    </IconButton>
                  </Box>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <FormControl fullWidth>
                      <InputLabel>Visual Style</InputLabel>
                      <Select
                        value={config.visualStyle}
                        label="Visual Style"
                        onChange={(e) => setConfig({ ...config, visualStyle: e.target.value })}
                      >
                        {visualStyles.map(style => (
                          <MenuItem key={style} value={style}>{style}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <IconButton onClick={() => handleRandomize('visualStyle')} color="primary">
                      <Shuffle />
                    </IconButton>
                  </Box>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <FormControl fullWidth>
                    <InputLabel>Aspect Ratio</InputLabel>
                    <Select
                      value={config.aspectRatio}
                      label="Aspect Ratio"
                      onChange={(e) => setConfig({ ...config, aspectRatio: e.target.value })}
                    >
                      {aspectRatios.map(ratio => (
                        <MenuItem key={ratio} value={ratio}>{ratio}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <FormControl fullWidth>
                    <InputLabel>Frame Rate</InputLabel>
                    <Select
                      value={config.fps}
                      label="Frame Rate"
                      onChange={(e) => setConfig({ ...config, fps: e.target.value })}
                    >
                      {frameRates.map(fps => (
                        <MenuItem key={fps} value={fps}>{fps}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Typography gutterBottom>Priority</Typography>
                  <Slider
                    value={config.priority}
                    onChange={(e, value) => setConfig({ ...config, priority: value as number })}
                    min={1}
                    max={10}
                    marks
                    valueLabelDisplay="auto"
                  />
                </Grid>

                <Grid size={12}>
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={config.characterConsistency}
                          onChange={(e) => setConfig({ ...config, characterConsistency: e.target.checked })}
                        />
                      }
                      label="Character Consistency"
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={config.musicGeneration}
                          onChange={(e) => setConfig({ ...config, musicGeneration: e.target.checked })}
                        />
                      }
                      label="Generate Music"
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={config.narrationGeneration}
                          onChange={(e) => setConfig({ ...config, narrationGeneration: e.target.checked })}
                        />
                      }
                      label="Generate Narration"
                    />
                  </Box>
                </Grid>
              </Grid>

              <Accordion sx={{ mt: 3 }}>
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Typography>Advanced Settings</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography gutterBottom>Temperature: {advancedSettings.temperature}</Typography>
                      <Slider
                        value={advancedSettings.temperature}
                        onChange={(e, value) => setAdvancedSettings({ ...advancedSettings, temperature: value as number })}
                        min={0}
                        max={2}
                        step={0.1}
                        valueLabelDisplay="auto"
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography gutterBottom>Max Tokens: {advancedSettings.maxTokens}</Typography>
                      <Slider
                        value={advancedSettings.maxTokens}
                        onChange={(e, value) => setAdvancedSettings({ ...advancedSettings, maxTokens: value as number })}
                        min={100}
                        max={4000}
                        step={100}
                        valueLabelDisplay="auto"
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography gutterBottom>Top P: {advancedSettings.topP}</Typography>
                      <Slider
                        value={advancedSettings.topP}
                        onChange={(e, value) => setAdvancedSettings({ ...advancedSettings, topP: value as number })}
                        min={0}
                        max={1}
                        step={0.1}
                        valueLabelDisplay="auto"
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography gutterBottom>Frequency Penalty: {advancedSettings.frequencyPenalty}</Typography>
                      <Slider
                        value={advancedSettings.frequencyPenalty}
                        onChange={(e, value) => setAdvancedSettings({ ...advancedSettings, frequencyPenalty: value as number })}
                        min={0}
                        max={2}
                        step={0.1}
                        valueLabelDisplay="auto"
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>

              <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
                <Button
                  variant="contained"
                  size="large"
                  startIcon={<PlayArrow />}
                  onClick={handleGenerate}
                  sx={{ flex: 1 }}
                >
                  Generate Story
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  startIcon={<Queue />}
                  onClick={handleAddToQueue}
                >
                  Add to Queue
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  startIcon={<Settings />}
                >
                  Model Config
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent Generations
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {[1, 2, 3].map((i) => (
                  <Box key={i} sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                    <Typography variant="subtitle2">The Mystery of the Lost City</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Generated 2 hours ago • Adventure • 12 shots
                    </Typography>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Quick Stats
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">Stories Today</Typography>
                  <Typography variant="h4">8</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Avg Generation Time</Typography>
                  <Typography variant="h4">12.5m</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Success Rate</Typography>
                  <Typography variant="h4">95%</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default StoryGenerator;