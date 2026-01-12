/**
 * CloudServiceCard Component
 *
 * Displays and configures a cloud API service (OpenAI, Claude, Google).
 */

import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  TextField,
  IconButton,
  Chip,
  Button,
  CircularProgress,
  InputAdornment,
  Collapse,
  Tooltip,
  Link
} from '@mui/material';
import {
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  Cloud as CloudIcon,
  OpenInNew as OpenInNewIcon,
  Key as KeyIcon,
  CreditCard as CreditCardIcon,
  MenuBook as DocsIcon
} from '@mui/icons-material';
import { CloudServiceNode } from '../../types/agentTypes';

interface CloudServiceCardProps {
  service: CloudServiceNode;
  onApiKeyChange: (id: string, apiKey: string) => void;
  onValidate: (service: CloudServiceNode) => Promise<void>;
}

const serviceColors: Record<string, string> = {
  openai: '#10a37f',
  claude: '#d97706',
  google: '#4285f4'
};

export const CloudServiceCard: React.FC<CloudServiceCardProps> = ({
  service,
  onApiKeyChange,
  onValidate
}) => {
  const [showKey, setShowKey] = useState(false);
  const [localKey, setLocalKey] = useState(service.apiKey);
  const [isValidating, setIsValidating] = useState(false);

  const handleValidate = async () => {
    setIsValidating(true);
    try {
      await onValidate(service);
    } finally {
      setIsValidating(false);
    }
  };

  const handleSaveKey = () => {
    onApiKeyChange(service.id, localKey);
  };

  const hasChanges = localKey !== service.apiKey;

  const statusColor =
    service.status === 'online' ? 'success' :
    service.status === 'offline' ? 'error' :
    service.status === 'validating' ? 'warning' : 'default';

  return (
    <Card
      sx={{
        mb: 2,
        borderLeft: 4,
        borderColor: serviceColors[service.type] || 'grey.500'
      }}
    >
      <CardContent>
        {/* Header */}
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Box display="flex" alignItems="center" gap={1.5}>
            <CloudIcon sx={{ color: serviceColors[service.type] }} />
            <Box>
              <Typography variant="subtitle1" fontWeight="bold">
                {service.displayName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {service.type.toUpperCase()} API
              </Typography>
            </Box>
          </Box>

          <Chip
            label={
              service.status === 'online' ? 'Connected' :
              service.status === 'validating' ? 'Validating...' :
              service.status === 'unconfigured' ? 'Not Configured' : 'Error'
            }
            color={statusColor}
            size="small"
            icon={
              service.status === 'validating' ? (
                <CircularProgress size={14} color="inherit" />
              ) : service.status === 'online' ? (
                <CheckIcon />
              ) : service.status === 'offline' ? (
                <CloseIcon />
              ) : undefined
            }
          />
        </Box>

        {/* Quick Links */}
        {(service.subscriptionUrl || service.apiKeysUrl || service.docsUrl) && (
          <Box display="flex" gap={1} mb={2} flexWrap="wrap">
            {service.subscriptionUrl && (
              <Tooltip title="Manage Subscription & Billing">
                <Link
                  href={service.subscriptionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  underline="none"
                >
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<CreditCardIcon />}
                    endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                    sx={{
                      textTransform: 'none',
                      borderColor: serviceColors[service.type],
                      color: serviceColors[service.type],
                      '&:hover': {
                        borderColor: serviceColors[service.type],
                        backgroundColor: `${serviceColors[service.type]}10`
                      }
                    }}
                  >
                    Subscription
                  </Button>
                </Link>
              </Tooltip>
            )}
            {service.apiKeysUrl && (
              <Tooltip title="Get API Keys">
                <Link
                  href={service.apiKeysUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  underline="none"
                >
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<KeyIcon />}
                    endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                    sx={{
                      textTransform: 'none',
                      borderColor: serviceColors[service.type],
                      color: serviceColors[service.type],
                      '&:hover': {
                        borderColor: serviceColors[service.type],
                        backgroundColor: `${serviceColors[service.type]}10`
                      }
                    }}
                  >
                    API Keys
                  </Button>
                </Link>
              </Tooltip>
            )}
            {service.docsUrl && (
              <Tooltip title="View Documentation">
                <Link
                  href={service.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  underline="none"
                >
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<DocsIcon />}
                    endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                    sx={{
                      textTransform: 'none',
                      borderColor: serviceColors[service.type],
                      color: serviceColors[service.type],
                      '&:hover': {
                        borderColor: serviceColors[service.type],
                        backgroundColor: `${serviceColors[service.type]}10`
                      }
                    }}
                  >
                    Docs
                  </Button>
                </Link>
              </Tooltip>
            )}
          </Box>
        )}

        {/* API Key Input */}
        <Box display="flex" gap={1} alignItems="flex-start">
          <TextField
            fullWidth
            size="small"
            label="API Key"
            type={showKey ? 'text' : 'password'}
            value={localKey}
            onChange={(e) => setLocalKey(e.target.value)}
            placeholder={service.apiKeyMasked || 'Enter API key...'}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => setShowKey(!showKey)}
                    edge="end"
                  >
                    {showKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </InputAdornment>
              )
            }}
          />

          {hasChanges && (
            <Button
              variant="contained"
              size="small"
              onClick={handleSaveKey}
              sx={{ minWidth: 80 }}
            >
              Save
            </Button>
          )}

          {!hasChanges && localKey && (
            <Button
              variant="outlined"
              size="small"
              onClick={handleValidate}
              disabled={isValidating || !localKey}
              sx={{ minWidth: 80 }}
            >
              {isValidating ? <CircularProgress size={20} /> : 'Test'}
            </Button>
          )}
        </Box>

        {/* Error Message */}
        {service.error && (
          <Typography color="error" variant="caption" sx={{ mt: 1, display: 'block' }}>
            {service.error}
          </Typography>
        )}

        {/* Capabilities */}
        <Collapse in={service.status === 'online'}>
          <Box mt={2}>
            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
              Capabilities
            </Typography>
            <Box display="flex" gap={0.5} flexWrap="wrap">
              {service.capabilities.chat && (
                <Chip label="Chat" size="small" color="primary" variant="outlined" />
              )}
              {service.capabilities.vision && (
                <Chip label="Vision" size="small" color="primary" variant="outlined" />
              )}
              {service.capabilities.video && (
                <Chip label="Video" size="small" color="secondary" variant="outlined" />
              )}
              {service.capabilities.image && (
                <Chip label="Image" size="small" color="secondary" variant="outlined" />
              )}
            </Box>
          </Box>

          {/* Available Models */}
          {service.models.chat.length > 0 && (
            <Box mt={2}>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Available Models
              </Typography>
              <Box display="flex" gap={0.5} flexWrap="wrap">
                {service.models.chat.slice(0, 5).map((model) => (
                  <Chip key={model} label={model} size="small" variant="outlined" />
                ))}
                {service.models.chat.length > 5 && (
                  <Chip label={`+${service.models.chat.length - 5} more`} size="small" />
                )}
              </Box>
            </Box>
          )}
        </Collapse>
      </CardContent>
    </Card>
  );
};

export default CloudServiceCard;
