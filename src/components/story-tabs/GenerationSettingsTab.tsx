import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
  Paper,
  Alert,
  Divider,
  LinearProgress,
} from '@mui/material';
import {
  ExpandMore,
  AutoStories as StoryIcon,
  VideoLibrary as ShotIcon,
  People as CharacterIcon,
  Palette as VisualIcon,
  RecordVoiceOver as NarrationIcon,
  MusicNote as MusicIcon,
  Memory as RenderIcon,
  CheckCircle,
  Error,
  Schedule,
  Computer,
  SmartToy,
  Cloud,
} from '@mui/icons-material';
import { QueueItem, useStore } from '../../store/useStore';
import { EnhancedStory } from '../../types/storyTypes';

interface GenerationSettingsTabProps {
  queueItem: QueueItem | null;
  storyData: EnhancedStory | null;
}

interface PipelineStepExecution {
  id: string;
  name: string;
  description: string;
  icon: React.ReactElement;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  nodeId?: string;
  nodeName?: string;
  nodeType?: 'ollama' | 'openai' | 'claude' | 'comfyui' | 'ffmpeg';
  model?: string;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  tokensUsed?: number;
  input?: string;
  output?: string;
  parameters?: Record<string, any>;
  error?: string;
}

const GenerationSettingsTab: React.FC<GenerationSettingsTabProps> = ({ queueItem, storyData }) => {
  const { pipelineAssignments } = useStore();
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  // Helper to get model from pipeline assignments
  const getModelForStep = (stepId: string): string => {
    const assignment = pipelineAssignments?.find(a => a.stepId === stepId && a.enabled);
    return assignment?.modelId || 'Not configured';
  };

  // Mock pipeline execution data based on actual story data and queue item
  const pipelineSteps: PipelineStepExecution[] = [
    {
      id: 'story_generation',
      name: 'Story Generation',
      description: 'Generate the main story content from the initial prompt',
      icon: <StoryIcon />,
      status: storyData?.content ? 'completed' : queueItem?.status === 'processing' ? 'running' : 'pending',
      nodeId: 'node_1',
      nodeName: 'Local Ollama',
      nodeType: 'ollama',
      model: getModelForStep('story'),
      startTime: queueItem?.startedAt,
      endTime: storyData?.content && queueItem?.startedAt ? new Date(queueItem.startedAt.getTime() + 45000) : undefined,
      duration: storyData?.content ? 45 : undefined,
      tokensUsed: storyData?.content ? Math.floor(storyData.content.length / 4) : undefined,
      input: queueItem?.config.prompt,
      output: storyData?.content ? `Generated story with ${storyData.content.split(' ').length} words` : undefined,
      parameters: {
        temperature: 0.7,
        max_tokens: 2000,
        genre: queueItem?.config.genre,
        length: queueItem?.config.length,
      },
    },
    {
      id: 'character_analysis',
      name: 'Character Analysis',
      description: 'Extract and analyze characters from the story',
      icon: <CharacterIcon />,
      status: storyData?.characters?.length ? 'completed' : storyData?.content ? 'running' : 'pending',
      nodeId: 'node_1',
      nodeName: 'Local Ollama',
      nodeType: 'ollama',
      model: getModelForStep('characters'),
      startTime: storyData?.content && queueItem?.startedAt ? new Date(queueItem.startedAt.getTime() + 45000) : undefined,
      endTime: storyData?.characters?.length && queueItem?.startedAt ? new Date(queueItem.startedAt.getTime() + 60000) : undefined,
      duration: storyData?.characters?.length ? 15 : undefined,
      tokensUsed: storyData?.characters?.length ? storyData.characters.length * 50 : undefined,
      input: storyData?.content ? `Story text (${storyData.content.split(' ').length} words)` : undefined,
      output: storyData?.characters?.length ? `Extracted ${storyData.characters.length} characters` : undefined,
      parameters: {
        consistency: queueItem?.config.characterConsistency,
        visual_description: true,
        importance_threshold: 3,
      },
    },
    {
      id: 'shot_breakdown',
      name: 'Shot Breakdown',
      description: 'Break the story into individual filmable shots',
      icon: <ShotIcon />,
      status: storyData?.shots?.length ? 'completed' : storyData?.characters ? 'running' : 'pending',
      nodeId: 'node_1',
      nodeName: 'Local Ollama',
      nodeType: 'ollama',
      model: getModelForStep('shots'),
      startTime: storyData?.characters?.length && queueItem?.startedAt ? new Date(queueItem.startedAt.getTime() + 60000) : undefined,
      endTime: storyData?.shots?.length && queueItem?.startedAt ? new Date(queueItem.startedAt.getTime() + 85000) : undefined,
      duration: storyData?.shots?.length ? 25 : undefined,
      tokensUsed: storyData?.shots?.length ? storyData.shots.length * 75 : undefined,
      input: storyData?.content ? `Story + ${storyData.characters?.length || 0} characters` : undefined,
      output: storyData?.shots?.length ? `Created ${storyData.shots.length} shots` : undefined,
      parameters: {
        shot_count: 'auto',
        average_duration: 5,
        detail_level: 'high',
        aspect_ratio: queueItem?.config.aspectRatio,
      },
    },
    {
      id: 'visual_prompts',
      name: 'Visual Prompt Generation',
      description: 'Generate AI video prompts for each shot',
      icon: <VisualIcon />,
      status: storyData?.shots?.some(s => s.visualPrompt) ? 'completed' : storyData?.shots?.length ? 'running' : 'pending',
      nodeId: 'node_2',
      nodeName: 'OpenAI GPT-4',
      nodeType: 'openai',
      model: getModelForStep('prompts'),
      startTime: storyData?.shots?.length && queueItem?.startedAt ? new Date(queueItem.startedAt.getTime() + 85000) : undefined,
      endTime: storyData?.shots?.some(s => s.visualPrompt) && queueItem?.startedAt ? new Date(queueItem.startedAt.getTime() + 110000) : undefined,
      duration: storyData?.shots?.some(s => s.visualPrompt) ? 25 : undefined,
      tokensUsed: storyData?.shots?.length ? storyData.shots.length * 100 : undefined,
      input: storyData?.shots?.length ? `${storyData.shots.length} shot descriptions` : undefined,
      output: storyData?.shots?.some(s => s.visualPrompt) ? `Generated visual prompts for ${storyData.shots.filter(s => s.visualPrompt).length} shots` : undefined,
      parameters: {
        style: queueItem?.config.visualStyle || 'cinematic',
        consistency: queueItem?.config.characterConsistency,
        detail_level: 'high',
      },
    },
    {
      id: 'narration',
      name: 'Narration Generation',
      description: 'Create narration scripts and voice-over content',
      icon: <NarrationIcon />,
      status: queueItem?.config.narrationGeneration 
        ? storyData?.shots?.some(s => s.narration) ? 'completed' : 'pending' 
        : 'skipped',
      nodeId: 'node_1',
      nodeName: 'Local Ollama',
      nodeType: 'ollama',
      model: getModelForStep('narration'),
      parameters: {
        voice_style: 'natural',
        pacing: 'moderate',
        enabled: queueItem?.config.narrationGeneration,
      },
    },
    {
      id: 'music_cues',
      name: 'Music Cue Generation',
      description: 'Generate music specifications and cues',
      icon: <MusicIcon />,
      status: queueItem?.config.musicGeneration 
        ? storyData?.shots?.some(s => s.musicCue) ? 'completed' : 'pending' 
        : 'skipped',
      nodeId: 'node_1', 
      nodeName: 'Local Ollama',
      nodeType: 'ollama',
      model: getModelForStep('music'),
      parameters: {
        mood: 'auto',
        genre: 'cinematic',
        enabled: queueItem?.config.musicGeneration,
      },
    },
    {
      id: 'rendering',
      name: 'Video Rendering',
      description: 'Render video for each shot using AI video generation',
      icon: <RenderIcon />,
      status: storyData?.shots?.some(s => s.renderStatus === 'completed') ? 'completed' : 
              storyData?.shots?.some(s => s.renderStatus === 'rendering') ? 'running' : 'pending',
      nodeId: 'comfyui_1',
      nodeName: 'ComfyUI Instance',
      nodeType: 'comfyui',
      model: 'stable-video-diffusion-xl',
      parameters: {
        resolution: queueItem?.config.aspectRatio,
        fps: queueItem?.config.fps,
        quality: 'high',
      },
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'running': return 'primary';
      case 'failed': return 'error';
      case 'skipped': return 'default';
      default: return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle color="success" fontSize="small" />;
      case 'running': return <Schedule color="primary" fontSize="small" />;
      case 'failed': return <Error color="error" fontSize="small" />;
      default: return <Schedule color="disabled" fontSize="small" />;
    }
  };

  const getNodeIcon = (nodeType?: string) => {
    switch (nodeType) {
      case 'ollama': return <Computer fontSize="small" />;
      case 'openai': return <SmartToy fontSize="small" />;
      case 'claude': return <Cloud fontSize="small" />;
      case 'comfyui': return <RenderIcon fontSize="small" />;
      default: return <Computer fontSize="small" />;
    }
  };

  const completedSteps = pipelineSteps.filter(s => s.status === 'completed').length;
  const totalSteps = pipelineSteps.filter(s => s.status !== 'skipped').length;
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      {/* Generation Overview */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Pipeline Execution Status
          </Typography>
          
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'primary.50' }}>
                <Typography variant="h6" color="primary">
                  {completedSteps}/{totalSteps}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Steps Completed
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'success.50' }}>
                <Typography variant="h6" color="success.main">
                  {queueItem?.status === 'completed' ? 'Done' : queueItem?.status === 'processing' ? 'Running' : 'Queued'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Current Status
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'info.50' }}>
                <Typography variant="h6" color="info.main">
                  {Math.round(progress)}%
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Progress
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'warning.50' }}>
                <Typography variant="h6" color="warning.main">
                  {queueItem?.startedAt ? Math.round((Date.now() - queueItem.startedAt.getTime()) / 1000) : 0}s
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Elapsed Time
                </Typography>
              </Paper>
            </Grid>
          </Grid>

          <LinearProgress 
            variant="determinate" 
            value={progress}
            sx={{ height: 8, borderRadius: 4, mb: 2 }}
          />

          <Typography variant="body2" color="text.secondary">
            Pipeline executing with {pipelineAssignments?.filter(a => a.enabled && a.modelId).length || 0} configured steps
          </Typography>
        </CardContent>
      </Card>

      {/* Original Request */}
      {queueItem && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Original Request
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  <strong>Prompt:</strong> {queueItem.config.prompt}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <List dense>
                  <ListItem sx={{ px: 0 }}>
                    <ListItemText primary="Genre" secondary={queueItem.config.genre} />
                  </ListItem>
                  <ListItem sx={{ px: 0 }}>
                    <ListItemText primary="Length" secondary={queueItem.config.length} />
                  </ListItem>
                  <ListItem sx={{ px: 0 }}>
                    <ListItemText primary="Visual Style" secondary={queueItem.config.visualStyle} />
                  </ListItem>
                </List>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <List dense>
                  <ListItem sx={{ px: 0 }}>
                    <ListItemText primary="Aspect Ratio" secondary={queueItem.config.aspectRatio} />
                  </ListItem>
                  <ListItem sx={{ px: 0 }}>
                    <ListItemText primary="Frame Rate" secondary={`${queueItem.config.fps} FPS`} />
                  </ListItem>
                  <ListItem sx={{ px: 0 }}>
                    <ListItemText 
                      primary="Features" 
                      secondary={
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                          {queueItem.config.characterConsistency && (
                            <Chip size="small" label="Character Consistency" />
                          )}
                          {queueItem.config.musicGeneration && (
                            <Chip size="small" label="Music" />
                          )}
                          {queueItem.config.narrationGeneration && (
                            <Chip size="small" label="Narration" />
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                </List>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Pipeline Steps */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        Pipeline Execution Details
      </Typography>

      {pipelineSteps.map((step, index) => (
        <Card key={step.id} sx={{ mb: 2 }}>
          <Accordion 
            expanded={expandedStep === step.id}
            onChange={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
          >
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                  {step.icon}
                  <Typography variant="subtitle1" fontWeight="bold">
                    {index + 1}. {step.name}
                  </Typography>
                  <Chip 
                    size="small" 
                    icon={getStatusIcon(step.status)}
                    label={step.status}
                    color={getStatusColor(step.status)}
                  />
                  {step.duration && (
                    <Chip 
                      size="small" 
                      label={`${step.duration}s`} 
                      variant="outlined"
                    />
                  )}
                </Box>
                {step.nodeName && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {getNodeIcon(step.nodeType)}
                    <Typography variant="caption" color="text.secondary">
                      {step.nodeName}
                    </Typography>
                  </Box>
                )}
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {step.description}
              </Typography>

              <Grid container spacing={3}>
                {/* Execution Details */}
                <Grid size={{ xs: 12, md: 6 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Execution Details
                  </Typography>
                  <List dense>
                    {step.nodeName && (
                      <ListItem sx={{ px: 0 }}>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          {getNodeIcon(step.nodeType)}
                        </ListItemIcon>
                        <ListItemText 
                          primary="Processing Node" 
                          secondary={`${step.nodeName} (${step.nodeType})`} 
                        />
                      </ListItem>
                    )}
                    {step.model && (
                      <ListItem sx={{ px: 0 }}>
                        <ListItemText primary="Model" secondary={step.model} />
                      </ListItem>
                    )}
                    {step.duration && (
                      <ListItem sx={{ px: 0 }}>
                        <ListItemText primary="Duration" secondary={`${step.duration} seconds`} />
                      </ListItem>
                    )}
                    {step.tokensUsed && (
                      <ListItem sx={{ px: 0 }}>
                        <ListItemText primary="Tokens Used" secondary={step.tokensUsed.toLocaleString()} />
                      </ListItem>
                    )}
                  </List>
                </Grid>

                {/* Input/Output */}
                <Grid size={{ xs: 12, md: 6 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Input/Output
                  </Typography>
                  {step.input && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" fontWeight="bold">Input:</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ 
                        maxHeight: 100, 
                        overflow: 'auto',
                        p: 1,
                        bgcolor: 'grey.50',
                        borderRadius: 1,
                        fontSize: '0.875rem'
                      }}>
                        {step.input.length > 200 ? step.input.slice(0, 200) + '...' : step.input}
                      </Typography>
                    </Box>
                  )}
                  {step.output && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" fontWeight="bold">Output:</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ 
                        p: 1,
                        bgcolor: 'success.50',
                        borderRadius: 1,
                        fontSize: '0.875rem'
                      }}>
                        {step.output}
                      </Typography>
                    </Box>
                  )}
                </Grid>

                {/* Parameters */}
                {step.parameters && Object.keys(step.parameters).length > 0 && (
                  <Grid size={{ xs: 12 }}>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle2" gutterBottom>
                      Parameters Used
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {Object.entries(step.parameters).map(([key, value]) => (
                        <Chip 
                          key={key}
                          size="small" 
                          label={`${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`}
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  </Grid>
                )}

                {/* Error */}
                {step.error && (
                  <Grid size={{ xs: 12 }}>
                    <Alert severity="error">
                      <Typography variant="body2">
                        {step.error}
                      </Typography>
                    </Alert>
                  </Grid>
                )}
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Card>
      ))}

      {/* Summary */}
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Execution Summary
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Pipeline execution {queueItem?.status === 'completed' ? 'completed' : queueItem?.status === 'processing' ? 'in progress' : 'queued'}. 
            {completedSteps > 0 && ` ${completedSteps} of ${totalSteps} steps completed.`}
          </Typography>
          {queueItem?.status === 'processing' && (
            <Typography variant="body2" color="text.secondary">
              Next step: {pipelineSteps.find(s => s.status === 'running')?.name || pipelineSteps.find(s => s.status === 'pending')?.name || 'Unknown'}
            </Typography>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default GenerationSettingsTab;