/**
 * Manual Render Job Dialog
 *
 * Allows users to manually add custom shots to the render queue
 * with model selection, style options, and prompt configuration.
 *
 * Supports workflow-specific prompt structures:
 * - HoloCine: Global caption + per-cut prompts with frame numbers
 * - Wan 2.2 / Hunyuan 1.5: Positive + negative prompts
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
  Slider,
  Alert,
  Tooltip,
  IconButton,
  Divider,
  Paper,
  alpha,
} from '@mui/material';
import {
  ExpandMore,
  Add,
  ContentCopy,
  Info,
  Delete,
  AutoFixHigh,
} from '@mui/icons-material';
import { useStore } from '../store/useStore';
import { GENERATION_METHODS, GenerationMethodId } from '../types/generationMethods';

// Visual styles with their prompt modifiers
const VISUAL_STYLES = [
  { id: 'cinematic', name: 'Cinematic', prompt: 'cinematic lighting, film grain, dramatic shadows, movie quality, professional cinematography' },
  { id: 'anime', name: 'Anime', prompt: 'anime style, cel shading, vibrant colors, dynamic poses, Japanese animation aesthetic' },
  { id: 'realistic', name: 'Realistic', prompt: 'photorealistic, ultra detailed, natural lighting, high resolution, lifelike' },
  { id: 'cartoon', name: 'Cartoon', prompt: 'cartoon style, bold outlines, bright colors, exaggerated features, playful aesthetic' },
  { id: 'noir', name: 'Noir', prompt: 'film noir style, high contrast, black and white, dramatic shadows, moody atmosphere' },
  { id: 'retro', name: 'Retro', prompt: 'vintage aesthetic, nostalgic, warm tones, grain texture, retro photography style' },
  { id: 'futuristic', name: 'Futuristic', prompt: 'futuristic sci-fi, neon lights, holographic, sleek design, cyberpunk aesthetic' },
  { id: 'watercolor', name: 'Watercolor', prompt: 'watercolor painting style, soft edges, blended colors, artistic brush strokes' },
  { id: 'oil_painting', name: 'Oil Painting', prompt: 'oil painting style, rich textures, classical art, visible brush strokes, fine art quality' },
  { id: 'comic_book', name: 'Comic Book', prompt: 'comic book style, halftone dots, bold colors, action lines, superhero aesthetic' },
];

// Shot types with example prompts
const SHOT_TYPES = [
  {
    id: 'establishing',
    name: 'Establishing Shot',
    description: 'Wide shot showing the setting/location',
    template: 'Wide establishing shot of [LOCATION], [TIME OF DAY], [ATMOSPHERE]'
  },
  {
    id: 'medium',
    name: 'Medium Shot',
    description: 'Waist-up shot of character',
    template: 'Medium shot of [CHARACTER DESCRIPTION], [ACTION], [SETTING]'
  },
  {
    id: 'closeup',
    name: 'Close-Up',
    description: 'Face or detail shot',
    template: 'Close-up of [CHARACTER/OBJECT], [EXPRESSION/DETAIL], [LIGHTING]'
  },
  {
    id: 'action',
    name: 'Action Shot',
    description: 'Dynamic movement shot',
    template: '[CHARACTER] [DYNAMIC ACTION], motion blur, [ENVIRONMENT]'
  },
  {
    id: 'pov',
    name: 'POV Shot',
    description: 'First-person perspective',
    template: 'POV shot, [WHAT IS SEEN], [MOVEMENT], first person perspective'
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Write your own prompt',
    template: ''
  },
];

// HoloCine cut/shot interface
interface HoloCineCut {
  id: string;
  prompt: string;
  startFrame: number;
  endFrame: number;
}

interface ManualRenderJobDialogProps {
  open: boolean;
  onClose: () => void;
}

const ManualRenderJobDialog: React.FC<ManualRenderJobDialogProps> = ({
  open,
  onClose,
}) => {
  const { addRenderJob } = useStore();

  // Form state
  const [title, setTitle] = useState('Custom Shot');
  const [generationMethod, setGenerationMethod] = useState<GenerationMethodId>('wan22');
  const [visualStyle, setVisualStyle] = useState('cinematic');
  const [shotType, setShotType] = useState('medium');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('blurry, low quality, distorted, deformed, bad anatomy, watermark, text, logo');

  // HoloCine-specific state
  const [globalCaption, setGlobalCaption] = useState('');
  const [holoCineCuts, setHoloCineCuts] = useState<HoloCineCut[]>([
    { id: '1', prompt: '', startFrame: 0, endFrame: 20 },
    { id: '2', prompt: '', startFrame: 21, endFrame: 40 },
    { id: '3', prompt: '', startFrame: 41, endFrame: 60 },
    { id: '4', prompt: '', startFrame: 61, endFrame: 80 },
  ]);

  // Advanced settings
  const [numFrames, setNumFrames] = useState(81);
  const [fps, setFps] = useState(16);
  const [steps, setSteps] = useState(30);
  const [cfg, setCfg] = useState(7.0);
  const [resolution, setResolution] = useState('832x480');

  // Get available methods (not coming soon)
  const availableMethods = useMemo(() =>
    GENERATION_METHODS.filter(m => m.available && !m.comingSoon),
    []
  );

  // Get selected method
  const selectedMethod = useMemo(() =>
    GENERATION_METHODS.find(m => m.id === generationMethod),
    [generationMethod]
  );

  // Get selected style
  const selectedStyle = useMemo(() =>
    VISUAL_STYLES.find(s => s.id === visualStyle),
    [visualStyle]
  );

  // Get selected shot type
  const selectedShotType = useMemo(() =>
    SHOT_TYPES.find(s => s.id === shotType),
    [shotType]
  );

  // Check if current method is HoloCine
  const isHoloCine = generationMethod === 'holocine';

  // HoloCine cut management
  const addHoloCineCut = useCallback(() => {
    const lastCut = holoCineCuts[holoCineCuts.length - 1];
    const newStartFrame = lastCut ? lastCut.endFrame + 1 : 0;
    const newEndFrame = Math.min(newStartFrame + 20, numFrames - 1);

    setHoloCineCuts(prev => [
      ...prev,
      {
        id: String(Date.now()),
        prompt: '',
        startFrame: newStartFrame,
        endFrame: newEndFrame,
      }
    ]);
  }, [holoCineCuts, numFrames]);

  const removeHoloCineCut = useCallback((id: string) => {
    if (holoCineCuts.length > 1) {
      setHoloCineCuts(prev => prev.filter(c => c.id !== id));
    }
  }, [holoCineCuts.length]);

  const updateHoloCineCut = useCallback((id: string, updates: Partial<HoloCineCut>) => {
    setHoloCineCuts(prev =>
      prev.map(c => c.id === id ? { ...c, ...updates } : c)
    );
  }, []);

  // Auto-calculate frame distribution for HoloCine cuts
  const autoDistributeFrames = useCallback(() => {
    const numCuts = holoCineCuts.length;
    if (numCuts === 0) return;

    const framesPerCut = Math.floor(numFrames / numCuts);
    let currentFrame = 0;

    setHoloCineCuts(prev =>
      prev.map((cut, index) => {
        const isLast = index === numCuts - 1;
        const startFrame = currentFrame;
        const endFrame = isLast ? numFrames - 1 : currentFrame + framesPerCut - 1;
        currentFrame = endFrame + 1;

        return { ...cut, startFrame, endFrame };
      })
    );
  }, [holoCineCuts.length, numFrames]);

  // Build final prompt with style
  const finalPrompt = useMemo(() => {
    const stylePrompt = selectedStyle?.prompt || '';

    if (isHoloCine) {
      // Build HoloCine format: [global caption] [per shot caption] frame1-frame2: prompt1 | frame3-frame4: prompt2 ...
      const baseCaption = globalCaption.trim();
      if (!baseCaption && holoCineCuts.every(c => !c.prompt.trim())) return '';

      const styledGlobalCaption = stylePrompt
        ? `${baseCaption}, ${stylePrompt}`
        : baseCaption;

      const cutPrompts = holoCineCuts
        .filter(c => c.prompt.trim())
        .map(c => `${c.startFrame}-${c.endFrame}: ${c.prompt.trim()}`)
        .join(' | ');

      return `[global caption] ${styledGlobalCaption} [per shot caption] ${cutPrompts}`;
    } else {
      // Standard shot-based prompt
      const basePrompt = prompt.trim();
      if (!basePrompt) return '';

      // Combine prompt with style
      return stylePrompt ? `${basePrompt}, ${stylePrompt}` : basePrompt;
    }
  }, [prompt, selectedStyle, isHoloCine, globalCaption, holoCineCuts]);

  // Handle shot type change - update template
  const handleShotTypeChange = (type: string) => {
    setShotType(type);
    const shot = SHOT_TYPES.find(s => s.id === type);
    if (shot && shot.template && !prompt) {
      setPrompt(shot.template);
    }
  };

  // Handle generation method change - update defaults
  const handleMethodChange = (methodId: GenerationMethodId) => {
    setGenerationMethod(methodId);
    const method = GENERATION_METHODS.find(m => m.id === methodId);
    if (method) {
      // Update defaults based on method
      setFps(method.features.fps[0] || 16);
      if (method.model.defaultParams) {
        setSteps(method.model.defaultParams.steps || 30);
        setCfg(method.model.defaultParams.cfg || 7.0);
      }
      // Set resolution
      setResolution(method.features.resolutions[0] || '832x480');
      // Set frames based on method
      if (methodId === 'hunyuan15') {
        setNumFrames(129);
      } else {
        setNumFrames(81);
      }

      // Reset HoloCine cuts when switching to HoloCine
      if (methodId === 'holocine') {
        const defaultFrames = 81;
        setHoloCineCuts([
          { id: '1', prompt: '', startFrame: 0, endFrame: 20 },
          { id: '2', prompt: '', startFrame: 21, endFrame: 40 },
          { id: '3', prompt: '', startFrame: 41, endFrame: 60 },
          { id: '4', prompt: '', startFrame: 61, endFrame: defaultFrames - 1 },
        ]);
      }
    }
  };

  // Handle submit
  const handleSubmit = () => {
    if (!finalPrompt.trim()) {
      return;
    }

    // Create render job - type depends on workflow
    const job = {
      storyId: `custom_${Date.now()}`,
      type: isHoloCine ? 'holocine_scene' as const : 'shot' as const,
      targetId: `custom_${isHoloCine ? 'scene' : 'shot'}_${Date.now()}`,
      targetNumber: 1,
      title: title || (isHoloCine ? 'Custom Scene' : 'Custom Shot'),
      positivePrompt: finalPrompt,
      negativePrompt,
      settings: {
        workflow: generationMethod === 'holocine' ? 'holocine' as const :
                  generationMethod === 'hunyuan15' ? 'hunyuan15' as const : 'wan22' as const,
        numFrames,
        fps,
        resolution,
        steps,
        cfg,
      },
      status: 'queued' as const,
      progress: 0,
      maxAttempts: 3,
      priority: 5,
    };

    addRenderJob(job);
    handleClose();
  };

  // Reset form and close
  const handleClose = () => {
    setTitle('Custom Shot');
    setPrompt('');
    setGlobalCaption('');
    setShotType('medium');
    setHoloCineCuts([
      { id: '1', prompt: '', startFrame: 0, endFrame: 20 },
      { id: '2', prompt: '', startFrame: 21, endFrame: 40 },
      { id: '3', prompt: '', startFrame: 41, endFrame: 60 },
      { id: '4', prompt: '', startFrame: 61, endFrame: 80 },
    ]);
    onClose();
  };

  // Copy final prompt to clipboard
  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(finalPrompt);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Add />
        Add Custom Render Job
      </DialogTitle>

      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
          {/* Title */}
          <TextField
            label="Job Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
            size="small"
          />

          {/* Generation Method Selection */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Generation Model
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {availableMethods.map(method => (
                <Chip
                  key={method.id}
                  label={method.name}
                  icon={<span style={{ marginLeft: 8 }}>{method.icon}</span>}
                  onClick={() => handleMethodChange(method.id)}
                  color={generationMethod === method.id ? 'primary' : 'default'}
                  variant={generationMethod === method.id ? 'filled' : 'outlined'}
                  sx={{
                    borderColor: method.color,
                    ...(generationMethod === method.id && {
                      bgcolor: method.color,
                      color: 'white',
                    }),
                  }}
                />
              ))}
            </Box>
            {selectedMethod && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {selectedMethod.description}
              </Typography>
            )}
          </Box>

          {/* Visual Style Selection */}
          <FormControl fullWidth size="small">
            <InputLabel>Visual Style</InputLabel>
            <Select
              value={visualStyle}
              onChange={(e) => setVisualStyle(e.target.value)}
              label="Visual Style"
            >
              {VISUAL_STYLES.map(style => (
                <MenuItem key={style.id} value={style.id}>
                  <Box>
                    <Typography variant="body2">{style.name}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {style.prompt.slice(0, 60)}...
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Shot Type Selection - Only for shot-based workflows */}
          {!isHoloCine && (
            <FormControl fullWidth size="small">
              <InputLabel>Shot Type</InputLabel>
              <Select
                value={shotType}
                onChange={(e) => handleShotTypeChange(e.target.value)}
                label="Shot Type"
              >
                {SHOT_TYPES.map(type => (
                  <MenuItem key={type.id} value={type.id}>
                    <Box>
                      <Typography variant="body2">{type.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {type.description}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <Divider sx={{ my: 1 }} />

          {/* WORKFLOW-SPECIFIC PROMPT SECTION */}
          {isHoloCine ? (
            /* HoloCine: Global Caption + Per-Cut Prompts */
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="subtitle1" fontWeight="bold">
                  🎬 HoloCine Scene Builder
                </Typography>
                <Tooltip title="Copy final HoloCine prompt">
                  <IconButton size="small" onClick={handleCopyPrompt} disabled={!finalPrompt}>
                    <ContentCopy fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>

              {/* Global Caption */}
              <Paper sx={{ p: 2, mb: 2, bgcolor: theme => alpha(theme.palette.primary.main, 0.05) }}>
                <Typography variant="subtitle2" gutterBottom color="primary">
                  Global Caption (Overall Scene Description)
                </Typography>
                <TextField
                  value={globalCaption}
                  onChange={(e) => setGlobalCaption(e.target.value)}
                  fullWidth
                  multiline
                  rows={2}
                  placeholder="Describe the overall scene style, setting, and mood..."
                  helperText={`Style modifiers will be added: "${selectedStyle?.prompt.slice(0, 40)}..."`}
                  size="small"
                />
              </Paper>

              {/* Per-Cut Prompts */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="subtitle2">
                  Per-Cut Prompts ({holoCineCuts.length} cuts)
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Tooltip title="Auto-distribute frames evenly">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<AutoFixHigh />}
                      onClick={autoDistributeFrames}
                    >
                      Auto Frames
                    </Button>
                  </Tooltip>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<Add />}
                    onClick={addHoloCineCut}
                  >
                    Add Cut
                  </Button>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {holoCineCuts.map((cut, index) => (
                  <Paper
                    key={cut.id}
                    sx={{
                      p: 1.5,
                      bgcolor: theme => alpha(theme.palette.secondary.main, 0.05),
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                      <Box sx={{ minWidth: 60 }}>
                        <Typography variant="caption" color="text.secondary">
                          Cut {index + 1}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                          <TextField
                            type="number"
                            value={cut.startFrame}
                            onChange={(e) => updateHoloCineCut(cut.id, { startFrame: parseInt(e.target.value) || 0 })}
                            size="small"
                            inputProps={{ min: 0, max: numFrames - 1, style: { padding: '4px 8px', width: 40 } }}
                            label="Start"
                          />
                          <TextField
                            type="number"
                            value={cut.endFrame}
                            onChange={(e) => updateHoloCineCut(cut.id, { endFrame: parseInt(e.target.value) || 0 })}
                            size="small"
                            inputProps={{ min: 0, max: numFrames - 1, style: { padding: '4px 8px', width: 40 } }}
                            label="End"
                          />
                        </Box>
                      </Box>
                      <TextField
                        value={cut.prompt}
                        onChange={(e) => updateHoloCineCut(cut.id, { prompt: e.target.value })}
                        fullWidth
                        size="small"
                        placeholder={`What happens in frames ${cut.startFrame}-${cut.endFrame}...`}
                        multiline
                        rows={2}
                      />
                      <IconButton
                        size="small"
                        onClick={() => removeHoloCineCut(cut.id)}
                        disabled={holoCineCuts.length <= 1}
                        color="error"
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Box>
                  </Paper>
                ))}
              </Box>
            </Box>
          ) : (
            /* Shot-Based: Standard Positive/Negative Prompts */
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="subtitle2">
                  Scene Prompt
                </Typography>
                <Tooltip title="Copy final prompt with style">
                  <IconButton size="small" onClick={handleCopyPrompt} disabled={!finalPrompt}>
                    <ContentCopy fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              <TextField
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                fullWidth
                multiline
                rows={3}
                placeholder={selectedShotType?.template || 'Describe your shot...'}
                helperText={`Style modifiers will be added: "${selectedStyle?.prompt.slice(0, 50)}..."`}
              />
            </Box>
          )}

          {/* Final Prompt Preview */}
          {finalPrompt && (
            <Alert severity="info" icon={<Info />}>
              <Typography variant="caption" component="div">
                <strong>Final {isHoloCine ? 'HoloCine' : ''} Prompt:</strong><br />
                {finalPrompt.length > 300 ? `${finalPrompt.slice(0, 300)}...` : finalPrompt}
              </Typography>
            </Alert>
          )}

          {/* Negative Prompt */}
          <TextField
            label="Negative Prompt"
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            fullWidth
            multiline
            rows={2}
            size="small"
          />

          {/* Advanced Settings */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography variant="subtitle2">Advanced Settings</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid size={{ xs: 6 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Resolution</InputLabel>
                    <Select
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      label="Resolution"
                    >
                      {selectedMethod?.features.resolutions.map(res => (
                        <MenuItem key={res} value={res}>{res}</MenuItem>
                      ))}
                      {!selectedMethod?.features.resolutions.includes(resolution) && (
                        <MenuItem value={resolution}>{resolution}</MenuItem>
                      )}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid size={{ xs: 6 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>FPS</InputLabel>
                    <Select
                      value={fps}
                      onChange={(e) => setFps(Number(e.target.value))}
                      label="FPS"
                    >
                      {selectedMethod?.features.fps.map(f => (
                        <MenuItem key={f} value={f}>{f} fps</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption" gutterBottom>
                    Frames: {numFrames}
                  </Typography>
                  <Slider
                    value={numFrames}
                    onChange={(_, v) => setNumFrames(v as number)}
                    min={33}
                    max={241}
                    step={8}
                    size="small"
                  />
                </Grid>

                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption" gutterBottom>
                    Steps: {steps}
                  </Typography>
                  <Slider
                    value={steps}
                    onChange={(_, v) => setSteps(v as number)}
                    min={10}
                    max={50}
                    size="small"
                  />
                </Grid>

                <Grid size={{ xs: 12 }}>
                  <Typography variant="caption" gutterBottom>
                    CFG Scale: {cfg.toFixed(1)}
                  </Typography>
                  <Slider
                    value={cfg}
                    onChange={(_, v) => setCfg(v as number)}
                    min={1}
                    max={15}
                    step={0.5}
                    size="small"
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!finalPrompt.trim()}
          startIcon={<Add />}
        >
          Add to Queue
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ManualRenderJobDialog;
