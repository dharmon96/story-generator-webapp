/**
 * AgentCard Component
 *
 * Displays a single agent node with its status, capabilities, and stats.
 */

import React from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  Chip,
  LinearProgress,
  IconButton,
  Tooltip,
  Collapse,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Computer as ComputerIcon,
  Memory as MemoryIcon,
  Storage as StorageIcon,
  Speed as SpeedIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon
} from '@mui/icons-material';
import { AgentNode, WorkflowAvailability } from '../../types/agentTypes';

interface AgentCardProps {
  agent: AgentNode;
  onRefresh?: (agent: AgentNode) => void;
  onRemove?: (agent: AgentNode) => void;
}

const statusColors: Record<AgentNode['status'], 'success' | 'error' | 'warning' | 'default'> = {
  online: 'success',
  offline: 'error',
  busy: 'warning',
  checking: 'default'
};

const statusLabels: Record<AgentNode['status'], string> = {
  online: 'Online',
  offline: 'Offline',
  busy: 'Busy',
  checking: 'Checking...'
};

export const AgentCard: React.FC<AgentCardProps> = ({ agent, onRefresh, onRemove }) => {
  const [expanded, setExpanded] = React.useState(false);

  const formatBytes = (mb: number) => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)} GB`;
    }
    return `${mb.toFixed(0)} MB`;
  };

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined) return 'N/A';
    return `${value.toFixed(0)}%`;
  };

  return (
    <Card
      sx={{
        mb: 2,
        borderLeft: 4,
        borderColor: agent.status === 'online' ? 'success.main' : agent.status === 'busy' ? 'warning.main' : 'error.main'
      }}
    >
      <CardContent>
        {/* Header */}
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center" gap={1}>
            <ComputerIcon color={agent.status === 'offline' ? 'disabled' : 'primary'} />
            <Box>
              <Typography variant="subtitle1" fontWeight="bold">
                {agent.displayName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {agent.hostname} ({agent.ipAddresses[0] || 'localhost'}:{agent.agentPort})
              </Typography>
            </Box>
          </Box>

          <Box display="flex" alignItems="center" gap={1}>
            <Chip
              label={statusLabels[agent.status]}
              color={statusColors[agent.status]}
              size="small"
            />
            {onRefresh && (
              <Tooltip title="Refresh">
                <IconButton size="small" onClick={() => onRefresh(agent)}>
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {onRemove && (
              <Tooltip title="Remove">
                <IconButton size="small" onClick={() => onRemove(agent)} color="error">
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>

        {/* Capabilities Summary */}
        <Box display="flex" gap={1} mt={1.5} flexWrap="wrap">
          {agent.ollama?.available && (
            <Chip
              label={`Ollama (${agent.ollama.models.length} models)`}
              size="small"
              variant="outlined"
              color="primary"
            />
          )}
          {agent.comfyui?.available && (
            <Chip
              label={`ComfyUI (${agent.comfyui.workflows.filter(w => w.available).length} workflows)`}
              size="small"
              variant="outlined"
              color="secondary"
            />
          )}
        </Box>

        {/* Quick Stats */}
        {agent.system && (
          <Box mt={2}>
            <Box display="flex" gap={2} mb={1}>
              <Box flex={1}>
                <Typography variant="caption" color="text.secondary">
                  CPU {formatPercent(agent.system.cpuPercent)}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={agent.system.cpuPercent}
                  color={agent.system.cpuPercent > 80 ? 'error' : 'primary'}
                  sx={{ height: 6, borderRadius: 1 }}
                />
              </Box>
              <Box flex={1}>
                <Typography variant="caption" color="text.secondary">
                  RAM {formatPercent(agent.system.memoryPercent)}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={agent.system.memoryPercent}
                  color={agent.system.memoryPercent > 80 ? 'error' : 'primary'}
                  sx={{ height: 6, borderRadius: 1 }}
                />
              </Box>
            </Box>

            {/* GPU Stats */}
            {agent.system.gpuInfo && agent.system.gpuInfo.length > 0 && (
              <Box>
                {agent.system.gpuInfo.map((gpu, idx) => (
                  <Box key={idx} mb={0.5}>
                    <Typography variant="caption" color="text.secondary">
                      {gpu.name} - VRAM {formatBytes(gpu.memoryUsedMb)}/{formatBytes(gpu.memoryTotalMb)}
                      {gpu.temperatureC !== null && ` (${gpu.temperatureC}°C)`}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={gpu.memoryUsagePercent}
                      color={gpu.memoryUsagePercent > 90 ? 'error' : gpu.memoryUsagePercent > 70 ? 'warning' : 'success'}
                      sx={{ height: 6, borderRadius: 1 }}
                    />
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        )}

        {/* Expand/Collapse */}
        <Box display="flex" justifyContent="center" mt={1}>
          <IconButton size="small" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>

        {/* Expanded Details */}
        <Collapse in={expanded}>
          <Divider sx={{ my: 1 }} />

          {/* Ollama Models */}
          {agent.ollama?.available && agent.ollama.models.length > 0 && (
            <Box mb={2}>
              <Typography variant="subtitle2" gutterBottom>
                <MemoryIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                Ollama Models
              </Typography>
              <Box display="flex" gap={0.5} flexWrap="wrap">
                {agent.ollama.models.map((model) => (
                  <Chip key={model} label={model} size="small" variant="outlined" />
                ))}
              </Box>
              {agent.ollama.stats && (
                <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                  {agent.ollama.stats.successRate.toFixed(0)}% success rate |{' '}
                  {agent.ollama.stats.avgResponseTimeMs.toFixed(0)}ms avg response
                </Typography>
              )}
            </Box>
          )}

          {/* ComfyUI Workflows */}
          {agent.comfyui?.available && agent.comfyui.workflows.length > 0 && (
            <Box mb={2}>
              <Typography variant="subtitle2" gutterBottom>
                <StorageIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                ComfyUI Workflows
              </Typography>
              <List dense disablePadding>
                {agent.comfyui.workflows.map((workflow: WorkflowAvailability) => (
                  <ListItem key={workflow.id} disablePadding>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      {workflow.available ? (
                        <CheckCircleIcon color="success" fontSize="small" />
                      ) : (
                        <CancelIcon color="error" fontSize="small" />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={workflow.name}
                      secondary={
                        !workflow.available && workflow.missingModels
                          ? `Missing: ${workflow.missingModels.join(', ')}`
                          : undefined
                      }
                      primaryTypographyProps={{ variant: 'body2' }}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}

          {/* System Info */}
          {agent.system && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                <SpeedIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                System Info
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {agent.system.cpuModel && `${agent.system.cpuModel} (${agent.system.cpuCores} cores)`}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {agent.system.memoryTotalGb.toFixed(1)} GB RAM |{' '}
                {agent.system.memoryAvailableGb.toFixed(1)} GB available
              </Typography>
              {agent.platform && (
                <Typography variant="body2" color="text.secondary">
                  {agent.platform} {agent.platformVersion}
                </Typography>
              )}
            </Box>
          )}
        </Collapse>
      </CardContent>
    </Card>
  );
};

export default AgentCard;
