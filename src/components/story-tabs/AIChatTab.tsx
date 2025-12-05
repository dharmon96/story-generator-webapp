import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  Chip,
  Button,
  Paper,
  IconButton,
  Collapse,
  TextField,
  Avatar,
  Fab,
} from '@mui/material';
import {
  Psychology as AIIcon,
  ExpandMore,
  Clear as ClearIcon,
  FilterList as FilterIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  CheckCircle as SuccessIcon,
  AccessTime as TimeIcon,
  Memory as TokenIcon,
  Send as SendIcon,
  KeyboardArrowDown as ScrollDownIcon,
} from '@mui/icons-material';
import { AILogEntry } from '../../types/storyTypes';

interface AIChatTabProps {
  aiLogs: AILogEntry[];
  storyId: string;
  onClearLogs: () => void;
}

const AIChatTab: React.FC<AIChatTabProps> = ({ aiLogs, storyId, onClearLogs }) => {
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [filterLevel, setFilterLevel] = useState<AILogEntry['level'] | 'all'>('all');
  const [newMessage, setNewMessage] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  // Handle scroll events to detect user interaction
  const handleScroll = useCallback(() => {
    if (!listRef.current || isScrollingRef.current) return;
    
    const element = listRef.current;
    const { scrollTop, scrollHeight, clientHeight } = element;
    const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 10; // 10px tolerance
    
    if (!isAtBottom && !isUserScrolling) {
      // User scrolled up, pause auto-scroll
      setIsUserScrolling(true);
      setShowScrollToBottom(true);
    } else if (isAtBottom && isUserScrolling) {
      // User scrolled back to bottom
      setIsUserScrolling(false);
      setShowScrollToBottom(false);
    }
  }, [isUserScrolling]);

  // Set up scroll event listener
  useEffect(() => {
    const element = listRef.current;
    if (!element) return;

    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => element.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Auto-scroll to bottom when new logs arrive (only if user hasn't manually scrolled)
  useEffect(() => {
    if (!isUserScrolling && autoScroll && listRef.current) {
      isScrollingRef.current = true;
      listRef.current.scrollTop = listRef.current.scrollHeight;
      setTimeout(() => {
        isScrollingRef.current = false;
      }, 100);
    }
  }, [aiLogs, isUserScrolling, autoScroll]);

  // Force scroll to bottom function
  const scrollToBottom = useCallback(() => {
    if (listRef.current) {
      isScrollingRef.current = true;
      listRef.current.scrollTop = listRef.current.scrollHeight;
      setIsUserScrolling(false);
      setShowScrollToBottom(false);
      setTimeout(() => {
        isScrollingRef.current = false;
      }, 100);
    }
  }, []);

  const filteredLogs = aiLogs.filter(log => 
    filterLevel === 'all' || log.level === filterLevel
  );

  const getLevelIcon = (level: AILogEntry['level']) => {
    switch (level) {
      case 'success':
        return <SuccessIcon color="success" fontSize="small" />;
      case 'warning':
        return <WarningIcon color="warning" fontSize="small" />;
      case 'error':
        return <ErrorIcon color="error" fontSize="small" />;
      default:
        return <InfoIcon color="info" fontSize="small" />;
    }
  };

  const getLevelColor = (level: AILogEntry['level']) => {
    switch (level) {
      case 'success': return 'success';
      case 'warning': return 'warning';
      case 'error': return 'error';
      default: return 'info';
    }
  };

  const formatTimestamp = (timestamp: Date | string) => {
    // FIX BUG #4: Handle both Date objects and string timestamps
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);

    // Validate date is valid
    if (isNaN(date.getTime())) {
      return '--:--:--';
    }

    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;
    
    // TODO: Implement AI chat functionality
    console.log('Send message to AI:', newMessage);
    setNewMessage('');
  };

  const getStepDescription = (step: string) => {
    const stepDescriptions: Record<string, { name: string; icon: React.ReactNode; color: string }> = {
      'story': { name: 'Story Generation', icon: '📝', color: '#4CAF50' },
      'story_generation': { name: 'Creating main story content', icon: '📝', color: '#4CAF50' },
      'shots': { name: 'Shot Breakdown', icon: '🎬', color: '#2196F3' },
      'shot_breakdown': { name: 'Breaking story into filmable shots', icon: '🎬', color: '#2196F3' },
      'characters': { name: 'Character Analysis', icon: '👥', color: '#FF9800' },
      'character_analysis': { name: 'Analyzing and extracting characters', icon: '👥', color: '#FF9800' },
      'location_analysis': { name: 'Identifying and describing locations', icon: '📍', color: '#9C27B0' },
      'prompts': { name: 'Visual Prompts', icon: '🎨', color: '#E91E63' },
      'visual_prompt_generation': { name: 'Generating AI visual prompts', icon: '🎨', color: '#E91E63' },
      'narration': { name: 'Narration', icon: '🎙️', color: '#00BCD4' },
      'narration_processing': { name: 'Creating narration scripts', icon: '🎙️', color: '#00BCD4' },
      'music': { name: 'Music Cues', icon: '🎵', color: '#673AB7' },
      'music_cue_generation': { name: 'Generating music specifications', icon: '🎵', color: '#673AB7' },
      'character_rendering': { name: 'Rendering character visuals', icon: '🖼️', color: '#795548' },
      'location_rendering': { name: 'Rendering location visuals', icon: '🏞️', color: '#607D8B' },
      'shot_rendering': { name: 'Rendering individual shots', icon: '🎞️', color: '#FF5722' },
      'final_compilation': { name: 'Compiling final video', icon: '🎥', color: '#3F51B5' },
    };
    return stepDescriptions[step] || { name: step.replace('_', ' '), icon: '⚙️', color: '#9E9E9E' };
  };

  if (aiLogs.length === 0) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <AIIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No AI Logs Yet
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center">
          AI processing logs and messages will appear here as the story generation progresses.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header Controls */}
      <Card sx={{ mb: 2, flexShrink: 0 }}>
        <CardContent sx={{ pb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box>
              <Typography variant="h6">AI Processing Log</Typography>
              <Typography variant="caption" color="text.secondary">
                {filteredLogs.length} {filterLevel !== 'all' ? filterLevel : ''} entries
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button 
                size="small" 
                startIcon={<FilterIcon />}
                onClick={() => setFilterLevel(filterLevel === 'all' ? 'info' : 'all')}
              >
                Filter: {filterLevel}
              </Button>
              <Button 
                size="small" 
                variant={autoScroll ? "contained" : "outlined"}
                onClick={() => setAutoScroll(!autoScroll)}
                color={autoScroll ? "primary" : "inherit"}
              >
                Auto-scroll
              </Button>
              <Button 
                size="small" 
                startIcon={<ClearIcon />} 
                onClick={onClearLogs}
                color="error"
                variant="outlined"
              >
                Clear
              </Button>
            </Box>
          </Box>

          {/* Stats */}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Chip 
              size="small" 
              icon={<InfoIcon />} 
              label={`${aiLogs.filter(l => l.level === 'info').length} Info`}
              variant="outlined"
            />
            <Chip 
              size="small" 
              icon={<SuccessIcon />} 
              label={`${aiLogs.filter(l => l.level === 'success').length} Success`}
              color="success"
              variant="outlined"
            />
            <Chip 
              size="small" 
              icon={<WarningIcon />} 
              label={`${aiLogs.filter(l => l.level === 'warning').length} Warnings`}
              color="warning"
              variant="outlined"
            />
            <Chip 
              size="small" 
              icon={<ErrorIcon />} 
              label={`${aiLogs.filter(l => l.level === 'error').length} Errors`}
              color="error"
              variant="outlined"
            />
          </Box>
        </CardContent>
      </Card>

      {/* Log Messages */}
      <Box 
        ref={listRef}
        sx={{ 
          flex: 1, 
          overflow: 'auto', 
          mb: 2,
          pr: 1,
        }}
      >
        <List sx={{ p: 0 }}>
          {filteredLogs.map((log, index) => (
            <ListItem 
              key={log.id} 
              sx={{ 
                px: 0, 
                pb: 1,
                alignItems: 'flex-start',
                '&:not(:last-child)': {
                  borderBottom: '1px solid',
                  borderBottomColor: 'divider',
                  mb: 2,
                }
              }}
            >
              <Card sx={{ width: '100%' }}>
                <CardContent sx={{ pb: 2 }}>
                  {/* Message Header */}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar sx={{ 
                        width: 28, 
                        height: 28, 
                        bgcolor: getStepDescription(log.step).color || 'primary.main',
                        fontSize: '14px'
                      }}>
                        {getStepDescription(log.step).icon}
                      </Avatar>
                      <Box>
                        <Typography variant="subtitle2" fontWeight="bold">
                          {getStepDescription(log.step).name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Step: {log.step}
                        </Typography>
                      </Box>
                      <Chip 
                        size="small" 
                        icon={getLevelIcon(log.level)}
                        label={log.level}
                        color={getLevelColor(log.level)}
                      />
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {formatTimestamp(log.timestamp)}
                    </Typography>
                  </Box>

                  {/* Message Content */}
                  <Typography variant="body2" sx={{ mb: 1, lineHeight: 1.5 }}>
                    {log.message}
                  </Typography>

                  {/* Metadata */}
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 1 }}>
                    {log.model && (
                      <Chip 
                        size="small" 
                        label={`Model: ${log.model}`} 
                        variant="outlined"
                      />
                    )}
                    {log.processingTime && (
                      <Chip 
                        size="small" 
                        icon={<TimeIcon />}
                        label={`${log.processingTime}ms`} 
                        variant="outlined"
                      />
                    )}
                    {log.tokensUsed && (
                      <Chip 
                        size="small" 
                        icon={<TokenIcon />}
                        label={`${log.tokensUsed} tokens`} 
                        variant="outlined"
                      />
                    )}
                  </Box>

                  {/* Expandable Details */}
                  {log.details && (
                    <Box>
                      <Button
                        size="small"
                        startIcon={<ExpandMore 
                          sx={{ 
                            transform: expandedLog === log.id ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s'
                          }}
                        />}
                        onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                      >
                        {expandedLog === log.id ? 'Hide' : 'Show'} Details
                      </Button>
                      <Collapse in={expandedLog === log.id}>
                        <Paper sx={{
                          p: 2,
                          mt: 1,
                          backgroundColor: theme => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
                          border: '1px solid',
                          borderColor: theme => theme.palette.mode === 'dark' ? 'grey.700' : 'grey.300'
                        }}>
                          {/* Special handling for AI requests and responses */}
                          {log.details?.systemPrompt || log.details?.userPrompt ? (
                            <Box>
                              {log.details.systemPrompt && (
                                <Box sx={{ mb: 2 }}>
                                  <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                                    🤖 System Prompt:
                                  </Typography>
                                  <Paper sx={{
                                    p: 1.5,
                                    backgroundColor: theme => theme.palette.mode === 'dark' ? 'rgba(99, 102, 241, 0.15)' : 'primary.50',
                                    border: '1px solid',
                                    borderColor: theme => theme.palette.mode === 'dark' ? 'primary.700' : 'primary.200'
                                  }}>
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontFamily: 'monospace',
                                        whiteSpace: 'pre-wrap',
                                        fontSize: '0.8rem',
                                        color: theme => theme.palette.mode === 'dark' ? 'primary.light' : 'primary.dark'
                                      }}
                                    >
                                      {log.details.systemPrompt}
                                    </Typography>
                                  </Paper>
                                </Box>
                              )}
                              {log.details.userPrompt && (
                                <Box sx={{ mb: 2 }}>
                                  <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: 'info.main' }}>
                                    👤 User Prompt:
                                  </Typography>
                                  <Paper sx={{
                                    p: 1.5,
                                    backgroundColor: theme => theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'info.50',
                                    border: '1px solid',
                                    borderColor: theme => theme.palette.mode === 'dark' ? 'info.700' : 'info.200'
                                  }}>
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontFamily: 'monospace',
                                        whiteSpace: 'pre-wrap',
                                        fontSize: '0.8rem',
                                        color: theme => theme.palette.mode === 'dark' ? 'info.light' : 'info.dark'
                                      }}
                                    >
                                      {log.details.userPrompt}
                                    </Typography>
                                  </Paper>
                                </Box>
                              )}
                              {log.details.node && log.details.model && (
                                <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                                  <Chip size="small" label={`Node: ${log.details.node}`} variant="outlined" />
                                  <Chip size="small" label={`Model: ${log.details.model}`} variant="outlined" />
                                </Box>
                              )}
                            </Box>
                          ) : log.details?.response ? (
                            <Box>
                              <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: 'success.main' }}>
                                ✅ AI Response ({log.details.response.length} characters):
                              </Typography>
                              <Paper sx={{
                                p: 1.5,
                                backgroundColor: theme => theme.palette.mode === 'dark' ? 'rgba(16, 185, 129, 0.15)' : 'success.50',
                                border: '1px solid',
                                borderColor: theme => theme.palette.mode === 'dark' ? 'success.700' : 'success.200'
                              }}>
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontFamily: 'monospace',
                                    whiteSpace: 'pre-wrap',
                                    fontSize: '0.8rem',
                                    color: theme => theme.palette.mode === 'dark' ? 'success.light' : 'success.dark'
                                  }}
                                >
                                  {log.details.response}
                                </Typography>
                              </Paper>
                              {log.details.node && log.details.model && (
                                <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                                  <Chip size="small" label={`Node: ${log.details.node}`} variant="outlined" />
                                  <Chip size="small" label={`Model: ${log.details.model}`} variant="outlined" />
                                </Box>
                              )}
                            </Box>
                          ) : (
                            /* Default details display */
                            <Typography 
                              variant="body2" 
                              sx={{ 
                                fontFamily: 'monospace', 
                                whiteSpace: 'pre-wrap',
                                fontSize: '0.75rem'
                              }}
                            >
                              {typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)}
                            </Typography>
                          )}
                        </Paper>
                      </Collapse>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </ListItem>
          ))}
        </List>
      </Box>

      {/* Interactive Chat Input (Future Enhancement) */}
      <Card sx={{ flexShrink: 0, opacity: 0.5 }}>
        <CardContent sx={{ pb: 2 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Interactive AI Chat (Coming Soon)
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Ask the AI about the story generation..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              disabled
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
            <IconButton 
              color="primary" 
              disabled
              onClick={handleSendMessage}
            >
              <SendIcon />
            </IconButton>
          </Box>
        </CardContent>
      </Card>

      {/* Floating Scroll to Bottom Button */}
      {showScrollToBottom && (
        <Fab
          size="small"
          color="primary"
          onClick={scrollToBottom}
          sx={{
            position: 'absolute',
            bottom: 120,
            right: 16,
            zIndex: 1000,
          }}
        >
          <ScrollDownIcon />
        </Fab>
      )}
    </Box>
  );
};

export default AIChatTab;