/**
 * AITextField - Text input with AI generate and enhance capabilities
 *
 * Features:
 * - Regular text input with optional multiline support
 * - Generate button: Create new content from scratch based on placeholder/context
 * - Expand/Enhance button: Take brief input and expand it with AI
 * - Loading states and error handling
 */

import React, { useState, useRef } from 'react';
import {
  Box,
  TextField,
  TextFieldProps,
  IconButton,
  Tooltip,
  CircularProgress,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  alpha,
  InputAdornment,
  Popover,
  Typography,
  Button,
} from '@mui/material';
import {
  AutoAwesome as GenerateIcon,
  AutoFixHigh as EnhanceIcon,
  ExpandMore as ExpandIcon,
  Refresh as RegenerateIcon,
  ContentPaste as PasteIcon,
  Clear as ClearIcon,
  Lightbulb as IdeaIcon,
  MoreVert as MoreIcon,
} from '@mui/icons-material';
import { manualModeAiService, AIGenerationResult } from '../services/manualModeAiService';

export type AIFieldType = 'story' | 'title' | 'character' | 'location' | 'shot' | 'visualPrompt' | 'comfyui' | 'text';

export interface AITextFieldProps extends Omit<TextFieldProps, 'onChange' | 'onError'> {
  /** Current value */
  value: string;
  /** Called when value changes */
  onChange: (value: string) => void;
  /** Type of field for AI context */
  fieldType?: AIFieldType;
  /** Additional context for AI generation (e.g., story content for character generation) */
  aiContext?: Record<string, any>;
  /** Custom system prompt for generation */
  systemPrompt?: string;
  /** Placeholder text that also serves as generation hint */
  placeholder?: string;
  /** Show AI buttons */
  showAIButtons?: boolean;
  /** Show generate button */
  showGenerate?: boolean;
  /** Show enhance/expand button */
  showEnhance?: boolean;
  /** Label for generate button */
  generateLabel?: string;
  /** Label for enhance button */
  enhanceLabel?: string;
  /** Called when generation starts */
  onGenerating?: () => void;
  /** Called when generation completes */
  onGenerated?: (result: AIGenerationResult) => void;
  /** Called on AI generation error */
  onAIError?: (error: string) => void;
  /** Enable expand mode (quick input -> expand to full text) */
  expandMode?: boolean;
}

