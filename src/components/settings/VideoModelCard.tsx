/**
 * VideoModelCard Component
 *
 * Displays a video generation model's status and availability.
 */

import React from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  Chip,
  Tooltip,
  alpha
} from '@mui/material';
import {
  CheckCircle as EnabledIcon,
  Cancel as DisabledIcon,
  Schedule as ComingSoonIcon,
  Computer as LocalIcon,
  Cloud as CloudIcon
} from '@mui/icons-material';
import { VideoModelStatus } from '../../types/agentTypes';

interface VideoModelCardProps {
  model: VideoModelStatus;
  onClick?: (model: VideoModelStatus) => void;
}

export const VideoModelCard: React.FC<VideoModelCardProps> = ({ model, onClick }) => {
  const isEnabled = model.enabled && !model.comingSoon;
  const isComingSoon = model.comingSoon;

  return (
    <Card
      sx={{
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s',
        opacity: isEnabled ? 1 : 0.7,
        borderLeft: 4,
        borderColor: isEnabled ? model.color : 'grey.400',
        bgcolor: isEnabled ? alpha(model.color, 0.05) : 'background.paper',
        '&:hover': onClick ? {
          transform: 'translateY(-2px)',
          boxShadow: 3
        } : {}
      }}
      onClick={() => onClick?.(model)}
    >
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center" gap={1.5}>
            <Typography fontSize="1.5rem">{model.icon}</Typography>
            <Box>
              <Typography variant="subtitle2" fontWeight="bold">
                {model.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {model.description}
              </Typography>
            </Box>
          </Box>

          <Box display="flex" alignItems="center" gap={1}>
            {/* Type Badge */}
            <Tooltip title={model.type === 'local' ? 'Local ComfyUI' : 'Cloud API'}>
              <Chip
                icon={model.type === 'local' ? <LocalIcon /> : <CloudIcon />}
                label={model.type}
                size="small"
                variant="outlined"
                sx={{ textTransform: 'capitalize' }}
              />
            </Tooltip>

            {/* Status */}
            {isComingSoon ? (
              <Tooltip title="Coming Soon">
                <Chip
                  icon={<ComingSoonIcon />}
                  label="Soon"
                  size="small"
                  color="default"
                />
              </Tooltip>
            ) : isEnabled ? (
              <Tooltip title={`Available on ${model.agentCount} agent(s)`}>
                <Chip
                  icon={<EnabledIcon />}
                  label={model.agentCount > 0 ? `${model.agentCount} agent${model.agentCount > 1 ? 's' : ''}` : 'Ready'}
                  size="small"
                  color="success"
                />
              </Tooltip>
            ) : (
              <Tooltip title="No agents with this workflow configured">
                <Chip
                  icon={<DisabledIcon />}
                  label="Unavailable"
                  size="small"
                  color="error"
                  variant="outlined"
                />
              </Tooltip>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default VideoModelCard;
