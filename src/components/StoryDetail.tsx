import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Typography,
  IconButton,
  Chip,
  LinearProgress,
  Paper,
  Tooltip,
  alpha,
  Button,
  Collapse,
  Divider,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  AutoStories as StoryIcon,
  ViewList as ShotlistIcon,
  Chat as ChatIcon,
  Settings as SettingsIcon,
  Style as StyleIcon,
  Videocam as ScenesIcon,
  Movie as MovieIcon,
  Replay as ReplayIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  HourglassEmpty as PendingIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Build as BuildIcon,
} from '@mui/icons-material';

// Import the tab components
import StoryTab from './story-tabs/StoryTab';
import ShotlistTab from './story-tabs/ShotlistTab';
import AIChatTab from './story-tabs/AIChatTab';
import GenerationSettingsTab from './story-tabs/GenerationSettingsTab';
import StyleSheetTab from './story-tabs/StyleSheetTab';
import ScenesTab from './story-tabs/ScenesTab';
import PipelineStepsTab from './story-tabs/PipelineStepsTab';

import { useStore, StepCheckpoint } from '../store/useStore';
import { EnhancedStory, AILogEntry } from '../types/storyTypes';
import { aiLogService } from '../services/aiLogService';
import { getGenerationMethod, GenerationMethodId } from '../types/generationMethods';
import { sequentialAiPipelineService } from '../services/sequentialAiPipeline';

interface StoryDetailProps {
  storyId: string;
  queueItemId?: string;
  onBack: () => void;
}

// Raw character data from AI (with both snake_case and camelCase variants)
interface RawCharacter {
  id?: string;
  name?: string;
  role?: string;
  physical_description?: string;
  physicalDescription?: string;
  age_range?: string;
  age?: string;
  gender?: string;
  clothing?: string;
  clothing_style?: string;
  distinctiveFeatures?: string[];
  distinctive_features?: string[];
  personality?: string;
  personality_traits?: string;
  visualPrompt?: string;
  visual_prompt?: string;
  importance_level?: number;
  importanceLevel?: number;
  screenTime?: number;
  screen_time?: number;
}

// Raw location data from AI (with both snake_case and camelCase variants)
interface RawLocation {
  id?: string;
  name?: string;
  type?: string;
  environment_type?: string;
  description?: string;
  atmosphere?: string;
  lighting?: string;
  lighting_style?: string;
  timeOfDay?: string;
  time_of_day?: string;
  weather?: string;
  visualStyle?: string;
  colorPalette?: string[];
  color_palette?: string[];
  keyElements?: string[];
  key_elements?: string[];
  visualPrompt?: string;
  visual_prompt?: string;
  usedInShots?: string[];
  estimatedComplexity?: string;
}