const AITextField: React.FC<AITextFieldProps> = ({
  value,
  onChange,
  fieldType = 'text',
  aiContext,
  systemPrompt,
  placeholder,
  showAIButtons = true,
  showGenerate = true,
  showEnhance = true,
  generateLabel = 'Generate with AI',
  enhanceLabel = 'Enhance with AI',
  onGenerating,
  onGenerated,
  onAIError,
  expandMode = false,
  multiline,
  rows,
  ...textFieldProps
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [expandPopover, setExpandPopover] = useState<HTMLElement | null>(null);
  const [expandPrompt, setExpandPrompt] = useState('');
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Generate new content from scratch
  const handleGenerate = async () => {
    setIsGenerating(true);
    setMenuAnchor(null);
    onGenerating?.();

    try {
      let result: AIGenerationResult;

      // Use context-aware generation based on field type
      switch (fieldType) {
        case 'story':
          result = await manualModeAiService.generateStory(
            placeholder || 'Write a compelling short story',
            aiContext?.genre
          );
          break;
        case 'title':
          result = await manualModeAiService.generateTitle(
            aiContext?.storyContent || 'A story'
          );
          break;
        case 'character':
          result = await manualModeAiService.generateCharacter(
            placeholder || 'Create an interesting character',
            aiContext?.storyContent
          );
          break;
        case 'location':
          result = await manualModeAiService.generateLocation(
            placeholder || 'Create a vivid location',
            aiContext?.storyContent
          );
          break;
        case 'shot':
          result = await manualModeAiService.generateShot(
            placeholder || 'Describe a dramatic scene',
            aiContext
          );
          break;
        case 'visualPrompt':
          result = await manualModeAiService.generateVisualPrompt(
            aiContext?.shotDescription || placeholder || 'A cinematic scene',
            aiContext?.style
          );
          break;
        case 'comfyui':
          result = await manualModeAiService.generateComfyUIPrompt(
            aiContext?.shotDescription || placeholder || 'A dynamic scene',
            aiContext?.characters,
            aiContext?.style
          );
          break;
        default:
          result = await manualModeAiService.generateText({
            prompt: placeholder || 'Generate creative content',
            step: 'story',
          });
      }

      if (result.success) {
        onChange(result.text);
        onGenerated?.(result);
      } else {
        onAIError?.(result.error || 'Generation failed');
      }
    } catch (error: any) {
      onAIError?.(error.message || 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  // Enhance/expand existing content
  const handleEnhance = async () => {
    if (!value.trim()) {
      onAIError?.('No content to enhance. Write something first or use Generate.');
      return;
    }

    setIsEnhancing(true);
    setMenuAnchor(null);
    onGenerating?.();

    try {
      let result: AIGenerationResult;

      switch (fieldType) {
        case 'story':
          result = await manualModeAiService.enhanceStory(value);
          break;
        case 'character':
          result = await manualModeAiService.enhanceCharacter(value);
          break;
        default:
          result = await manualModeAiService.enhanceText({
            existingText: value,
            instruction: 'Enhance and expand this text with more detail and vivid descriptions.',
          });
      }

      if (result.success) {
        onChange(result.text);
        onGenerated?.(result);
      } else {
        onAIError?.(result.error || 'Enhancement failed');
      }
    } catch (error: any) {
      onAIError?.(error.message || 'Enhancement failed');
    } finally {
      setIsEnhancing(false);
    }
  };

  // Expand brief prompt to full content
  const handleExpand = async () => {
    if (!expandPrompt.trim()) {
      return;
    }

    setIsGenerating(true);
    setExpandPopover(null);
    onGenerating?.();

    try {
      const result = await manualModeAiService.expandPrompt(expandPrompt, fieldType);

      if (result.success) {
        onChange(result.text);
        setExpandPrompt('');
        onGenerated?.(result);
      } else {
        onAIError?.(result.error || 'Expansion failed');
      }
    } catch (error: any) {
      onAIError?.(error.message || 'Expansion failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  const handleExpandPopoverOpen = (event: React.MouseEvent<HTMLElement>) => {
    setExpandPopover(event.currentTarget);
  };

  const handleExpandPopoverClose = () => {
    setExpandPopover(null);
    setExpandPrompt('');
  };

  const isLoading = isGenerating || isEnhancing;

  // Render inline AI buttons for single-line inputs
  const renderInlineButtons = () => {
    if (!showAIButtons) return null;

    return (
      <InputAdornment position="end">
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {showGenerate && (
            <Tooltip title={generateLabel}>
              <span>
                <IconButton
                  size="small"
                  onClick={handleGenerate}
                  disabled={isLoading}
                  sx={{
                    color: 'primary.main',
                    '&:hover': { backgroundColor: alpha('#2196f3', 0.1) },
                  }}
                >
                  {isGenerating ? (
                    <CircularProgress size={18} />
                  ) : (
                    <GenerateIcon fontSize="small" />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          )}

          {showEnhance && value.trim() && (
            <Tooltip title={enhanceLabel}>
              <span>
                <IconButton
                  size="small"
                  onClick={handleEnhance}
                  disabled={isLoading}
                  sx={{
                    color: 'secondary.main',
                    '&:hover': { backgroundColor: alpha('#9c27b0', 0.1) },
                  }}
                >
                  {isEnhancing ? (
                    <CircularProgress size={18} />
                  ) : (
                    <EnhanceIcon fontSize="small" />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          )}

          {expandMode && (
            <Tooltip title="Write brief idea, expand with AI">
              <IconButton
                size="small"
                onClick={handleExpandPopoverOpen}
                disabled={isLoading}
                sx={{
                  color: 'info.main',
                  '&:hover': { backgroundColor: alpha('#0288d1', 0.1) },
                }}
              >
                <IdeaIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </InputAdornment>
    );
  };

  // Render button bar for multiline inputs
  const renderMultilineButtons = () => {
    if (!showAIButtons) return null;

    return (
      <Box
        sx={{
          display: 'flex',
          gap: 0.5,
          position: 'absolute',
          top: 4,
          right: 4,
          zIndex: 1,
          backgroundColor: theme => alpha(theme.palette.background.paper, 0.9),
          borderRadius: 1,
          padding: 0.5,
        }}
      >
        {showGenerate && (
          <Tooltip title={generateLabel}>
            <span>
              <IconButton
                size="small"
                onClick={handleGenerate}
                disabled={isLoading}
                sx={{
                  color: 'primary.main',
                  backgroundColor: alpha('#2196f3', 0.1),
                  '&:hover': { backgroundColor: alpha('#2196f3', 0.2) },
                }}
              >
                {isGenerating ? (
                  <CircularProgress size={16} />
                ) : (
                  <GenerateIcon fontSize="small" />
                )}
              </IconButton>
            </span>
          </Tooltip>
        )}

        {showEnhance && (
          <Tooltip title={value.trim() ? enhanceLabel : 'Write something first'}>
            <span>
              <IconButton
                size="small"
                onClick={handleEnhance}
                disabled={isLoading || !value.trim()}
                sx={{
                  color: 'secondary.main',
                  backgroundColor: value.trim() ? alpha('#9c27b0', 0.1) : 'transparent',
                  '&:hover': { backgroundColor: alpha('#9c27b0', 0.2) },
                }}
              >
                {isEnhancing ? (
                  <CircularProgress size={16} />
                ) : (
                  <EnhanceIcon fontSize="small" />
                )}
              </IconButton>
            </span>
          </Tooltip>
        )}

        {expandMode && (
          <Tooltip title="Write brief idea, expand with AI">
            <IconButton
              size="small"
              onClick={handleExpandPopoverOpen}
              disabled={isLoading}
              sx={{
                color: 'info.main',
                backgroundColor: alpha('#0288d1', 0.1),
                '&:hover': { backgroundColor: alpha('#0288d1', 0.2) },
              }}
            >
              <IdeaIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        <Tooltip title="More options">
          <IconButton
            size="small"
            onClick={handleMenuOpen}
            disabled={isLoading}
          >
            <MoreIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    );
  };

  return (
    <Box sx={{ position: 'relative' }}>
      {multiline && renderMultilineButtons()}

      <TextField
        {...textFieldProps}
        inputRef={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        multiline={multiline}
        rows={rows}
        disabled={isLoading || textFieldProps.disabled}
        slotProps={{
          input: multiline
            ? { ...textFieldProps.slotProps?.input }
            : {
                ...textFieldProps.slotProps?.input,
                endAdornment: renderInlineButtons(),
              },
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            transition: 'border-color 0.3s, box-shadow 0.3s',
            ...(isLoading && {
              borderColor: 'primary.main',
              boxShadow: theme => `0 0 4px ${alpha(theme.palette.primary.main, 0.4)}`,
            }),
          },
          ...textFieldProps.sx,
        }}
      />

      {/* Options Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleGenerate} disabled={isLoading}>
          <ListItemIcon>
            <GenerateIcon fontSize="small" color="primary" />
          </ListItemIcon>
          <ListItemText primary={generateLabel} secondary="Create new content from scratch" />
        </MenuItem>

        <MenuItem onClick={handleEnhance} disabled={isLoading || !value.trim()}>
          <ListItemIcon>
            <EnhanceIcon fontSize="small" color="secondary" />
          </ListItemIcon>
          <ListItemText primary={enhanceLabel} secondary="Expand and improve existing text" />
        </MenuItem>

        <Divider />

        <MenuItem onClick={handleExpandPopoverOpen} disabled={isLoading}>
          <ListItemIcon>
            <IdeaIcon fontSize="small" color="info" />
          </ListItemIcon>
          <ListItemText primary="Expand Idea" secondary="Write brief prompt, AI expands it" />
        </MenuItem>

        {value && (
          <>
            <Divider />
            <MenuItem onClick={() => { onChange(''); handleMenuClose(); }}>
              <ListItemIcon>
                <ClearIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Clear" />
            </MenuItem>
          </>
        )}
      </Menu>

      {/* Expand Idea Popover */}
      <Popover
        open={Boolean(expandPopover)}
        anchorEl={expandPopover}
        onClose={handleExpandPopoverClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
      >
        <Box sx={{ p: 2, width: 300 }}>
          <Typography variant="subtitle2" gutterBottom>
            Expand Brief Idea
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Write a brief concept or idea, and AI will expand it into full content.
          </Typography>
          <TextField
            fullWidth
            size="small"
            multiline
            rows={2}
            placeholder="e.g., A detective finds a clue in an old bookshop..."
            value={expandPrompt}
            onChange={(e) => setExpandPrompt(e.target.value)}
            sx={{ mb: 1 }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button size="small" onClick={handleExpandPopoverClose}>
              Cancel
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleExpand}
              disabled={!expandPrompt.trim() || isLoading}
              startIcon={isGenerating ? <CircularProgress size={14} /> : <ExpandIcon />}
            >
              Expand
            </Button>
          </Box>
        </Box>
      </Popover>
    </Box>
  );
};

export default AITextField;
