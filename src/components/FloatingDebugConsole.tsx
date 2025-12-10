import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Fab,
  Collapse,
  List,
  ListItem,
  Chip,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Tooltip,
  Badge,
} from '@mui/material';
import {
  BugReport as BugIcon,
  Close as CloseIcon,
  DeleteSweep as ClearIcon,
  Download as DownloadIcon,
  Search as SearchIcon,
  ExpandLess,
  ExpandMore,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import { debugService, DebugLogEntry } from '../services/debugService';

interface FloatingDebugConsoleProps {
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

const FloatingDebugConsole: React.FC<FloatingDebugConsoleProps> = ({ 
  position = 'bottom-right' 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = debugService.subscribe(setLogs);
    return unsubscribe;
  }, []);

  // Handle manual scrolling detection
  useEffect(() => {
    const handleScroll = () => {
      if (!listRef.current || !autoScroll) return;
      
      const { scrollTop, scrollHeight, clientHeight } = listRef.current;
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
    };

    const listElement = listRef.current;
    if (listElement && isOpen) {
      listElement.addEventListener('scroll', handleScroll, { passive: true });
      return () => listElement.removeEventListener('scroll', handleScroll);
    }
  }, [autoScroll, isUserScrolling, isOpen]);

  const filteredLogs = logs.filter(log => {
    if (levelFilter !== 'all' && log.level !== levelFilter) return false;
    if (categoryFilter !== 'all' && log.category !== categoryFilter) return false;
    if (searchTerm && !log.message.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    return true;
  });

  useEffect(() => {
    if (autoScroll && !isUserScrolling && listRef.current && isOpen) {
      // Use setTimeout to ensure DOM has been updated
      setTimeout(() => {
        if (listRef.current && !isUserScrolling) {
          listRef.current.scrollTop = listRef.current.scrollHeight;
        }
      }, 0);
    }
  }, [logs, isOpen, autoScroll, isUserScrolling]);

  // Also scroll when filtered logs change
  useEffect(() => {
    if (autoScroll && !isUserScrolling && listRef.current && isOpen) {
      setTimeout(() => {
        if (listRef.current && !isUserScrolling) {
          listRef.current.scrollTop = listRef.current.scrollHeight;
        }
      }, 0);
    }
  }, [filteredLogs.length, autoScroll, isOpen, isUserScrolling]);

  const errorCount = logs.filter(log => log.level === 'error').length;
  const warnCount = logs.filter(log => log.level === 'warn').length;

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'error': return '❌';
      case 'warn': return '⚠️';
      case 'success': return '✅';
      case 'info': return 'ℹ️';
      case 'debug': return '🔍';
      default: return '📝';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'queue': return '📋';
      case 'ui': return '🖥️';
      case 'ai': return '🤖';
      case 'pipeline': return '⚙️';
      case 'store': return '🗄️';
      case 'network': return '🌐';
      case 'test': return '🧪';
      case 'console': return '💻';
      default: return '📝';
    }
  };

  const handleExport = () => {
    const exportData = debugService.exportLogs();
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `debug-logs-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleScrollToBottom = () => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
      setIsUserScrolling(false);
      setShowScrollToBottom(false);
    }
  };

  const getPositionStyles = () => {
    const base = { position: 'fixed' as const, zIndex: 9999 };
    switch (position) {
      case 'bottom-right':
        return { ...base, bottom: 16, right: 16 };
      case 'bottom-left':
        return { ...base, bottom: 16, left: 16 };
      case 'top-right':
        return { ...base, top: 16, right: 16 };
      case 'top-left':
        return { ...base, top: 16, left: 16 };
      default:
        return { ...base, bottom: 16, right: 16 };
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <Fab
        color="secondary"
        size="medium"
        onClick={() => setIsOpen(!isOpen)}
        sx={getPositionStyles()}
      >
        <Badge 
          badgeContent={errorCount + warnCount} 
          color="error"
          max={99}
          invisible={errorCount + warnCount === 0}
        >
          <BugIcon />
        </Badge>
      </Fab>

      {/* Debug Console */}
      <Collapse in={isOpen}>
        <Paper
          elevation={8}
          sx={{
            ...getPositionStyles(),
            bottom: position.includes('bottom') ? 80 : undefined,
            top: position.includes('top') ? 80 : undefined,
            width: 600,
            maxHeight: '70vh',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#1a1a1a',
            color: '#e0e0e0',
            border: '1px solid #333',
          }}
        >
          {/* Header */}
          <Box sx={{ 
            p: 2, 
            borderBottom: '1px solid #333',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <BugIcon sx={{ color: '#ff6b6b' }} />
              <Typography variant="h6" sx={{ color: '#fff' }}>
                Debug Console
              </Typography>
              <Chip 
                size="small" 
                label={`${filteredLogs.length}/${logs.length}`}
                sx={{ color: '#fff', borderColor: '#666' }}
                variant="outlined"
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Tooltip title="Toggle Auto-scroll">
                <IconButton
                  size="small"
                  onClick={() => setAutoScroll(!autoScroll)}
                  sx={{ color: autoScroll ? '#4caf50' : '#666' }}
                >
                  {autoScroll ? <Visibility /> : <VisibilityOff />}
                </IconButton>
              </Tooltip>
              <Tooltip title="Export Logs">
                <IconButton size="small" onClick={handleExport} sx={{ color: '#fff' }}>
                  <DownloadIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Clear Logs">
                <IconButton size="small" onClick={() => debugService.clear()} sx={{ color: '#fff' }}>
                  <ClearIcon />
                </IconButton>
              </Tooltip>
              <IconButton size="small" onClick={() => setIsOpen(false)} sx={{ color: '#fff' }}>
                <CloseIcon />
              </IconButton>
            </Box>
          </Box>

          {/* Filters */}
          <Box sx={{ p: 2, borderBottom: '1px solid #333', display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              sx={{ 
                minWidth: 200,
                '& .MuiOutlinedInput-root': { color: '#fff' },
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#666' },
              }}
              InputProps={{
                startAdornment: <SearchIcon sx={{ color: '#666', mr: 1 }} />
              }}
            />
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel sx={{ color: '#ccc' }}>Level</InputLabel>
              <Select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                sx={{ color: '#fff', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#666' } }}
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="debug">Debug</MenuItem>
                <MenuItem value="info">Info</MenuItem>
                <MenuItem value="warn">Warn</MenuItem>
                <MenuItem value="error">Error</MenuItem>
                <MenuItem value="success">Success</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel sx={{ color: '#ccc' }}>Category</InputLabel>
              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                sx={{ color: '#fff', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#666' } }}
              >
                <MenuItem value="all">All</MenuItem>
                {debugService.getCategories().map(category => (
                  <MenuItem key={category} value={category}>
                    {getCategoryIcon(category)} {category}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {/* Stats */}
          <Box sx={{ px: 2, py: 1, display: 'flex', gap: 1, flexWrap: 'wrap', borderBottom: '1px solid #333' }}>
            <Chip size="small" label={`🔍 Debug: ${logs.filter(l => l.level === 'debug').length}`} sx={{ color: '#999' }} variant="outlined" />
            <Chip size="small" label={`ℹ️ Info: ${logs.filter(l => l.level === 'info').length}`} sx={{ color: '#2196f3' }} variant="outlined" />
            <Chip size="small" label={`✅ Success: ${logs.filter(l => l.level === 'success').length}`} sx={{ color: '#4caf50' }} variant="outlined" />
            <Chip size="small" label={`⚠️ Warn: ${warnCount}`} sx={{ color: '#ff9800' }} variant="outlined" />
            <Chip size="small" label={`❌ Error: ${errorCount}`} sx={{ color: '#f44336' }} variant="outlined" />
          </Box>

          {/* Logs List */}
          <Box 
            ref={listRef}
            sx={{ 
              flex: 1, 
              overflow: 'auto', 
              minHeight: 300,
              maxHeight: 400,
              position: 'relative',
            }}
          >
            <List sx={{ p: 0 }}>
                {filteredLogs.map((log, index) => (
                  <ListItem 
                    key={log.id} 
                    sx={{ 
                      px: 2,
                      py: 0.5,
                      display: 'block',
                      borderBottom: '1px solid #2a2a2a',
                      '&:hover': { backgroundColor: '#2a2a2a' }
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.5 }}>
                      <Typography 
                        variant="caption" 
                        sx={{ 
                          color: '#666', 
                          fontFamily: 'monospace',
                          minWidth: 80,
                          fontSize: '0.7rem'
                        }}
                      >
                        {log.timestamp.toLocaleTimeString()}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Chip 
                          size="small" 
                          label={getLevelIcon(log.level)}
                          sx={{ 
                            minWidth: 24, 
                            height: 16, 
                            fontSize: '0.6rem',
                            '& .MuiChip-label': { px: 0.5 }
                          }}
                        />
                        <Chip 
                          size="small" 
                          label={getCategoryIcon(log.category)}
                          sx={{ 
                            minWidth: 24, 
                            height: 16, 
                            fontSize: '0.6rem',
                            '& .MuiChip-label': { px: 0.5 }
                          }}
                        />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography 
                          variant="body2" 
                          sx={{ 
                            color: '#fff',
                            fontSize: '0.8rem',
                            wordBreak: 'break-word'
                          }}
                        >
                          {log.message}
                        </Typography>
                        {log.source && (
                          <Typography 
                            variant="caption" 
                            sx={{ color: '#888', fontSize: '0.7rem' }}
                          >
                            [{log.source}]
                          </Typography>
                        )}
                        {log.duration && (
                          <Chip 
                            size="small" 
                            label={`${log.duration.toFixed(2)}ms`}
                            sx={{ 
                              ml: 1, 
                              height: 16, 
                              fontSize: '0.6rem',
                              color: '#4caf50',
                              borderColor: '#4caf50'
                            }}
                            variant="outlined"
                          />
                        )}
                      </Box>
                      {log.details && (
                        <IconButton
                          size="small"
                          onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                          sx={{ color: '#666', p: 0.25 }}
                        >
                          {expandedLog === log.id ? <ExpandLess /> : <ExpandMore />}
                        </IconButton>
                      )}
                    </Box>
                    
                    {log.details && expandedLog === log.id && (
                      <Collapse in={expandedLog === log.id}>
                        <Paper sx={{ p: 1, mt: 1, backgroundColor: '#0a0a0a', border: '1px solid #333' }}>
                          <Typography 
                            variant="caption" 
                            sx={{ 
                              fontFamily: 'monospace', 
                              whiteSpace: 'pre-wrap',
                              fontSize: '0.7rem',
                              color: '#ccc',
                              display: 'block'
                            }}
                          >
                            {typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)}
                          </Typography>
                        </Paper>
                      </Collapse>
                    )}
                  </ListItem>
                ))}
                {filteredLogs.length === 0 && (
                  <ListItem>
                    <Typography sx={{ color: '#666', textAlign: 'center', width: '100%' }}>
                      No logs match the current filters
                    </Typography>
                  </ListItem>
                )}
              </List>

              {/* Scroll to Bottom Button */}
              {showScrollToBottom && (
                <Fab
                  size="small"
                  onClick={handleScrollToBottom}
                  sx={{
                    position: 'absolute',
                    bottom: 16,
                    right: 16,
                    backgroundColor: '#4caf50',
                    color: '#fff',
                    '&:hover': { backgroundColor: '#45a049' },
                    zIndex: 1
                  }}
                >
                  <ExpandMore />
                </Fab>
              )}
            </Box>

          {/* Footer */}
          <Box sx={{ p: 1, borderTop: '1px solid #333', display: 'flex', justifyContent: 'between', alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: '#666' }}>
              Debug logging enabled • {logs.length} total logs
            </Typography>
            <Button 
              size="small" 
              onClick={() => debugService.testStart('sample', 'Test the debug console')}
              sx={{ color: '#4caf50', fontSize: '0.7rem' }}
            >
              Test Log
            </Button>
          </Box>
        </Paper>
      </Collapse>
    </>
  );
};

export default FloatingDebugConsole;