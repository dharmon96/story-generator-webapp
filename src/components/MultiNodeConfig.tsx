import React, { useState } from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Typography,
  Tooltip,
  Chip,
  Switch,
  FormControlLabel,
  Fade,
  Paper,
  CircularProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  Remove as RemoveIcon,
  Computer,
  SmartToy,
  Cloud,
  CheckCircle,
  PlayArrow,
  KeyboardArrowUp,
  KeyboardArrowDown,
  Check,
  Close,
} from '@mui/icons-material';
import { ModelConfig } from '../store/useStore';
import { OllamaNode, nodeDiscoveryService } from '../services/nodeDiscovery';

interface MultiNodeConfigProps {
  step: {
    key: string;
    label: string;
    description: string;
    pipeline?: 'all' | 'scene-based' | 'shot-based';
    badge?: string;
    optional?: boolean;
  };
  configs: ModelConfig[];
  nodes: OllamaNode[];
  onConfigChange: (stepKey: string, configs: ModelConfig[]) => void;
  stepIndex: number;
  servicesEnabled?: {
    local: boolean;
    online: boolean;
  };
}

export const MultiNodeConfig: React.FC<MultiNodeConfigProps> = ({
  step,
  configs,
  nodes,
  onConfigChange,
  stepIndex,
  servicesEnabled = { local: true, online: true }
}) => {
  const stepConfigs = configs.filter(c => c.step === step.key).sort((a, b) => a.priority - b.priority);
  const onlineNodes = nodes.filter(n => {
    if (n.status !== 'online') return false;
    if (n.category === 'local' && !servicesEnabled.local) return false;
    if (n.category === 'online' && !servicesEnabled.online) return false;
    return true;
  });
  const [testStatus, setTestStatus] = useState<Record<string, 'testing' | 'success' | 'error' | null>>({});

  const getNodeTypeIcon = (type: 'ollama' | 'openai' | 'claude' | 'elevenlabs' | 'suno' | 'comfyui') => {
    switch (type) {
      case 'ollama': return <Computer fontSize="small" />;
      case 'openai': return <SmartToy fontSize="small" />;
      case 'claude': return <Cloud fontSize="small" />;
      case 'elevenlabs': return <SmartToy fontSize="small" />;
      case 'suno': return <SmartToy fontSize="small" />;
      case 'comfyui': return <Computer fontSize="small" />;
      default: return <Computer fontSize="small" />;
    }
  };

  const getNodeModels = (nodeId: string): string[] => {
    const node = nodes.find(n => n.id === nodeId);
    return node?.models || [];
  };

  const addNodeConfig = () => {
    const newConfig: ModelConfig = {
      id: `${step.key}_${Date.now()}`,
      step: step.key,
      nodeId: '',
      model: '',
      enabled: true,
      priority: Math.max(0, ...stepConfigs.map(c => c.priority)) + 1,
    };

    const updatedConfigs = [
      ...configs.filter(c => c.step !== step.key),
      ...stepConfigs,
      newConfig
    ];

    onConfigChange(step.key, updatedConfigs);
  };

  const removeNodeConfig = (configId: string) => {
    const updatedConfigs = configs.filter(c => c.id !== configId);
    onConfigChange(step.key, updatedConfigs);
  };

  const updateNodeConfig = (configId: string, field: keyof ModelConfig, value: any) => {
    let updatedConfigs = configs.map(config => {
      if (config.id === configId) {
        let updatedConfig = { ...config, [field]: value };
        
        // If node changed, clear the model selection
        if (field === 'nodeId') {
          updatedConfig.model = '';
        }
        
        return updatedConfig;
      }
      return config;
    });

    // Special handling for enabled field to ensure at least one is always active
    if (field === 'enabled' && !value) {
      const currentStepConfigs = updatedConfigs.filter(c => c.step === step.key);
      const enabledCount = currentStepConfigs.filter(c => c.enabled).length;
      
      // If disabling would result in no active configs, re-enable the first one
      if (enabledCount === 0) {
        const firstConfig = currentStepConfigs.sort((a, b) => a.priority - b.priority)[0];
        if (firstConfig) {
          updatedConfigs = updatedConfigs.map(config => 
            config.id === firstConfig.id ? { ...config, enabled: true } : config
          );
        }
      }
    }

    onConfigChange(step.key, updatedConfigs);
  };

  const testNodeConfig = async (config: ModelConfig) => {
    setTestStatus(prev => ({ ...prev, [config.id]: 'testing' }));
    
    try {
      const node = nodes.find(n => n.id === config.nodeId);
      if (!node) {
        throw new Error('Node not found');
      }

      console.log(`🧪 Testing configuration: ${node.name} with model ${config.model}`);
      
      if (node.type === 'ollama') {
        // Quick check: verify the model exists on the node
        const response = await fetch(`http://${node.host}:${node.port}/api/tags`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (response.ok) {
          const data = await response.json();
          const modelExists = data.models?.some((m: any) => m.name === config.model);
          if (modelExists) {
            console.log(`✅ Quick test successful: ${config.model} available on ${node.name}`);
            setTestStatus(prev => ({ ...prev, [config.id]: 'success' }));
          } else {
            throw new Error(`Model ${config.model} not found on node`);
          }
        } else {
          throw new Error(`Node unreachable: ${response.status}`);
        }
      } else if (node.type === 'openai') {
        // Quick check: verify API key and model exists
        const apiKey = nodeDiscoveryService.getAPIKey('openai');
        if (!apiKey) {
          throw new Error('OpenAI API key not configured');
        }

        const response = await fetch('https://api.openai.com/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          const modelExists = data.data?.some((m: any) => m.id === config.model);
          if (modelExists) {
            console.log(`✅ Quick test successful: ${config.model} available on OpenAI`);
            setTestStatus(prev => ({ ...prev, [config.id]: 'success' }));
          } else {
            throw new Error(`Model ${config.model} not available`);
          }
        } else {
          throw new Error('Invalid OpenAI API key');
        }
      } else if (node.type === 'claude') {
        // Quick check: verify API key is valid
        const apiKey = nodeDiscoveryService.getAPIKey('claude');
        if (!apiKey) {
          throw new Error('Claude API key not configured');
        }

        // Use invalid request to test auth without consuming tokens
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({ model: '', max_tokens: 0, messages: [] }),
        });

        if (response.status === 400) {
          // 400 = auth valid, request invalid (what we want)
          console.log(`✅ Quick test successful: Claude API key valid`);
          setTestStatus(prev => ({ ...prev, [config.id]: 'success' }));
        } else if (response.status === 401 || response.status === 403) {
          throw new Error('Invalid Claude API key');
        } else {
          setTestStatus(prev => ({ ...prev, [config.id]: 'success' }));
        }
      } else {
        // For unknown types, just mark as success if node is online
        console.log(`✅ Configuration appears valid for ${node.name}`);
        setTestStatus(prev => ({ ...prev, [config.id]: 'success' }));
      }

      // Auto-clear success status after 3 seconds
      setTimeout(() => {
        setTestStatus(prev => ({ ...prev, [config.id]: null }));
      }, 3000);

    } catch (error: any) {
      console.error(`❌ Test failed for configuration:`, error);
      setTestStatus(prev => ({ ...prev, [config.id]: 'error' }));
      
      // Auto-clear error status after 5 seconds
      setTimeout(() => {
        setTestStatus(prev => ({ ...prev, [config.id]: null }));
      }, 5000);
    }
  };

  const moveNodeConfig = (configId: string, direction: 'up' | 'down') => {
    const currentIndex = stepConfigs.findIndex(c => c.id === configId);
    if (currentIndex === -1) return;
    
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= stepConfigs.length) return;
    
    // Create new priority values
    const updatedStepConfigs = [...stepConfigs];
    const temp = updatedStepConfigs[currentIndex];
    updatedStepConfigs[currentIndex] = updatedStepConfigs[targetIndex];
    updatedStepConfigs[targetIndex] = temp;
    
    // Reassign priorities to maintain order
    updatedStepConfigs.forEach((config, index) => {
      config.priority = index + 1;
    });
    
    const updatedConfigs = [
      ...configs.filter(c => c.step !== step.key),
      ...updatedStepConfigs
    ];

    onConfigChange(step.key, updatedConfigs);
  };

  const isStepEnabled = stepConfigs.some(c => c.enabled && c.nodeId && c.model);

  return (
    <Paper
      elevation={2}
      sx={{ 
        p: 3,
        border: '1px solid',
        borderColor: isStepEnabled ? 'primary.main' : 'grey.300',
        borderRadius: 2,
        background: isStepEnabled 
          ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%)'
          : 'grey.50',
        transition: 'all 0.3s ease',
        '&:hover': {
          boxShadow: 4,
        }
      }}
    >
      {/* Step Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: isStepEnabled 
              ? 'linear-gradient(45deg, #667eea 30%, #764ba2 90%)'
              : 'linear-gradient(45deg, #bbb 30%, #999 90%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '1.1rem',
            transition: 'all 0.3s ease',
          }}
        >
          {stepIndex + 1}
        </Box>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography variant="h6" fontWeight="bold">
              {step.label}
            </Typography>
            {/* Pipeline badge - shows which generation method uses this step */}
            {step.badge && (
              <Chip
                size="small"
                label={step.badge}
                sx={{
                  height: 20,
                  fontSize: '0.7rem',
                  fontWeight: 'bold',
                  backgroundColor: step.pipeline === 'scene-based'
                    ? 'rgba(156, 39, 176, 0.15)' // Purple for HoloCine
                    : 'rgba(33, 150, 243, 0.15)', // Blue for Wan/Kling
                  color: step.pipeline === 'scene-based'
                    ? '#9c27b0'
                    : '#2196f3',
                  border: '1px solid',
                  borderColor: step.pipeline === 'scene-based'
                    ? 'rgba(156, 39, 176, 0.4)'
                    : 'rgba(33, 150, 243, 0.4)',
                }}
              />
            )}
            {/* Optional badge */}
            {step.optional && (
              <Chip
                size="small"
                label="Optional"
                sx={{
                  height: 20,
                  fontSize: '0.65rem',
                  backgroundColor: 'rgba(158, 158, 158, 0.15)',
                  color: '#757575',
                  border: '1px solid rgba(158, 158, 158, 0.3)',
                }}
              />
            )}
          </Box>
          <Typography variant="body2" color="text.secondary">
            {step.description}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {stepConfigs.length > 0 && (
            <Chip 
              size="small" 
              label={`${stepConfigs.filter(c => c.enabled).length} node${stepConfigs.filter(c => c.enabled).length !== 1 ? 's' : ''}`}
              color={isStepEnabled ? "primary" : "default"}
              variant="outlined"
            />
          )}
          <Tooltip title="Add Node Configuration">
            <IconButton 
              size="small" 
              onClick={addNodeConfig}
              sx={{ 
                color: 'primary.main',
                backgroundColor: 'primary.50',
                '&:hover': { backgroundColor: 'primary.100' }
              }}
            >
              <AddIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Node Configurations */}
      {stepConfigs.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            No nodes assigned to this step
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Click the + button to add a node configuration
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {stepConfigs.map((config, configIndex) => (
            <Fade in={true} key={config.id}>
              <Paper
                elevation={1}
                sx={{
                  p: 2,
                  border: '1px solid',
                  borderColor: config.enabled ? 'primary.200' : 'grey.200',
                  borderRadius: 2,
                  backgroundColor: config.enabled ? 'primary.25' : 'background.paper',
                  transition: 'all 0.2s ease',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {/* Priority Indicator with Reorder Controls */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.2 }}>
                      <Tooltip title="Move Up">
                        <IconButton 
                          size="small" 
                          onClick={() => moveNodeConfig(config.id, 'up')}
                          disabled={configIndex === 0}
                          sx={{ 
                            height: 16, 
                            width: 16,
                            color: configIndex === 0 ? 'text.disabled' : 'text.secondary',
                            '&:hover': { 
                              color: configIndex === 0 ? 'text.disabled' : 'primary.main',
                              backgroundColor: configIndex === 0 ? 'transparent' : 'primary.50'
                            }
                          }}
                        >
                          <KeyboardArrowUp fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Move Down">
                        <IconButton 
                          size="small" 
                          onClick={() => moveNodeConfig(config.id, 'down')}
                          disabled={configIndex === stepConfigs.length - 1}
                          sx={{ 
                            height: 16, 
                            width: 16,
                            color: configIndex === stepConfigs.length - 1 ? 'text.disabled' : 'text.secondary',
                            '&:hover': { 
                              color: configIndex === stepConfigs.length - 1 ? 'text.disabled' : 'primary.main',
                              backgroundColor: configIndex === stepConfigs.length - 1 ? 'transparent' : 'primary.50'
                            }
                          }}
                        >
                          <KeyboardArrowDown fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    <Chip 
                      size="small" 
                      label={configIndex + 1}
                      color="primary"
                      variant="outlined"
                      sx={{ width: 28, height: 24 }}
                    />
                  </Box>

                  {/* Node Selection */}
                  <FormControl sx={{ minWidth: 180 }} size="small">
                    <InputLabel>Node</InputLabel>
                    <Select
                      value={config.nodeId}
                      label="Node"
                      onChange={(e) => updateNodeConfig(config.id, 'nodeId', e.target.value)}
                    >
                      {onlineNodes.map((node) => (
                        <MenuItem key={node.id} value={node.id}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ color: 'primary.main' }}>
                              {getNodeTypeIcon(node.type)}
                            </Box>
                            <CheckCircle color="success" fontSize="small" />
                            {node.name}
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {/* Model Selection */}
                  <FormControl sx={{ minWidth: 200 }} size="small">
                    <InputLabel>Model</InputLabel>
                    <Select
                      value={config.model}
                      label="Model"
                      onChange={(e) => updateNodeConfig(config.id, 'model', e.target.value)}
                      disabled={!config.nodeId}
                    >
                      {getNodeModels(config.nodeId).map((model) => (
                        <MenuItem key={model} value={model}>
                          {model}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {/* Enable Toggle - Only show if there are 2 or more configurations */}
                  {stepConfigs.length > 1 && (
                    <FormControlLabel
                      control={
                        <Switch
                          checked={config.enabled}
                          onChange={(e) => updateNodeConfig(config.id, 'enabled', e.target.checked)}
                          color="primary"
                          size="small"
                        />
                      }
                      label="Active"
                      sx={{ ml: 1 }}
                    />
                  )}

                  {/* Actions */}
                  <Box sx={{ display: 'flex', gap: 0.5, ml: 'auto' }}>
                    {config.nodeId && config.model && config.enabled && (
                      <Tooltip title="Test Configuration">
                        <IconButton 
                          size="small" 
                          color="primary"
                          onClick={() => testNodeConfig(config)}
                          disabled={testStatus[config.id] === 'testing'}
                        >
                          {testStatus[config.id] === 'testing' && (
                            <CircularProgress size={16} />
                          )}
                          {testStatus[config.id] === 'success' && (
                            <Check fontSize="small" sx={{ color: 'success.main' }} />
                          )}
                          {testStatus[config.id] === 'error' && (
                            <Close fontSize="small" sx={{ color: 'error.main' }} />
                          )}
                          {!testStatus[config.id] && (
                            <PlayArrow fontSize="small" />
                          )}
                        </IconButton>
                      </Tooltip>
                    )}
                    
                    {/* Only show remove button if not the first config AND there's more than 1 config */}
                    {configIndex > 0 && stepConfigs.length > 1 && (
                      <Tooltip title="Remove Node">
                        <IconButton 
                          size="small" 
                          onClick={() => removeNodeConfig(config.id)}
                          sx={{ 
                            color: 'error.main',
                            '&:hover': { backgroundColor: 'error.50' }
                          }}
                        >
                          <RemoveIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </Box>
              </Paper>
            </Fade>
          ))}
        </Box>
      )}
    </Paper>
  );
};

export default MultiNodeConfig;