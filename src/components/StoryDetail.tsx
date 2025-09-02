import React, { useState, useEffect } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Typography,
  IconButton,
  Chip,
  LinearProgress,
  Paper,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  AutoStories as StoryIcon,
  ViewList as ShotlistIcon,
  Chat as ChatIcon,
  Settings as SettingsIcon,
  Style as StyleIcon,
} from '@mui/icons-material';

// Import the tab components
import StoryTab from './story-tabs/StoryTab';
import ShotlistTab from './story-tabs/ShotlistTab';
import AIChatTab from './story-tabs/AIChatTab';
import GenerationSettingsTab from './story-tabs/GenerationSettingsTab';
import StyleSheetTab from './story-tabs/StyleSheetTab';

import { useStore } from '../store/useStore';
import { EnhancedStory, AILogEntry } from '../types/storyTypes';
import { aiLogService } from '../services/aiLogService';

interface StoryDetailProps {
  storyId: string;
  queueItemId?: string;
  onBack: () => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`story-tabpanel-${index}`}
      aria-labelledby={`story-tab-${index}`}
    >
      {value === index && <Box sx={{ p: 0 }}>{children}</Box>}
    </div>
  );
}

const StoryDetail: React.FC<StoryDetailProps> = ({ storyId, queueItemId, onBack }) => {
  const { queue, stories, updateStory } = useStore();
  const [currentTab, setCurrentTab] = useState(0);
  const [storyData, setStoryData] = useState<EnhancedStory | null>(null);
  const [aiLogs, setAiLogs] = useState<AILogEntry[]>([]);

  // Find queue item and story data
  const queueItem = queueItemId ? queue.find(item => item.id === queueItemId) : null;
  const story = stories.find(story => story.id === storyId);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  // Listen for AI log updates
  useEffect(() => {
    const handleLogUpdate = (event: CustomEvent) => {
      const { storyId: logStoryId, entry } = event.detail;
      if (logStoryId === storyId) {
        // Get formatted logs from the service
        const logs = aiLogService.getLogs(storyId);
        // Convert to AILogEntry format for the component
        const formattedLogs: AILogEntry[] = logs.map((log, index) => ({
          id: `log_${log.timestamp.getTime()}_${index}`,
          timestamp: log.timestamp,
          level: log.type === 'error' ? 'error' : log.type === 'response' ? 'success' : 'info',
          step: log.step,
          message: log.type === 'request' ? `Sending request to ${log.model}` :
                  log.type === 'response' ? `Received response (${log.metadata?.responseLength} chars)` :
                  log.type === 'error' ? log.error || 'Unknown error' :
                  'Processing...',
          model: log.model,
          details: {
            ...(log.prompt && { userPrompt: log.prompt }),
            ...(log.response && { response: log.response }),
            ...(log.error && { error: log.error }),
            ...(log.metadata && { ...log.metadata }),
            ...(log.node && { node: log.node })
          }
        }));
        setAiLogs(formattedLogs);
      }
    };

    window.addEventListener('ai-log-update', handleLogUpdate as EventListener);
    
    // Load initial logs
    const initialLogs = aiLogService.getLogs(storyId);
    if (initialLogs.length > 0) {
      const formattedLogs: AILogEntry[] = initialLogs.map((log, index) => ({
        id: `log_${log.timestamp.getTime()}_${index}`,
        timestamp: log.timestamp,
        level: log.type === 'error' ? 'error' : log.type === 'response' ? 'success' : 'info',
        step: log.step,
        message: log.type === 'request' ? `Sending request to ${log.model}` :
                log.type === 'response' ? `Received response (${log.metadata?.responseLength} chars)` :
                log.type === 'error' ? log.error || 'Unknown error' :
                'Processing...',
        model: log.model,
        details: {
          ...(log.prompt && { userPrompt: log.prompt }),
          ...(log.response && { response: log.response }),
          ...(log.error && { error: log.error }),
          ...(log.metadata && { ...log.metadata }),
          ...(log.node && { node: log.node })
        }
      }));
      setAiLogs(formattedLogs);
    }

    return () => {
      window.removeEventListener('ai-log-update', handleLogUpdate as EventListener);
    };
  }, [storyId]);

  // Load story data from store and update when queue item changes
  useEffect(() => {
    console.log('📖 StoryDetail: Loading story data', { 
      hasStory: !!story, 
      storyTitle: story?.title,
      storyId: storyId,
      queueItemStatus: queueItem?.status,
      queueItemProgress: queueItem?.progress
    });

    if (story) {
      // Convert basic story to enhanced story format for display
      const enhancedStory: EnhancedStory = {
        id: story.id,
        title: story.title,
        content: story.content,
        genre: story.genre,
        shots: Array.isArray(story.shots) ? story.shots.map((shot, index) => ({
          id: shot.id || `shot_${index}`,
          shotNumber: shot.shotNumber || index + 1,
          title: `Shot ${shot.shotNumber || index + 1}`,
          description: shot.description || '',
          duration: shot.duration || 2,
          cameraMovement: shot.camera || '',
          shotType: 'medium' as const,
          angle: 'eye-level' as const,
          characters: Array.isArray(shot.characters) ? shot.characters : [],
          locations: Array.isArray(shot.locations) ? shot.locations : [],
          actions: [],
          dialogue: [],
          narration: shot.narration || '',
          musicCue: shot.musicCue || undefined,
          visualPrompt: shot.visualPrompt || '',
          comfyUIPositivePrompt: shot.comfyUIPositivePrompt || '',
          comfyUINegativePrompt: shot.comfyUINegativePrompt || '',
          renderStatus: (shot.renderStatus || 'pending') as 'pending' | 'prompt-generated' | 'rendering' | 'completed' | 'failed',
          renderUrl: shot.renderUrl || undefined,
          createdAt: new Date(),
        })) : [],
        characters: Array.isArray(story.characters) ? story.characters.map((char, index) => ({
          id: `char_${char?.name || 'unknown'}_${index}`,
          name: char?.name || 'Unknown Character',
          role: char?.role === 'main' ? 'protagonist' : 'supporting' as const,
          physicalDescription: char?.physical_description || '',
          age: char?.age_range || 'adult',
          gender: 'unspecified',
          clothing: '',
          distinctiveFeatures: [],
          personality: '',
          motivations: [],
          visualPrompt: '',
          appearanceInShots: [],
          importanceLevel: (char?.importance_level || 3) as 1 | 2 | 3 | 4 | 5,
          screenTime: 0,
          createdAt: new Date(),
        })) : [],
        locations: [],
        musicCues: [],
        status: story.status === 'completed' ? 'completed' : 'processing',
        aiLogs: [],
        createdAt: story.createdAt ? new Date(story.createdAt) : new Date(),
        updatedAt: story.updatedAt ? new Date(story.updatedAt) : new Date(),
      };
      
      console.log('📖 Setting enhanced story data:', {
        title: enhancedStory.title,
        shotsCount: enhancedStory.shots.length,
        charactersCount: enhancedStory.characters.length,
        status: enhancedStory.status
      });
      
      setStoryData(enhancedStory);
    } else if (queueItem) {
      // If no story yet but we have a queue item, create a partial enhanced story for progress display
      const partialStory: EnhancedStory = {
        id: queueItem.id,
        title: queueItem.config.prompt.slice(0, 50) + '...',
        content: '',
        genre: queueItem.config.genre,
        shots: [],
        characters: [],
        locations: [],
        musicCues: [],
        status: queueItem.status === 'completed' ? 'completed' : 
               queueItem.status === 'failed' ? 'failed' : 'processing',
        aiLogs: queueItem.logs || [],
        createdAt: queueItem.createdAt ? new Date(queueItem.createdAt) : new Date(),
        updatedAt: new Date(),
      };
      console.log('📖 Setting partial story data for queue item:', queueItem.status);
      setStoryData(partialStory);
    } else {
      setStoryData(null);
    }
    
    // Always update AI logs from queue item if available
    if (queueItem?.logs) {
      console.log('📖 Updating AI logs from queue item:', queueItem.logs.length);
      setAiLogs(queueItem.logs);
    }
  }, [story, queueItem, storyId]);

  // Enhanced progress calculation that responds to queue item updates
  const overallProgress = React.useMemo(() => {
    // Queue item progress takes precedence during processing
    if (queueItem?.progress !== undefined && queueItem.progress >= 0) {
      return queueItem.progress;
    }
    
    if (!storyData) return 0;
    if (storyData.status === 'completed') return 100;
    if (storyData.status === 'failed') return 0;
    
    // Simple progress based on content if no queue progress available
    return storyData.content ? 50 : 10;
  }, [storyData, queueItem?.progress]);

  // Get current step from queue item for live updates
  const currentStep = queueItem?.currentStep;

  const isGenerating = queueItem?.status === 'processing' || (storyData?.status === 'processing' && queueItem?.status !== 'completed');
  const isCompleted = queueItem?.status === 'completed' || (storyData?.status === 'completed' && queueItem?.status !== 'processing');
  const hasError = queueItem?.status === 'failed' || storyData?.status === 'failed';
  const isConnected = isGenerating && !!queueItem; // Show as connected when actively processing with queue item

  // If no story found and no queue item, show error state (after all hooks)
  if (!story && !queueItem) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="h5" color="text.secondary" gutterBottom>
          Story not found
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          The requested story could not be found. It may have been deleted.
        </Typography>
        <IconButton onClick={onBack} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <ArrowBackIcon /> Back
        </IconButton>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Paper sx={{ p: 3, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <IconButton onClick={onBack} sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h4">
              {storyData?.title || queueItem?.config.prompt.slice(0, 50) || 'Story Generation'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              ID: {storyId} • Created: {queueItem?.createdAt ? new Date(queueItem.createdAt).toLocaleString() : 'Unknown'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip
              label={isCompleted ? 'Completed' : isGenerating ? 'Generating' : hasError ? 'Failed' : 'Queued'}
              color={isCompleted ? 'success' : isGenerating ? 'primary' : hasError ? 'error' : 'default'}
            />
            {isConnected && (
              <Chip label="Live Updates" color="info" size="small" />
            )}
          </Box>
        </Box>

        {/* Overall Progress */}
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Overall Progress
              {currentStep && isGenerating && (
                <>
                  {' • '}
                  <Box component="span" sx={{ color: 'primary.main', fontWeight: 500 }}>
                    {currentStep === 'story' && '📝 Writing Story'}
                    {currentStep === 'shots' && '🎬 Creating Shots'}
                    {currentStep === 'characters' && '👥 Analyzing Characters'}
                    {currentStep === 'prompts' && '🎨 Generating Prompts'}
                    {currentStep === 'comfyui_prompts' && '🖼️ ComfyUI Prompts'}
                    {currentStep === 'narration' && '🎙️ Adding Narration'}
                    {currentStep === 'music' && '🎵 Adding Music'}
                    {currentStep === 'completed' && '✅ Finalizing'}
                    {!['story', 'shots', 'characters', 'prompts', 'comfyui_prompts', 'narration', 'music', 'completed'].includes(currentStep) && currentStep}
                  </Box>
                </>
              )}
            </Typography>
            <Typography variant="body2" fontWeight="bold">
              {Math.round(overallProgress)}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={overallProgress}
            color={hasError ? 'error' : isCompleted ? 'success' : 'primary'}
            sx={{ height: 8, borderRadius: 4 }}
          />
          {isGenerating && currentStep && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              Current step: {currentStep}
            </Typography>
          )}
        </Box>
      </Paper>

      {/* Tab Navigation */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={currentTab} onChange={handleTabChange} aria-label="story detail tabs">
          <Tab icon={<StoryIcon />} label="Story" />
          <Tab icon={<ShotlistIcon />} label="Shotlist" />
          <Tab icon={<StyleIcon />} label="Style Sheet" />
          <Tab icon={<ChatIcon />} label="AI Chat" />
          <Tab icon={<SettingsIcon />} label="Settings" />
        </Tabs>
      </Box>

      {/* Tab Content */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <TabPanel value={currentTab} index={0}>
          <StoryTab 
            storyData={storyData}
            isGenerating={isGenerating}
            onUpdateStory={(updates) => {
              // Update story in store and local state
              const storeUpdates: any = {};
              if (updates.title) storeUpdates.title = updates.title;
              if (updates.content) storeUpdates.content = updates.content;
              if (updates.genre) storeUpdates.genre = updates.genre;
              updateStory(storyId, storeUpdates);
              
              // Update local state immediately
              if (storyData) {
                setStoryData({ ...storyData, ...updates });
              }
            }}
          />
        </TabPanel>

        <TabPanel value={currentTab} index={1}>
          <ShotlistTab 
            storyData={storyData}
            onUpdateShot={(shotId, updates) => {
              // Update shot in local state and store
              if (storyData && Array.isArray(storyData.shots)) {
                const updatedShots = storyData.shots.map(shot =>
                  shot.id === shotId ? { ...shot, ...updates } : shot
                );
                const updatedStory = { ...storyData, shots: updatedShots };
                setStoryData(updatedStory);
                
                // Convert to store format
                const basicShots = updatedShots.map(shot => ({
                  id: shot.id,
                  storyId: storyId,
                  shotNumber: shot.shotNumber,
                  description: shot.description,
                  duration: shot.duration,
                  frames: Math.floor(shot.duration * 24),
                  camera: 'medium shot',
                  visualPrompt: shot.visualPrompt || '',
                  comfyUIPositivePrompt: shot.comfyUIPositivePrompt || '',
                  comfyUINegativePrompt: shot.comfyUINegativePrompt || '',
                  narration: shot.narration || '',
                  musicCue: shot.musicCue || undefined,
                  renderStatus: (shot.renderStatus as 'pending' | 'rendering' | 'completed') || 'pending'
                }));
                updateStory(storyId, { shots: basicShots });
              }
            }}
          />
        </TabPanel>

        <TabPanel value={currentTab} index={2}>
          <StyleSheetTab
            characters={storyData?.characters || []}
            locations={storyData?.locations || []}
            storyId={storyId}
            onUpdateCharacter={(charId, updates) => {
              // Update character in local state
              if (storyData && Array.isArray(storyData.characters)) {
                const updatedCharacters = storyData.characters.map(char =>
                  char.id === charId ? { ...char, ...updates } : char
                );
                setStoryData({ ...storyData, characters: updatedCharacters });
                
                // Update store
                const basicCharacters = updatedCharacters.map(char => ({
                  name: char.name || 'Unknown',
                  role: char.role === 'protagonist' ? 'main' : 'supporting',
                  physical_description: char.physicalDescription || '',
                  age_range: char.age || 'adult',
                  importance_level: char.importanceLevel || 3
                }));
                updateStory(storyId, { characters: basicCharacters });
              }
            }}
            onUpdateLocation={(locId, updates) => {
              // Update location in local state
              if (storyData && Array.isArray(storyData.locations)) {
                const updatedLocations = storyData.locations.map(loc =>
                  loc.id === locId ? { ...loc, ...updates } : loc
                );
                setStoryData({ ...storyData, locations: updatedLocations });
              }
            }}
          />
        </TabPanel>

        <TabPanel value={currentTab} index={3}>
          <AIChatTab 
            aiLogs={aiLogs}
            storyId={storyId}
            onClearLogs={() => {
              aiLogService.clearLogs(storyId);
              setAiLogs([]);
            }}
          />
        </TabPanel>

        <TabPanel value={currentTab} index={4}>
          <GenerationSettingsTab 
            queueItem={queueItem || null}
            storyData={storyData}
          />
        </TabPanel>
      </Box>
    </Box>
  );
};

export default StoryDetail;