const StoryDetail: React.FC<StoryDetailProps> = ({ storyId, queueItemId, onBack }) => {
  const { queue, stories, updateStory, checkpoints, renderQueue, updateQueueItem, getModelConfigsFromAssignments } = useStore();
  const [currentTab, setCurrentTab] = useState(0);
  const [storyData, setStoryData] = useState<EnhancedStory | null>(null);
  const [aiLogs, setAiLogs] = useState<AILogEntry[]>([]);
  const [showStepDetails, setShowStepDetails] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  // Removed updateCounter - using promptSignature instead for reactivity

  // Get checkpoint for this story
  const checkpoint: StepCheckpoint | null = checkpoints[storyId] || null;

  // Find queue item and story data
  const queueItem = queueItemId ? queue.find(item => item.id === queueItemId) : null;
  // During generation, story ID equals queue item ID
  // Try both storyId and queueItemId to find the story
  const story = stories.find(story => story.id === storyId) ||
                (queueItemId ? stories.find(story => story.id === queueItemId) : null);

  // Calculate prompts count for reactivity detection
  const shotsWithPrompts = story?.shots?.filter(s => s.comfyUIPositivePrompt)?.length || 0;
  const promptSignature = story?.shots?.map(s => s.comfyUIPositivePrompt ? '1' : '0').join('') || '';
  // Also track character and location prompts for reactivity
  const characterPromptSignature = story?.characters?.map(c => c.visualPrompt ? '1' : '0').join('') || '';
  const locationPromptSignature = story?.locations?.map(l => l.visualPrompt ? '1' : '0').join('') || '';
  // Track HoloCine scenes for scene-based pipeline reactivity
  const holoCineScenesCount = story?.holoCineScenes?.length || 0;
  const holoCineScenesSignature = story?.holoCineScenes?.map(s => `${s.sceneNumber}:${s.shotCaptions?.length || 0}`).join(',') || '';

  // Debug logging for story lookup - check for prompt updates
  console.log('🔍 [StoryDetail] Looking up story:', {
    storyId,
    queueItemId,
    foundStory: !!story,
    storyTitle: story?.title,
    storyContentLength: story?.content?.length || 0,
    storyShotsCount: story?.shots?.length || 0,
    shotsWithPositivePrompts: shotsWithPrompts,
    promptSignature,
    firstShotHasPrompt: !!story?.shots?.[0]?.comfyUIPositivePrompt,
    holoCineScenesCount,
    holoCineScenesSignature,
    generationMethod: story?.generationMethod || 'not set',
    storyUpdatedAt: story?.updatedAt,
    totalStoriesInStore: stories.length
  });

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  // Handle resume from checkpoint
  const handleResume = async () => {
    if (!queueItem || isResuming) return;

    // Get model configs from pipeline assignments
    const modelConfigs = getModelConfigsFromAssignments();
    if (modelConfigs.length === 0) {
      console.error('No model configs available for resume. Please configure models in Settings.');
      return;
    }

    setIsResuming(true);
    try {
      // Update queue item status to processing
      updateQueueItem(queueItem.id, { status: 'processing', progress: 0 });

      // Resume from checkpoint
      await sequentialAiPipelineService.resumeFromCheckpoint(
        queueItem,
        modelConfigs,
        (progress) => {
          updateQueueItem(queueItem.id, {
            progress: progress.overallProgress,
            currentStep: progress.currentStep
          });
        }
      );

      // Update queue item status to completed
      updateQueueItem(queueItem.id, { status: 'completed', progress: 100 });
    } catch (error: any) {
      console.error('Resume failed:', error);
      updateQueueItem(queueItem.id, {
        status: 'failed',
        error: error.message || 'Resume failed'
      });
    } finally {
      setIsResuming(false);
    }
  };

  // Handle restart from beginning
  const handleRestart = async () => {
    if (!queueItem || isResuming) return;

    // Get model configs from pipeline assignments
    const modelConfigs = getModelConfigsFromAssignments();
    if (modelConfigs.length === 0) {
      console.error('No model configs available for restart. Please configure models in Settings.');
      return;
    }

    setIsResuming(true);
    try {
      // Update queue item status to processing
      updateQueueItem(queueItem.id, { status: 'processing', progress: 0 });

      // Restart from beginning
      await sequentialAiPipelineService.restartProcessing(
        queueItem,
        modelConfigs,
        (progress) => {
          updateQueueItem(queueItem.id, {
            progress: progress.overallProgress,
            currentStep: progress.currentStep
          });
        }
      );

      // Update queue item status to completed
      updateQueueItem(queueItem.id, { status: 'completed', progress: 100 });
    } catch (error: any) {
      console.error('Restart failed:', error);
      updateQueueItem(queueItem.id, {
        status: 'failed',
        error: error.message || 'Restart failed'
      });
    } finally {
      setIsResuming(false);
    }
  };

  // Listen for AI log updates
  useEffect(() => {
    const handleLogUpdate = (event: CustomEvent) => {
      const { storyId: logStoryId } = event.detail;
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
        characters: Array.isArray(story.characters) ? story.characters.map((char: RawCharacter, index: number) => ({
          id: char?.id || `char_${char?.name || 'unknown'}_${index}`,
          name: char?.name || 'Unknown Character',
          role: (char?.role === 'main' ? 'protagonist' : (char?.role || 'supporting')) as 'protagonist' | 'antagonist' | 'supporting' | 'background',
          physicalDescription: char?.physical_description || char?.physicalDescription || '',
          age: char?.age_range || char?.age || 'adult',
          gender: char?.gender || 'unspecified',
          clothing: char?.clothing || char?.clothing_style || '',
          distinctiveFeatures: char?.distinctiveFeatures || char?.distinctive_features || [],
          personality: char?.personality || char?.personality_traits || '',
          motivations: [],
          visualPrompt: char?.visualPrompt || char?.visual_prompt || '',
          appearanceInShots: [],
          importanceLevel: (char?.importance_level || char?.importanceLevel || 3) as 1 | 2 | 3 | 4 | 5,
          screenTime: char?.screenTime || char?.screen_time || 0,
          createdAt: new Date(),
        })) : [],
        locations: Array.isArray(story.locations) ? story.locations.map((loc: RawLocation, index: number) => ({
          id: loc?.id || `loc_${loc?.name || 'unknown'}_${index}`,
          name: loc?.name || 'Unknown Location',
          type: (loc?.type || loc?.environment_type || 'interior') as 'interior' | 'exterior' | 'mixed',
          description: loc?.description || '',
          atmosphere: loc?.atmosphere || '',
          lighting: (loc?.lighting || loc?.lighting_style || 'natural') as 'natural' | 'artificial' | 'mixed' | 'dramatic' | 'soft',
          timeOfDay: (loc?.timeOfDay || loc?.time_of_day || 'day') as 'dawn' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night' | 'variable',
          weather: loc?.weather || '',
          visualStyle: loc?.visualStyle || '',
          colorPalette: loc?.colorPalette || loc?.color_palette || [],
          keyElements: loc?.keyElements || loc?.key_elements || [],
          visualPrompt: loc?.visualPrompt || loc?.visual_prompt || '',
          usedInShots: loc?.usedInShots || [],
          estimatedComplexity: (loc?.estimatedComplexity || 'moderate') as 'simple' | 'moderate' | 'complex',
          createdAt: new Date(),
        })) : [],
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
        locationsCount: enhancedStory.locations.length,
        status: enhancedStory.status,
        shotsWithPrompts: enhancedStory.shots.filter(s => s.comfyUIPositivePrompt).length,
        charactersWithPrompts: enhancedStory.characters.filter(c => c.visualPrompt).length,
        locationsWithPrompts: enhancedStory.locations.filter(l => l.visualPrompt).length,
        firstShotPrompts: enhancedStory.shots[0] ? {
          hasPositive: !!enhancedStory.shots[0].comfyUIPositivePrompt,
          hasNegative: !!enhancedStory.shots[0].comfyUINegativePrompt,
          positivePreview: enhancedStory.shots[0].comfyUIPositivePrompt?.slice(0, 50)
        } : 'no shots',
        firstCharacterPrompt: enhancedStory.characters[0]?.visualPrompt?.slice(0, 50) || 'none',
        firstLocationPrompt: enhancedStory.locations[0]?.visualPrompt?.slice(0, 50) || 'none'
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
  // Depend on promptSignature and holoCineScenesSignature to ensure re-render when data updates
  // These strings change whenever shots/scenes update, forcing the useEffect to run
  }, [story, story?.updatedAt, promptSignature, characterPromptSignature, locationPromptSignature, holoCineScenesSignature, queueItem, storyId]);

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

  // Determine generation method from story or queue item config
  const generationMethodId: GenerationMethodId = useMemo(() => {
    // First check story's generationMethod
    if (story?.generationMethod) return story.generationMethod;
    // Then check queue item config
    if (queueItem?.config?.generationMethod) return queueItem.config.generationMethod;
    // Fallback: if story has holoCineScenes but no shots, it's likely HoloCine
    if (story?.holoCineScenes && story.holoCineScenes.length > 0 && (!story?.shots || story.shots.length === 0)) {
      return 'holocine';
    }
    // Default to holocine (current default)
    return 'holocine';
  }, [story?.generationMethod, queueItem?.config?.generationMethod, story?.holoCineScenes, story?.shots]);

  const generationMethod = getGenerationMethod(generationMethodId);
  const isShotBased = generationMethod?.pipelineType === 'shot-based';

  // Determine if story is in manual mode
  const isManualMode = queueItem?.manualMode || queueItem?.isCustom || false;

  // Determine which tabs to show based on generation method and manual mode
  const tabs = useMemo(() => {
    // Manual mode: Story, Style, Shots/Scenes, Logs (Pipeline), Settings
    if (isManualMode) {
      const manualTabs = [
        { id: 'story', icon: <StoryIcon />, label: 'Story', alwaysShow: true },
        { id: 'stylesheet', icon: <StyleIcon />, label: 'Style', alwaysShow: true },
      ];

      // Add shots/scenes based on generation method
      if (isShotBased) {
        manualTabs.push({ id: 'shotlist', icon: <ShotlistIcon />, label: 'Shots', alwaysShow: true });
        if (story?.holoCineScenes && story.holoCineScenes.length > 0) {
          manualTabs.push({ id: 'scenes', icon: <ScenesIcon />, label: 'Scenes', alwaysShow: false });
        }
      } else {
        manualTabs.push({ id: 'scenes', icon: <ScenesIcon />, label: 'Scenes', alwaysShow: true });
        if (story?.shots && story.shots.length > 0) {
          manualTabs.push({ id: 'shotlist', icon: <ShotlistIcon />, label: 'Shots', alwaysShow: false });
        }
      }

      // Logs and Settings at the end
      manualTabs.push(
        { id: 'pipeline', icon: <BuildIcon />, label: 'Logs', alwaysShow: true },
        { id: 'settings', icon: <SettingsIcon />, label: 'Settings', alwaysShow: true }
      );

      return manualTabs;
    }

    // Auto mode: Original tab order
    const baseTabs = [
      { id: 'story', icon: <StoryIcon />, label: 'Story', alwaysShow: true },
    ];

    if (isShotBased) {
      // Shot-based: Show Shotlist prominently, Scenes hidden/secondary
      baseTabs.push({ id: 'shotlist', icon: <ShotlistIcon />, label: 'Shotlist', alwaysShow: true });
      // Only show Scenes tab if there are scenes (for backwards compatibility)
      if (story?.holoCineScenes && story.holoCineScenes.length > 0) {
        baseTabs.push({ id: 'scenes', icon: <ScenesIcon />, label: 'Scenes', alwaysShow: false });
      }
    } else {
      // Scene-based (HoloCine): Show Scenes prominently, Shotlist hidden
      baseTabs.push({ id: 'scenes', icon: <ScenesIcon />, label: 'Scenes', alwaysShow: true });
      // Only show Shotlist if there are shots (for backwards compatibility)
      if (story?.shots && story.shots.length > 0) {
        baseTabs.push({ id: 'shotlist', icon: <ShotlistIcon />, label: 'Shotlist', alwaysShow: false });
      }
    }

    // Always show these tabs
    baseTabs.push(
      { id: 'stylesheet', icon: <StyleIcon />, label: 'Style Sheet', alwaysShow: true },
      { id: 'pipeline', icon: <BuildIcon />, label: 'Pipeline', alwaysShow: true },
      { id: 'aichat', icon: <ChatIcon />, label: 'AI Chat', alwaysShow: true },
      { id: 'settings', icon: <SettingsIcon />, label: 'Settings', alwaysShow: true }
    );

    return baseTabs;
  }, [isManualMode, isShotBased, story?.holoCineScenes, story?.shots]);

  // Map tab index to tab id for content rendering
  const getTabIdForIndex = (index: number) => tabs[index]?.id || 'story';

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
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            {/* Generation Method Badge */}
            {generationMethod && (
              <Tooltip title={`${generationMethod.pipelineType === 'scene-based' ? 'Scene-based' : 'Shot-based'} pipeline`}>
                <Chip
                  icon={<MovieIcon sx={{ fontSize: 16 }} />}
                  label={generationMethod.name}
                  size="small"
                  sx={{
                    bgcolor: alpha(generationMethod.color, 0.15),
                    color: generationMethod.color,
                    borderColor: generationMethod.color,
                    '& .MuiChip-icon': { color: generationMethod.color }
                  }}
                  variant="outlined"
                />
              </Tooltip>
            )}
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
                  <Box component="span" sx={{ color: generationMethod?.color || 'primary.main', fontWeight: 500 }}>
                    {currentStep === 'story' && '📝 Writing Story'}
                    {currentStep === 'segments' && '📑 Segmenting Story'}
                    {currentStep === 'shots' && '🎬 Creating Shots'}
                    {currentStep === 'characters' && '👥 Analyzing Characters'}
                    {currentStep === 'holocine_scenes_direct' && '🎬 Creating HoloCine Scenes'}
                    {currentStep === 'holocine_scenes' && '🎬 Organizing HoloCine Scenes'}
                    {currentStep === 'prompts' && '🎨 Generating Prompts'}
                    {currentStep === 'comfyui_prompts' && '🖼️ ComfyUI Prompts'}
                    {currentStep === 'narration' && '🎙️ Adding Narration'}
                    {currentStep === 'music' && '🎵 Adding Music'}
                    {currentStep === 'completed' && '✅ Finalizing'}
                    {!['story', 'segments', 'shots', 'characters', 'holocine_scenes_direct', 'holocine_scenes', 'prompts', 'comfyui_prompts', 'narration', 'music', 'completed'].includes(currentStep) && currentStep}
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

          {/* Step Progress with Checkpoint Info */}
          {checkpoint && checkpoint.completedSteps.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Divider sx={{ mb: 1 }} />
              <Box
                sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                onClick={() => setShowStepDetails(!showStepDetails)}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" fontWeight="medium">
                    Step Progress
                  </Typography>
                  <Chip
                    size="small"
                    label={`${checkpoint.completedSteps.length} completed`}
                    color="success"
                    sx={{ height: 20, fontSize: '0.7rem' }}
                  />
                  {checkpoint.currentStep && (
                    <Chip
                      size="small"
                      icon={<ErrorIcon sx={{ fontSize: 14 }} />}
                      label={`Failed at ${checkpoint.currentStep}`}
                      color="error"
                      sx={{ height: 20, fontSize: '0.7rem' }}
                    />
                  )}
                  {checkpoint.resumeCount > 0 && (
                    <Chip
                      size="small"
                      icon={<ReplayIcon sx={{ fontSize: 14 }} />}
                      label={`Resumed ${checkpoint.resumeCount}x`}
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.7rem' }}
                    />
                  )}
                </Box>
                <IconButton size="small">
                  {showStepDetails ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              </Box>

              <Collapse in={showStepDetails}>
                <Box sx={{ mt: 1, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                    {['story', 'segments', 'shots', 'characters', 'holocine_scenes', 'prompts', 'narration', 'music'].map(step => {
                      const isCompleted = checkpoint.completedSteps.includes(step);
                      const isFailed = checkpoint.currentStep === step && checkpoint.stepData[step]?.error;
                      const isPending = !isCompleted && !isFailed;

                      return (
                        <Chip
                          key={step}
                          size="small"
                          icon={
                            isCompleted ? <CheckIcon sx={{ fontSize: 14 }} /> :
                            isFailed ? <ErrorIcon sx={{ fontSize: 14 }} /> :
                            <PendingIcon sx={{ fontSize: 14 }} />
                          }
                          label={step.replace('_', ' ')}
                          color={isCompleted ? 'success' : isFailed ? 'error' : 'default'}
                          variant={isPending ? 'outlined' : 'filled'}
                          sx={{ height: 24, fontSize: '0.7rem', textTransform: 'capitalize' }}
                        />
                      );
                    })}
                  </Box>

                  {/* Action buttons for retry/resume */}
                  {(hasError || checkpoint.currentStep) && queueItem && (
                    <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                      <Button
                        size="small"
                        variant="contained"
                        color="warning"
                        startIcon={<ReplayIcon />}
                        onClick={handleResume}
                        disabled={isResuming || isGenerating}
                      >
                        {isResuming ? 'Resuming...' : `Resume from ${checkpoint.currentStep || 'last step'}`}
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={<ReplayIcon />}
                        onClick={handleRestart}
                        disabled={isResuming || isGenerating}
                      >
                        {isResuming ? 'Restarting...' : 'Restart'}
                      </Button>
                    </Box>
                  )}

                  {/* Checkpoint metadata */}
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    Last updated: {checkpoint.lastUpdated ? new Date(checkpoint.lastUpdated).toLocaleString() : 'Unknown'}
                  </Typography>
                </Box>
              </Collapse>
            </Box>
          )}

          {/* Render Queue Status */}
          {(() => {
            const storyRenderJobs = renderQueue.filter(j => j.storyId === storyId);
            if (storyRenderJobs.length === 0) return null;

            const queuedCount = storyRenderJobs.filter(j => j.status === 'queued' || j.status === 'assigned').length;
            const renderingCount = storyRenderJobs.filter(j => j.status === 'rendering').length;
            const completedCount = storyRenderJobs.filter(j => j.status === 'completed').length;
            const failedCount = storyRenderJobs.filter(j => j.status === 'failed').length;

            return (
              <Box sx={{ mt: 2 }}>
                <Divider sx={{ mb: 1 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <MovieIcon fontSize="small" color="primary" />
                    <Typography variant="body2" fontWeight="medium">
                      Video Render Queue
                    </Typography>
                    {queuedCount > 0 && (
                      <Chip size="small" label={`${queuedCount} queued`} color="default" sx={{ height: 20, fontSize: '0.7rem' }} />
                    )}
                    {renderingCount > 0 && (
                      <Chip size="small" label={`${renderingCount} rendering`} color="primary" sx={{ height: 20, fontSize: '0.7rem' }} />
                    )}
                    {completedCount > 0 && (
                      <Chip size="small" label={`${completedCount} done`} color="success" sx={{ height: 20, fontSize: '0.7rem' }} />
                    )}
                    {failedCount > 0 && (
                      <Chip size="small" label={`${failedCount} failed`} color="error" sx={{ height: 20, fontSize: '0.7rem' }} />
                    )}
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => window.location.href = '/render-queue'}
                  >
                    View Queue
                  </Button>
                </Box>
              </Box>
            );
          })()}
        </Box>
      </Paper>

      {/* Tab Navigation - Dynamic based on generation method */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={currentTab} onChange={handleTabChange} aria-label="story detail tabs">
          {tabs.map((tab, index) => (
            <Tab
              key={tab.id}
              icon={tab.icon}
              label={tab.label}
              sx={!tab.alwaysShow ? { opacity: 0.7 } : undefined}
            />
          ))}
        </Tabs>
      </Box>

      {/* Tab Content - Renders based on dynamic tab IDs */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {/* Story Tab - Always first */}
        {getTabIdForIndex(currentTab) === 'story' && (
          <StoryTab
            storyData={storyData}
            isGenerating={isGenerating}
            isManualMode={isManualMode}
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
        )}

        {/* Shotlist Tab - For shot-based pipelines */}
        {getTabIdForIndex(currentTab) === 'shotlist' && (
          <ShotlistTab
            storyData={storyData}
            storyId={storyId}
            isManualMode={isManualMode}
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
            onAddShot={(shotData) => {
              // Add new shot in manual mode
              if (storyData) {
                const newShot = {
                  id: `shot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  shotNumber: shotData.shotNumber || (storyData.shots?.length || 0) + 1,
                  title: `Shot ${shotData.shotNumber || (storyData.shots?.length || 0) + 1}`,
                  description: shotData.description || '',
                  duration: shotData.duration || 3,
                  cameraMovement: shotData.cameraMovement || 'static',
                  shotType: shotData.shotType || 'medium',
                  angle: shotData.angle || 'eye-level',
                  characters: shotData.characters || [],
                  locations: shotData.locations || [],
                  actions: [],
                  dialogue: [],
                  narration: shotData.narration || '',
                  visualPrompt: shotData.visualPrompt || '',
                  comfyUIPositivePrompt: shotData.comfyUIPositivePrompt || '',
                  comfyUINegativePrompt: shotData.comfyUINegativePrompt || '',
                  renderStatus: 'pending' as const,
                  createdAt: new Date(),
                } as any;
                const updatedShots = [...(storyData.shots || []), newShot];
                setStoryData({ ...storyData, shots: updatedShots } as any);

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
        )}

        {/* Scenes Tab - For scene-based (HoloCine) pipelines */}
        {getTabIdForIndex(currentTab) === 'scenes' && (
          <ScenesTab
            scenes={story?.holoCineScenes || []}
            characterMap={story?.holoCineCharacterMap || {}}
            storyId={storyId}
          />
        )}

        {/* Style Sheet Tab */}
        {getTabIdForIndex(currentTab) === 'stylesheet' && (
          <StyleSheetTab
            characters={storyData?.characters || []}
            locations={storyData?.locations || []}
            storyId={storyId}
            isManualMode={isManualMode}
            storyContent={storyData?.content}
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
            onAddCharacter={(character) => {
              // Add new character
              if (storyData) {
                const newChar = {
                  ...character,
                  id: `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  name: character.name || 'Unnamed Character',
                  role: character.role || 'supporting',
                  createdAt: new Date(),
                } as any;
                const updatedCharacters = [...(storyData.characters || []), newChar];
                setStoryData({ ...storyData, characters: updatedCharacters } as any);

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
            onAddLocation={(location) => {
              // Add new location
              if (storyData) {
                const newLoc = {
                  ...location,
                  id: `loc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  name: location.name || 'Unnamed Location',
                  type: location.type || 'interior',
                  createdAt: new Date(),
                } as any;
                const updatedLocations = [...(storyData.locations || []), newLoc];
                setStoryData({ ...storyData, locations: updatedLocations } as any);

                // Update store
                updateStory(storyId, { locations: updatedLocations });
              }
            }}
          />
        )}

        {/* Pipeline Steps Tab */}
        {getTabIdForIndex(currentTab) === 'pipeline' && (
          <PipelineStepsTab
            storyId={storyId}
            queueItem={queueItem || null}
            isCustomStory={queueItem?.isCustom || false}
            isManualMode={queueItem?.manualMode || false}
            onConvertToManual={() => {
              // Convert this story to manual mode
              if (queueItem) {
                updateQueueItem(queueItem.id, {
                  manualMode: true,
                  // Preserve any completed steps
                  completedSteps: queueItem.completedSteps || [],
                });
              }
            }}
          />
        )}

        {/* AI Chat Tab */}
        {getTabIdForIndex(currentTab) === 'aichat' && (
          <AIChatTab
            aiLogs={aiLogs}
            storyId={storyId}
            onClearLogs={() => {
              aiLogService.clearLogs(storyId);
              setAiLogs([]);
            }}
          />
        )}

        {/* Settings Tab */}
        {getTabIdForIndex(currentTab) === 'settings' && (
          <GenerationSettingsTab
            queueItem={queueItem || null}
            storyData={storyData}
          />
        )}
      </Box>
    </Box>
  );
};

export default StoryDetail;