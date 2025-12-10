/**
 * Step Editor Component
 *
 * Allows users to view, edit, and regenerate individual pipeline steps.
 * Used in both custom stories and when editing regular stories.
 * Supports:
 * - Viewing current step content
 * - Manual editing of step content
 * - AI regeneration of individual steps
 * - Marking steps as complete/skipped
 */

import React, { useState, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  IconButton,
  Chip,
  Collapse,
  Alert,
  CircularProgress,
  Tooltip,
  Divider,
} from '@mui/material';
import {
  Edit,
  Save,
  Cancel,
  CheckCircle,
  SkipNext,
  ExpandMore,
  ExpandLess,
  AutoAwesome,
  Warning,
  HourglassEmpty,
  Refresh,
} from '@mui/icons-material';

/**
 * Step generation status for visual indicators:
 * - 'never': Grey - step has never been generated or has no content
 * - 'stale': Yellow/Orange - step has content but upstream dependencies changed (needs re-generation)
 * - 'current': Green - step has the latest generated content (up-to-date)
 * - 'error': Red - step failed to generate
 * - 'skipped': Grey muted - step was intentionally skipped
 */
export type StepGenerationStatus = 'never' | 'stale' | 'current' | 'error' | 'skipped';

export interface StepEditorProps {
  stepId: string;
  stepName: string;
  stepDescription: string;
  content: any; // The current content for this step
  status: 'pending' | 'completed' | 'skipped' | 'error';
  generationStatus?: StepGenerationStatus; // Visual status indicator for generation freshness
  isCustomStory?: boolean;
  onSave: (stepId: string, content: any) => void;
  onRegenerate?: (stepId: string) => Promise<void>;
  onSkip?: (stepId: string) => void;
  onMarkComplete?: (stepId: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
}

const StepEditor: React.FC<StepEditorProps> = ({
  stepId,
  stepName,
  stepDescription,
  content,
  status,
  generationStatus = 'never',
  isCustomStory = false,
  onSave,
  onRegenerate,
  onSkip,
  onMarkComplete,
  disabled = false,
  readOnly = false,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Convert content to editable string
  const contentToString = useCallback((c: any): string => {
    if (c === null || c === undefined) return '';
    if (typeof c === 'string') return c;
    return JSON.stringify(c, null, 2);
  }, []);

  // Parse edited string back to content
  const parseContent = useCallback((str: string): any => {
    try {
      return JSON.parse(str);
    } catch {
      return str; // Return as string if not valid JSON
    }
  }, []);

  // Start editing
  const handleStartEdit = () => {
    setEditedContent(contentToString(content));
    setEditing(true);
    setExpanded(true);
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditing(false);
    setEditedContent('');
    setError(null);
  };

  // Save edited content
  const handleSave = () => {
    try {
      const parsedContent = parseContent(editedContent);
      onSave(stepId, parsedContent);
      setEditing(false);
      setError(null);
    } catch (err: any) {
      setError(`Failed to save: ${err.message}`);
    }
  };

  // Regenerate step with AI
  const handleRegenerate = async () => {
    if (!onRegenerate) return;

    setRegenerating(true);
    setError(null);

    try {
      await onRegenerate(stepId);
    } catch (err: any) {
      setError(`Regeneration failed: ${err.message}`);
    } finally {
      setRegenerating(false);
    }
  };

  // Get generation status colors
  const getGenerationStatusColors = (): { border: string; bg: string; statusColor: string } => {
    // For custom/manual stories, use generationStatus for visual cues
    if (isCustomStory) {
      switch (generationStatus) {
        case 'current':
          return { border: 'success.main', bg: 'success.50', statusColor: 'success' };
        case 'stale':
          return { border: 'warning.main', bg: 'warning.50', statusColor: 'warning' };
        case 'error':
          return { border: 'error.main', bg: 'error.50', statusColor: 'error' };
        case 'skipped':
          return { border: 'grey.400', bg: 'grey.50', statusColor: 'default' };
        case 'never':
        default:
          return { border: 'grey.400', bg: 'transparent', statusColor: 'default' };
      }
    }
    // For non-custom stories, use the standard status
    switch (status) {
      case 'completed':
        return { border: 'success.light', bg: 'success.50', statusColor: 'success' };
      case 'skipped':
        return { border: 'grey.300', bg: 'grey.50', statusColor: 'default' };
      case 'error':
        return { border: 'error.light', bg: 'error.50', statusColor: 'error' };
      default:
        return { border: 'primary.light', bg: 'transparent', statusColor: 'primary' };
    }
  };

  const statusColors = getGenerationStatusColors();

  // Get status chip - shows generation freshness for custom stories
  const getStatusChip = () => {
    // For custom/manual stories, show generation status (never/stale/current)
    if (isCustomStory) {
      switch (generationStatus) {
        case 'current':
          return <Chip icon={<CheckCircle />} label="Up to date" color="success" size="small" />;
        case 'stale':
          return <Chip icon={<Refresh />} label="Needs update" color="warning" size="small" />;
        case 'error':
          return <Chip icon={<Warning />} label="Error" color="error" size="small" />;
        case 'skipped':
          return <Chip icon={<SkipNext />} label="Skipped" color="default" size="small" />;
        case 'never':
        default:
          return <Chip icon={<HourglassEmpty />} label="Not generated" color="default" size="small" variant="outlined" />;
      }
    }

    // For auto stories, use standard status
    switch (status) {
      case 'completed':
        return <Chip icon={<CheckCircle />} label="Completed" color="success" size="small" />;
      case 'skipped':
        return <Chip icon={<SkipNext />} label="Skipped" color="default" size="small" />;
      case 'error':
        return <Chip icon={<Warning />} label="Error" color="error" size="small" />;
      default:
        return <Chip label="Pending" color="warning" size="small" variant="outlined" />;
    }
  };

  // Check if content exists
  const hasContent = content !== null && content !== undefined && content !== '';

  return (
    <Paper
      sx={{
        mb: 2,
        border: '2px solid',
        borderColor: statusColors.border,
        opacity: status === 'skipped' || generationStatus === 'skipped' ? 0.6 : 1,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          cursor: 'pointer',
          bgcolor: statusColors.bg,
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
          {expanded ? <ExpandLess /> : <ExpandMore />}
        </IconButton>

        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" fontWeight="medium">
            {stepName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {stepDescription}
          </Typography>
        </Box>

        {getStatusChip()}

        {/* Quick action buttons */}
        <Box sx={{ display: 'flex', gap: 1 }} onClick={(e) => e.stopPropagation()}>
          {!readOnly && !editing && (
            <>
              <Tooltip title="Edit manually">
                <IconButton
                  size="small"
                  onClick={handleStartEdit}
                  disabled={disabled || status === 'skipped'}
                >
                  <Edit />
                </IconButton>
              </Tooltip>

              {onRegenerate && (
                <Tooltip title="Regenerate with AI">
                  <IconButton
                    size="small"
                    onClick={handleRegenerate}
                    disabled={disabled || regenerating || status === 'skipped'}
                    color="primary"
                  >
                    {regenerating ? <CircularProgress size={20} /> : <AutoAwesome />}
                  </IconButton>
                </Tooltip>
              )}

              {isCustomStory && status !== 'skipped' && onSkip && (
                <Tooltip title="Skip this step">
                  <IconButton
                    size="small"
                    onClick={() => onSkip(stepId)}
                    disabled={disabled}
                  >
                    <SkipNext />
                  </IconButton>
                </Tooltip>
              )}

              {isCustomStory && hasContent && status !== 'completed' && onMarkComplete && (
                <Tooltip title="Mark as complete">
                  <IconButton
                    size="small"
                    onClick={() => onMarkComplete(stepId)}
                    disabled={disabled}
                    color="success"
                  >
                    <CheckCircle />
                  </IconButton>
                </Tooltip>
              )}
            </>
          )}
        </Box>
      </Box>

      {/* Expanded Content */}
      <Collapse in={expanded}>
        <Divider />
        <Box sx={{ p: 2 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {editing ? (
            // Edit mode
            <Box>
              <TextField
                fullWidth
                multiline
                rows={12}
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                variant="outlined"
                placeholder={`Enter ${stepName.toLowerCase()} content...`}
                sx={{
                  mb: 2,
                  '& .MuiInputBase-input': {
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                  },
                }}
              />
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                <Button
                  startIcon={<Cancel />}
                  onClick={handleCancelEdit}
                  variant="outlined"
                >
                  Cancel
                </Button>
                <Button
                  startIcon={<Save />}
                  onClick={handleSave}
                  variant="contained"
                  color="primary"
                >
                  Save
                </Button>
              </Box>
            </Box>
          ) : (
            // View mode
            <Box>
              {hasContent ? (
                <Box
                  sx={{
                    p: 2,
                    bgcolor: 'grey.50',
                    borderRadius: 1,
                    maxHeight: 400,
                    overflow: 'auto',
                  }}
                >
                  <Typography
                    variant="body2"
                    component="pre"
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      m: 0,
                    }}
                  >
                    {contentToString(content)}
                  </Typography>
                </Box>
              ) : (
                <Alert severity="info">
                  No content yet. {isCustomStory ? 'Enter content manually or generate with AI.' : 'Content will be generated when processing reaches this step.'}
                </Alert>
              )}
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
};

export default StepEditor;
