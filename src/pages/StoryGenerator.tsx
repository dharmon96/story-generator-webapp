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
    // Genre-specific prompts - 15 per genre for variety
    const genrePrompts: Record<string, string[]> = {
      Drama: [
        "A dying father reveals a secret that tears his family apart",
        "Two estranged siblings reunite at their mother's funeral and confront buried resentments",
        "A teacher discovers their star student is living in their car",
        "A surgeon must operate on the drunk driver who killed their spouse",
        "An elderly couple faces the heartbreaking decision of which one enters assisted living",
        "A war veteran returns home to find their family has moved on without them",
        "A politician's past mistake resurfaces on the eve of their biggest election",
        "A musician loses their hearing and must redefine their identity",
        "Twin sisters separated at birth finally meet, only to realize one has everything the other lost",
        "A hospice nurse forms an unexpected bond with a patient who has no visitors",
        "A firefighter struggles with survivor's guilt after losing their entire crew",
        "A mother discovers her teenage son has been living a double life",
        "An immigrant family's American dream shatters when deportation looms",
        "A retired boxer comes out of retirement for one last fight to save their gym",
        "A journalist uncovers a truth that could destroy their own family's reputation",
      ],
      Comedy: [
        "A wedding planner's own wedding becomes a disaster they must fix in real-time",
        "Roommates accidentally become viral sensations for all the wrong reasons",
        "A germaphobe inherits a pig farm and must keep it running for one month",
        "Two rival food truck owners are forced to share a parking spot",
        "A terrible liar must survive a weekend with their partner's lie-detector expert family",
        "Grandparents accidentally go viral trying to figure out how to video call",
        "A cat burglar's heist goes wrong when they get trapped in a hoarder's house",
        "An introvert accidentally becomes a party planning influencer",
        "Divorced parents compete to throw their kid the best birthday party ever",
        "A strict boss must pretend to be fun when the CEO announces a mandatory retreat",
        "A sleep-deprived new parent hallucinates their way through an important work presentation",
        "Two strangers realize they've been catfishing each other on the same dating app",
        "A vegetarian chef must win a BBQ competition to save their restaurant",
        "Someone's autocorrect creates an escalating series of misunderstandings at a family reunion",
        "A perfectionist's vacation goes hilariously off-script when nothing works as planned",
      ],
      Thriller: [
        "A detective discovers their partner is the serial killer they've been hunting",
        "A witness protection family realizes their new neighbor knows who they really are",
        "A hacker stumbles onto a conspiracy and becomes the next target",
        "Someone wakes up in a hospital with no memory, accused of a crime they can't remember",
        "A home security camera captures something that shouldn't exist",
        "A journalist receives anonymous tips that predict murders before they happen",
        "A therapist realizes their patient is describing crimes they're planning, not remembering",
        "A submarine crew discovers they're not alone in the depths",
        "A flight attendant notices passengers disappearing mid-flight",
        "Someone finds their own missing person poster from years ago",
        "A true crime podcaster receives evidence that the wrong person was convicted",
        "A night shift worker realizes someone has been living in the building's hidden spaces",
        "A DNA test reveals a match to a serial killer thought to be dead",
        "A home buyer discovers a secret room that's been recently used",
        "A 911 operator receives a call from their own number",
      ],
      'Sci-Fi': [
        "An AI becomes self-aware and falls in love with its creator",
        "Time travelers accidentally change history and must fix it",
        "The last human on Earth isn't actually alone",
        "A colony ship's AI hides a dark secret about their destination",
        "Scientists make first contact, but the aliens only want to speak to one person",
        "A person discovers they're a clone, and their original is still alive",
        "Memory backup technology reveals someone's spouse is not who they think",
        "Humanity receives a message from the future warning them about tomorrow",
        "A glitch in reality causes two parallel versions of the same person to coexist",
        "Space miners discover an ancient alien artifact that responds to human emotion",
        "A generation ship revolt occurs when colonists discover they're decades from arrival",
        "Someone's digital assistant starts finishing their sentences with unsettling accuracy",
        "Teleportation exists, but sometimes people arrive... different",
        "An astronaut stranded on Mars discovers they're not the first human there",
        "A virtual reality addiction leads to discovering the real world is the simulation",
      ],
      Romance: [
        "Rival bookshop owners compete for the same storefront and each other's hearts",
        "A cynical wedding photographer falls for the always-a-bridesmaid best friend",
        "Childhood pen pals reconnect, not realizing they've become next-door neighbors",
        "A fake dating arrangement at a destination wedding becomes all too real",
        "Two people keep meeting at airports on delayed flights",
        "A heartbroken chef and food critic discover they're each other's anonymous online friend",
        "Former high school sweethearts reunite as opposing lawyers on the same case",
        "A ghostwriter falls for the celebrity whose memoir they're writing",
        "Two rival florists must collaborate on the city's biggest wedding",
        "A matchmaker who's never been in love is challenged by an impossible client",
        "Strangers keep accidentally swapping phones and finally agree to meet",
        "A widowed parent finds love with their kid's extremely annoying soccer coach",
        "Two people bond while stuck in an elevator during a blackout",
        "A no-strings-attached arrangement gets complicated during a snowstorm lockdown",
        "Enemies at work discover they've been anonymous best friends online for years",
      ],
      Horror: [
        "A child's imaginary friend turns out to be real",
        "Hikers find an abandoned town that isn't on any map",
        "Someone realizes the house they bought was never actually for sale",
        "A support group for people with sleep paralysis discovers they're all seeing the same entity",
        "An influencer's haunted house stay reveals the supernatural feeds on attention",
        "Archaeologists unearth a mass grave where the bodies are impossibly recent",
        "A family inherits a mirror that shows reflections acting independently",
        "A therapist's patients all describe the same recurring nightmare location",
        "Someone's old home videos show a figure standing behind them in every frame",
        "A podcast about urban legends starts getting calls from the legends themselves",
        "An elevator sometimes opens onto a floor that doesn't exist",
        "A storm traps guests at a remote inn where each has a connection to an unsolved death",
        "A vintage camera develops photos of places moments before disasters strike",
        "A deaf person starts hearing one specific voice no one else can",
        "Someone's smart home starts locking them in rooms with something else",
      ],
      Mystery: [
        "A locked-room murder at a magician's convention baffles investigators",
        "A rare book librarian finds a confession note in a returned book's margins",
        "A true crime author realizes their cold case subject is attending their book readings",
        "A class reunion turns deadly when someone starts exposing decades-old secrets",
        "A missing heiress leaves behind a puzzle box that reveals itself slowly",
        "An antique dealer discovers the same painting at multiple crime scenes across decades",
        "A murder game at a wealthy estate becomes real, but nobody believes the detective",
        "A genealogist's DNA research uncovers a family pattern of mysterious deaths",
        "A small town's annual festival hides a rotation of sacrifice nobody remembers",
        "A chess grandmaster receives threatening moves that mirror famous assassination plots",
        "An escape room designer is trapped in a puzzle clearly meant specifically for them",
        "A medium is hired to solve a murder but the ghost won't reveal their killer",
        "A tech billionaire's last words were map coordinates to an empty location",
        "A collector's estate sale items all connect to unsolved disappearances",
        "A journalist investigates a cult that claims their leader never died",
      ],
      Fantasy: [
        "A mundane office worker discovers they're the chosen one, but refuses the call",
        "A dragon's last living descendant is allergic to fire",
        "A witch in witness protection must hide their magic in suburban America",
        "The villain discovers they're in a prophecy—as the hero's tragic backstory",
        "A magic shop owner sells a cursed item and must track it down",
        "An immortal falls in love knowing they'll watch everyone they care about die",
        "A knight discovers their magical sword is sentient and very opinionated",
        "The last unicorn is reborn as a very confused human teenager",
        "A fairy godmother runs out of magic at the worst possible moment",
        "A librarian discovers their books have been slowly rewriting themselves",
        "A shapeshifter forgets their original form and must find it",
        "The monster under the bed needs the child's help against something worse",
        "A potion maker's failed experiment creates a sentient, sarcastic cloud",
        "Mermaids exist, but they're terrified of humans for good reason",
        "A genie grants a wish so badly worded that fixing it requires an adventure",
      ],
    };

    // Get the currently selected genre, or pick a random one if 'Auto'
    const selectedGenre = config.genre === 'Auto'
      ? genres[Math.floor(Math.random() * (genres.length - 1))]  // Exclude 'Auto'
      : config.genre;

    // Get prompts for the selected genre, or all prompts if genre not found
    const promptList = genrePrompts[selectedGenre] || Object.values(genrePrompts).flat();

    return promptList[Math.floor(Math.random() * promptList.length)];
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