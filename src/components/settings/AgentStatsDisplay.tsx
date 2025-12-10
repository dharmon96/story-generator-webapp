/**
 * AgentStatsDisplay Component
 *
 * Compact display of agent system statistics.
 */

import React from 'react';
import {
  Box,
  Typography,
  LinearProgress,
  Tooltip,
  Stack
} from '@mui/material';
import { AgentSystemStats, AgentGpuInfo } from '../../types/agentTypes';

interface AgentStatsDisplayProps {
  stats: AgentSystemStats;
  compact?: boolean;
}

const StatBar: React.FC<{
  label: string;
  value: number;
  suffix?: string;
  warning?: number;
  error?: number;
}> = ({ label, value, suffix = '%', warning = 70, error = 90 }) => {
  const color = value >= error ? 'error' : value >= warning ? 'warning' : 'success';

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" mb={0.25}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="caption" fontWeight="medium">
          {value.toFixed(0)}{suffix}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={Math.min(value, 100)}
        color={color}
        sx={{ height: 4, borderRadius: 1 }}
      />
    </Box>
  );
};

const GpuStatBar: React.FC<{
  gpu: AgentGpuInfo;
  compact?: boolean;
}> = ({ gpu, compact }) => {
  const vramPercent = gpu.memoryUsagePercent;
  const color = vramPercent >= 95 ? 'error' : vramPercent >= 80 ? 'warning' : 'success';

  const formatMb = (mb: number) => {
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)}G`;
    return `${mb.toFixed(0)}M`;
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.25}>
        <Tooltip title={gpu.name}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              maxWidth: compact ? 100 : 200,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {compact ? `GPU ${gpu.index}` : gpu.name}
          </Typography>
        </Tooltip>
        <Typography variant="caption" fontWeight="medium">
          {formatMb(gpu.memoryUsedMb)}/{formatMb(gpu.memoryTotalMb)}
          {gpu.temperatureC !== null && (
            <Typography
              component="span"
              variant="caption"
              color={gpu.temperatureC > 80 ? 'error.main' : 'text.secondary'}
              sx={{ ml: 0.5 }}
            >
              {gpu.temperatureC}°C
            </Typography>
          )}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={Math.min(vramPercent, 100)}
        color={color}
        sx={{ height: 4, borderRadius: 1 }}
      />
    </Box>
  );
};

export const AgentStatsDisplay: React.FC<AgentStatsDisplayProps> = ({ stats, compact = false }) => {
  return (
    <Stack spacing={compact ? 0.5 : 1}>
      <StatBar label="CPU" value={stats.cpuPercent} />
      <StatBar label="RAM" value={stats.memoryPercent} />
      {stats.gpuInfo.map((gpu, idx) => (
        <GpuStatBar key={idx} gpu={gpu} compact={compact} />
      ))}
      {stats.diskUsagePercent !== undefined && !compact && (
        <StatBar label="Disk" value={stats.diskUsagePercent} warning={80} error={95} />
      )}
    </Stack>
  );
};

export default AgentStatsDisplay;
