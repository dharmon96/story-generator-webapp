import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Tooltip,
  Paper,
  Fade,
  Zoom,
} from '@mui/material';
import {
  ExpandMore,
  Save,
  Refresh,
  Add,
  Delete,
  CheckCircle,
  Error,
  Search,
  Computer,
  Speed,
  Settings as SettingsIcon,
  PlayArrow,
  Cloud,
  SmartToy,
} from '@mui/icons-material';
import { useStore, ModelConfig as StoreModelConfig } from '../store/useStore';
import { nodeDiscoveryService, OllamaNode } from '../services/nodeDiscovery';
import MultiNodeConfig from '../components/MultiNodeConfig';

const PIPELINE_STEPS = [
  { key: 'story', label: 'Story Generation', description: 'Main story creation and plot development' },
  { key: 'characters', label: 'Character Development', description: 'Character descriptions and dialogue' },
  { key: 'shots', label: 'Shot Planning', description: 'Visual scene breakdown and shot composition' },
  { key: 'prompts', label: 'Image Prompts', description: 'AI image generation prompt creation' },
  { key: 'narration', label: 'Narration', description: 'Voice-over script and timing' },
  { key: 'music', label: 'Music & Audio', description: 'Background music and sound effects' },
];

const Settings: React.FC = () => {
  const { settings, updateSettings } = useStore();
  const [nodes, setNodes] = useState<OllamaNode[]>([]);
  const [modelConfigs, setModelConfigs] = useState<StoreModelConfig[]>(
    (settings.modelConfigs && settings.modelConfigs.length > 0) 
      ? settings.modelConfigs
      : PIPELINE_STEPS.map(step => ({
          id: `${step.key}_default_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          step: step.key,
          nodeId: '',
          model: '',
          enabled: true,
          priority: 1,
        }))
  );
  const [scanning, setScanning] = useState(false);
  const [addNodeDialog, setAddNodeDialog] = useState(false);
  const [newNodeHost, setNewNodeHost] = useState('');
  const [newNodePort, setNewNodePort] = useState(11434);
  const [saved, setSaved] = useState(false);
  const [apiKeys, setApiKeys] = useState({
    openai: nodeDiscoveryService.getAPIKey('openai'),
    claude: nodeDiscoveryService.getAPIKey('claude'),
  });
  const [quickAssignNode, setQuickAssignNode] = useState('');
  const [quickAssignModel, setQuickAssignModel] = useState('');
  const [servicesEnabled, setServicesEnabled] = useState({
    local: true,
    online: true,
  });

  // Clear quick assign selections when services are disabled
  useEffect(() => {
    if (quickAssignNode) {
      const selectedNode = nodes.find(n => n.id === quickAssignNode);
      if (selectedNode) {
        const shouldClear = (
          (selectedNode.category === 'local' && !servicesEnabled.local) ||
          (selectedNode.category === 'online' && !servicesEnabled.online)
        );
        if (shouldClear) {
          setQuickAssignNode('');
          setQuickAssignModel('');
        }
      }
    }
  }, [servicesEnabled, quickAssignNode, nodes]);

  useEffect(() => {
    loadNodes();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadNodes = async () => {
    const existingNodes = nodeDiscoveryService.getNodes();
    setNodes(existingNodes);
    
    // Auto-scan if no nodes found
    if (existingNodes.length === 0) {
      handleScanNetwork();
    }
    
    // Initialize API nodes if they have keys
    if (apiKeys.openai && !existingNodes.find(n => n.id === 'api_openai')) {
      nodeDiscoveryService.addAPINode('openai', apiKeys.openai);
    }
    if (apiKeys.claude && !existingNodes.find(n => n.id === 'api_claude')) {
      nodeDiscoveryService.addAPINode('claude', apiKeys.claude);
    }
  };

  const handleScanNetwork = async () => {
    setScanning(true);
    try {
      console.log('🔍 Starting comprehensive network scan for Ollama nodes...');
      const foundNodes = await nodeDiscoveryService.scanLocalNetwork();
      
      // Re-add API nodes if they have keys but aren't present
      if (apiKeys.openai && !foundNodes.find(n => n.id === 'api_openai')) {
        console.log('🔄 Re-adding OpenAI service...');
        nodeDiscoveryService.addAPINode('openai', apiKeys.openai);
      }
      if (apiKeys.claude && !foundNodes.find(n => n.id === 'api_claude')) {
        console.log('🔄 Re-adding Claude service...');
        nodeDiscoveryService.addAPINode('claude', apiKeys.claude);
      }
      
      // Get all nodes including any re-added API nodes
      const allNodes = nodeDiscoveryService.getNodes();
      setNodes(allNodes);
      
      const onlineNodes = allNodes.filter(n => n.status === 'online');
      console.log(`🎉 Network scan complete! Found ${onlineNodes.length} online nodes:`);
      onlineNodes.forEach(node => {
        console.log(`🖥️ ${node.name} (${node.type}) - ${node.models.length} models available`);
      });
      
      if (onlineNodes.filter(n => n.type === 'ollama').length === 0) {
        console.warn('⚠️ No online Ollama nodes found on the network. Make sure Ollama is running on local machines.');
      }
    } catch (error) {
      console.error('❌ Network scan failed:', error);
    } finally {
      setScanning(false);
    }
  };

  const handleRefreshNode = async (nodeId: string) => {
    const refreshedNode = await nodeDiscoveryService.refreshNode(nodeId);
    if (refreshedNode) {
      setNodes(prev => prev.map(n => n.id === nodeId ? refreshedNode : n));
    }
  };

  const handleAddNode = async () => {
    const host = newNodeHost.trim();
    if (!host) return;
    
    console.log(`🔍 Testing connection to ${host}:${newNodePort}...`);
    
    try {
      // Test the connection before adding
      const response = await fetch(`http://${host}:${newNodePort}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        const models = data.models?.map((m: any) => m.name) || [];
        
        console.log(`✅ Successfully connected to ${host}:${newNodePort}`);
        console.log(`Found ${models.length} models:`, models);
        
        nodeDiscoveryService.addCustomNode(host, newNodePort);
        setAddNodeDialog(false);
        setNewNodeHost('');
        setNewNodePort(11434);
        loadNodes();
        
        // Show success message
        alert(`✅ Successfully added ${host}:${newNodePort}\nFound ${models.length} models: ${models.join(', ')}`);
      } else {
        console.error(`❌ Connection failed: HTTP ${response.status}`);
        alert(`❌ Connection failed!\n\nHTTP ${response.status}: ${response.statusText}\n\nPlease check:\n- Ollama is running on ${host}:${newNodePort}\n- Firewall allows connections\n- IP address is correct`);
      }
    } catch (error: any) {
      console.error(`❌ Connection error:`, error);
      if (error.name === 'AbortError') {
        alert(`⏰ Connection timeout!\n\nCould not reach ${host}:${newNodePort}\n\nPlease check:\n- Machine is online\n- IP address is correct\n- Network connectivity`);
      } else {
        alert(`❌ Connection failed!\n\nError: ${error.message}\n\nPlease check:\n- Ollama is running on ${host}:${newNodePort}\n- Firewall settings\n- Network configuration`);
      }
    }
  };

  const handleAPIKeyChange = (type: 'openai' | 'claude', apiKey: string) => {
    setApiKeys(prev => ({ ...prev, [type]: apiKey }));
    nodeDiscoveryService.updateAPIKey(type, apiKey);
    loadNodes();
  };

  const handleReAddAPIService = (type: 'openai' | 'claude') => {
    const apiKey = apiKeys[type];
    if (apiKey) {
      console.log(`🔄 Re-adding ${type} service...`);
      nodeDiscoveryService.addAPINode(type, apiKey);
      setNodes(nodeDiscoveryService.getNodes());
    }
  };

  const isAPIServiceMissing = (type: 'openai' | 'claude') => {
    return apiKeys[type] && !nodes.find(n => n.id === `api_${type}`);
  };

  const handleDeleteNode = (nodeId: string) => {
    nodeDiscoveryService.removeNode(nodeId);
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    // Clear any model configs using this node
    setModelConfigs(prev => prev.map(config => 
      config.nodeId === nodeId ? { ...config, nodeId: '', model: '' } : config
    ));
  };

  const handleQuickAssignment = () => {
    if (!quickAssignNode || !quickAssignModel) return;
    
    // Replace all configs with single config per step using the selected node/model
    const newConfigs = PIPELINE_STEPS.map(step => ({
      id: `${step.key}_quick_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      step: step.key,
      nodeId: quickAssignNode,
      model: quickAssignModel,
      enabled: true,
      priority: 1,
    }));
    
    setModelConfigs(newConfigs);
    
    // Auto-save configuration changes
    updateSettings({ 
      modelConfigs: newConfigs,
      processingEnabled: nodes.some(n => n.status === 'online'),
      parallelProcessing: 3,
      autoRetry: true,
      retryAttempts: 3,
    });
    
    // Reset the quick assign form
    setQuickAssignNode('');
    setQuickAssignModel('');
  };

  const handleQuickAssignNodeChange = (nodeId: string) => {
    setQuickAssignNode(nodeId);
    setQuickAssignModel(''); // Reset model when node changes
  };

  const getQuickAssignModels = (): string[] => {
    if (!quickAssignNode) return [];
    const node = nodes.find(n => n.id === quickAssignNode);
    return node?.models || [];
  };

  const handleMultiNodeConfigChange = (stepKey: string, updatedConfigs: StoreModelConfig[]) => {
    setModelConfigs(updatedConfigs);
    // Auto-save configuration changes
    updateSettings({ 
      modelConfigs: updatedConfigs,
      processingEnabled: nodes.some(n => n.status === 'online'),
      parallelProcessing: 3,
      autoRetry: true,
      retryAttempts: 3,
    });
  };

  const handleSave = () => {
    // Save model configurations and processing settings
    updateSettings({ 
      modelConfigs: modelConfigs,
      processingEnabled: nodes.some(n => n.status === 'online'),
      parallelProcessing: 3,
      autoRetry: true,
      retryAttempts: 3,
    });
    
    console.log('Saved model configurations:', modelConfigs);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };


  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online': return <CheckCircle color="success" fontSize="small" />;
      case 'offline': return <Error color="error" fontSize="small" />;
      case 'checking': return <CircularProgress size={16} />;
      default: return null;
    }
  };

  const getNodeTypeIcon = (type: 'ollama' | 'openai' | 'claude' | 'elevenlabs' | 'suno' | 'comfyui') => {
    switch (type) {
      case 'ollama': return <Computer />;
      case 'openai': return <SmartToy />;
      case 'claude': return <Cloud />;
      case 'elevenlabs': return <SmartToy />;
      case 'suno': return <SmartToy />;
      case 'comfyui': return <Computer />;
      default: return <Computer />;
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" gutterBottom>Settings</Typography>
          <Typography variant="body2" color="text.secondary">
            Configure your AI nodes and model pipeline
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Save />}
          onClick={handleSave}
          size="large"
          sx={{ 
            background: 'linear-gradient(45deg, #667eea 30%, #764ba2 90%)',
            boxShadow: '0 3px 5px 2px rgba(102, 126, 234, .3)',
          }}
        >
          Save Configuration
        </Button>
      </Box>

      {saved && (
        <Zoom in={saved}>
          <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSaved(false)}>
            Configuration saved successfully!
          </Alert>
        </Zoom>
      )}

      <Grid container spacing={3}>
        {/* Node Discovery Section */}
        <Grid size={12}>
          <Card sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Computer sx={{ fontSize: 28, color: 'white' }} />
                  <Box>
                    <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>AI Service Nodes</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                      {nodes.length} nodes configured ({nodes.filter(n => n.status === 'online').length} online)
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Tooltip title="Scan Network">
                    <IconButton 
                      onClick={handleScanNetwork} 
                      disabled={scanning}
                      sx={{ 
                        backgroundColor: 'rgba(255,255,255,0.2)', 
                        color: 'white',
                        '&:hover': { backgroundColor: 'rgba(255,255,255,0.3)' },
                        '&:disabled': { backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }
                      }}
                    >
                      {scanning ? <CircularProgress size={20} color="inherit" /> : <Search />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Add Custom Node">
                    <IconButton 
                      onClick={() => setAddNodeDialog(true)}
                      sx={{ 
                        backgroundColor: 'rgba(255,255,255,0.2)', 
                        color: 'white',
                        '&:hover': { backgroundColor: 'rgba(255,255,255,0.3)' }
                      }}
                    >
                      <Add />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>

              {scanning && (
                <Box sx={{ textAlign: 'center', py: 3 }}>
                  <CircularProgress sx={{ color: 'white' }} />
                  <Typography variant="body2" sx={{ mt: 2, color: 'rgba(255,255,255,0.9)' }}>
                    Scanning network for Ollama instances...
                  </Typography>
                </Box>
              )}

              {/* Local Services Section */}
              {(() => {
                const localNodes = nodes.filter(n => n.category === 'local');
                if (localNodes.length === 0 && !servicesEnabled.local) return null;
                return (
                  <Box sx={{ mb: 4 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                      <Computer sx={{ color: 'rgba(255,255,255,0.9)' }} />
                      <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
                        Local Services
                      </Typography>
                      <Chip 
                        size="small" 
                        label={`${localNodes.length}`}
                        sx={{
                          backgroundColor: 'rgba(255,255,255,0.2)',
                          color: 'white',
                          border: '1px solid rgba(255,255,255,0.3)',
                        }}
                        variant="outlined"
                      />
                      <Box sx={{ ml: 'auto' }}>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={servicesEnabled.local}
                              onChange={(e) => setServicesEnabled(prev => ({ ...prev, local: e.target.checked }))}
                              size="small"
                              sx={{
                                '& .MuiSwitch-switchBase.Mui-checked': {
                                  color: 'white',
                                },
                                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                  backgroundColor: 'rgba(255,255,255,0.5)',
                                },
                                '& .MuiSwitch-track': {
                                  backgroundColor: 'rgba(255,255,255,0.2)',
                                },
                              }}
                            />
                          }
                          label="Enabled"
                          sx={{ 
                            color: 'rgba(255,255,255,0.9)',
                            '& .MuiFormControlLabel-label': {
                              fontSize: '0.875rem',
                            }
                          }}
                        />
                      </Box>
                    </Box>
                    {servicesEnabled.local ? (
                      <Grid container spacing={2}>
                        {localNodes.map((node) => (
                        <Grid size={{ xs: 12, md: 6 }} key={node.id}>
                          <Fade in timeout={300}>
                            <Paper 
                              sx={{ 
                                p: 2, 
                                background: 'rgba(255,255,255,0.15)',
                                backdropFilter: 'blur(10px)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                borderRadius: 2,
                                '&:hover': {
                                  background: 'rgba(255,255,255,0.2)',
                                  transform: 'translateY(-1px)',
                                },
                                transition: 'all 0.2s',
                              }}
                            >
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <Box sx={{ flex: 1 }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                    <Box sx={{ color: 'white' }}>{getNodeTypeIcon(node.type)}</Box>
                                    {getStatusIcon(node.status)}
                                    <Typography variant="subtitle1" fontWeight="bold" sx={{ color: 'white' }}>
                                      {node.name}
                                    </Typography>
                                  </Box>
                                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }} gutterBottom>
                                    {node.type === 'ollama' ? `${node.host}:${node.port}` : node.host}
                                  </Typography>
                                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                                    <Chip 
                                      size="small" 
                                      label={`${node.models.length} models`}
                                      sx={{
                                        backgroundColor: 'rgba(255,255,255,0.2)',
                                        color: 'white',
                                        border: '1px solid rgba(255,255,255,0.3)',
                                      }}
                                      variant="outlined"
                                    />
                                    <Chip 
                                      size="small" 
                                      label={node.status}
                                      sx={{
                                        backgroundColor: node.status === 'online' ? 'rgba(76, 175, 80, 0.8)' : 'rgba(244, 67, 54, 0.8)',
                                        color: 'white',
                                      }}
                                      variant="filled"
                                    />
                                    <Chip 
                                      size="small" 
                                      label={node.type.toUpperCase()}
                                      sx={{
                                        backgroundColor: 'rgba(255,255,255,0.1)',
                                        color: 'rgba(255,255,255,0.9)',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                      }}
                                      variant="outlined"
                                    />
                                  </Box>
                                </Box>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                  <Tooltip title="Refresh">
                                    <IconButton 
                                      size="small" 
                                      onClick={() => handleRefreshNode(node.id)}
                                      sx={{ color: 'rgba(255,255,255,0.8)', '&:hover': { color: 'white', backgroundColor: 'rgba(255,255,255,0.1)' } }}
                                    >
                                      <Refresh fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Remove">
                                    <IconButton 
                                      size="small" 
                                      onClick={() => handleDeleteNode(node.id)}
                                      sx={{ color: 'rgba(255,255,255,0.8)', '&:hover': { color: 'white', backgroundColor: 'rgba(255,255,255,0.1)' } }}
                                    >
                                      <Delete fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              </Box>
                            </Paper>
                          </Fade>
                          </Grid>
                        ))}
                      </Grid>
                    ) : (
                      <Box sx={{ textAlign: 'center', py: 3, opacity: 0.6 }}>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                          Local services are disabled. Enable them to see available nodes.
                        </Typography>
                      </Box>
                    )}
                  </Box>
                );
              })()}

              {/* Online Services Section */}
              {(() => {
                const onlineNodes = nodes.filter(n => n.category === 'online');
                if (onlineNodes.length === 0 && !servicesEnabled.online) return null;
                return (
                  <Box sx={{ mb: 4 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                      <Cloud sx={{ color: 'rgba(255,255,255,0.9)' }} />
                      <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
                        Online Services
                      </Typography>
                      <Chip 
                        size="small" 
                        label={`${onlineNodes.length}`}
                        sx={{
                          backgroundColor: 'rgba(255,255,255,0.2)',
                          color: 'white',
                          border: '1px solid rgba(255,255,255,0.3)',
                        }}
                        variant="outlined"
                      />
                      <Box sx={{ ml: 'auto' }}>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={servicesEnabled.online}
                              onChange={(e) => setServicesEnabled(prev => ({ ...prev, online: e.target.checked }))}
                              size="small"
                              sx={{
                                '& .MuiSwitch-switchBase.Mui-checked': {
                                  color: 'white',
                                },
                                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                  backgroundColor: 'rgba(255,255,255,0.5)',
                                },
                                '& .MuiSwitch-track': {
                                  backgroundColor: 'rgba(255,255,255,0.2)',
                                },
                              }}
                            />
                          }
                          label="Enabled"
                          sx={{ 
                            color: 'rgba(255,255,255,0.9)',
                            '& .MuiFormControlLabel-label': {
                              fontSize: '0.875rem',
                            }
                          }}
                        />
                      </Box>
                    </Box>
                    {servicesEnabled.online ? (
                      <Grid container spacing={2}>
                        {onlineNodes.map((node) => (
                        <Grid size={{ xs: 12, md: 6 }} key={node.id}>
                          <Fade in timeout={300}>
                            <Paper 
                              sx={{ 
                                p: 2, 
                                background: 'rgba(255,255,255,0.15)',
                                backdropFilter: 'blur(10px)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                borderRadius: 2,
                                '&:hover': {
                                  background: 'rgba(255,255,255,0.2)',
                                  transform: 'translateY(-1px)',
                                },
                                transition: 'all 0.2s',
                              }}
                            >
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <Box sx={{ flex: 1 }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                    <Box sx={{ color: 'white' }}>{getNodeTypeIcon(node.type)}</Box>
                                    {getStatusIcon(node.status)}
                                    <Typography variant="subtitle1" fontWeight="bold" sx={{ color: 'white' }}>
                                      {node.name}
                                    </Typography>
                                  </Box>
                                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }} gutterBottom>
                                    {node.type === 'ollama' ? `${node.host}:${node.port}` : node.host}
                                  </Typography>
                                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                                    <Chip 
                                      size="small" 
                                      label={`${node.models.length} models`}
                                      sx={{
                                        backgroundColor: 'rgba(255,255,255,0.2)',
                                        color: 'white',
                                        border: '1px solid rgba(255,255,255,0.3)',
                                      }}
                                      variant="outlined"
                                    />
                                    <Chip 
                                      size="small" 
                                      label={node.status}
                                      sx={{
                                        backgroundColor: node.status === 'online' ? 'rgba(76, 175, 80, 0.8)' : 'rgba(244, 67, 54, 0.8)',
                                        color: 'white',
                                      }}
                                      variant="filled"
                                    />
                                    <Chip 
                                      size="small" 
                                      label={node.type.toUpperCase()}
                                      sx={{
                                        backgroundColor: 'rgba(255,255,255,0.1)',
                                        color: 'rgba(255,255,255,0.9)',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                      }}
                                      variant="outlined"
                                    />
                                  </Box>
                                </Box>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                  <Tooltip title="Refresh">
                                    <IconButton 
                                      size="small" 
                                      onClick={() => handleRefreshNode(node.id)}
                                      sx={{ color: 'rgba(255,255,255,0.8)', '&:hover': { color: 'white', backgroundColor: 'rgba(255,255,255,0.1)' } }}
                                    >
                                      <Refresh fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Remove">
                                    <IconButton 
                                      size="small" 
                                      onClick={() => handleDeleteNode(node.id)}
                                      sx={{ color: 'rgba(255,255,255,0.8)', '&:hover': { color: 'white', backgroundColor: 'rgba(255,255,255,0.1)' } }}
                                    >
                                      <Delete fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              </Box>
                            </Paper>
                          </Fade>
                          </Grid>
                        ))}
                      </Grid>
                    ) : (
                      <Box sx={{ textAlign: 'center', py: 3, opacity: 0.6 }}>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                          Online services are disabled. Enable them to configure API keys.
                        </Typography>
                      </Box>
                    )}
                  </Box>
                );
              })()}

              {/* Future Services Placeholder Sections */}
              {nodes.length > 0 && (
                <Box sx={{ mb: 4 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <SmartToy sx={{ color: 'rgba(255,255,255,0.6)' }} />
                    <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 'bold' }}>
                      Future Services
                    </Typography>
                    <Chip 
                      size="small" 
                      label="Coming Soon"
                      sx={{
                        backgroundColor: 'rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.6)',
                        border: '1px solid rgba(255,255,255,0.2)',
                      }}
                      variant="outlined"
                    />
                  </Box>
                  
                  <Grid container spacing={2}>
                    {/* ElevenLabs Placeholder */}
                    <Grid size={{ xs: 12, md: 4 }}>
                      <Paper 
                        sx={{ 
                          p: 2, 
                          background: 'rgba(255,255,255,0.05)',
                          backdropFilter: 'blur(10px)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 2,
                          opacity: 0.6,
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <SmartToy sx={{ color: 'rgba(255,255,255,0.6)' }} fontSize="small" />
                          <Typography variant="subtitle2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                            ElevenLabs
                          </Typography>
                        </Box>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                          Voice synthesis and cloning
                        </Typography>
                      </Paper>
                    </Grid>

                    {/* Suno Placeholder */}
                    <Grid size={{ xs: 12, md: 4 }}>
                      <Paper 
                        sx={{ 
                          p: 2, 
                          background: 'rgba(255,255,255,0.05)',
                          backdropFilter: 'blur(10px)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 2,
                          opacity: 0.6,
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <SmartToy sx={{ color: 'rgba(255,255,255,0.6)' }} fontSize="small" />
                          <Typography variant="subtitle2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                            Suno
                          </Typography>
                        </Box>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                          AI music generation
                        </Typography>
                      </Paper>
                    </Grid>

                    {/* ComfyUI Placeholder */}
                    <Grid size={{ xs: 12, md: 4 }}>
                      <Paper 
                        sx={{ 
                          p: 2, 
                          background: 'rgba(255,255,255,0.05)',
                          backdropFilter: 'blur(10px)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 2,
                          opacity: 0.6,
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Computer sx={{ color: 'rgba(255,255,255,0.6)' }} fontSize="small" />
                          <Typography variant="subtitle2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                            ComfyUI
                          </Typography>
                        </Box>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                          Advanced image generation
                        </Typography>
                      </Paper>
                    </Grid>
                  </Grid>
                </Box>
              )}

              {nodes.length === 0 && !scanning && (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Computer sx={{ fontSize: 48, color: 'rgba(255,255,255,0.6)', mb: 2 }} />
                  <Typography variant="h6" sx={{ color: 'white', mb: 1 }} gutterBottom>
                    No AI nodes configured
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)', mb: 2 }}>
                    Scan your network, add a custom node, or configure API keys to get started
                  </Typography>
                  <Button 
                    variant="outlined" 
                    startIcon={<Search />} 
                    onClick={handleScanNetwork}
                    sx={{ 
                      borderColor: 'rgba(255,255,255,0.5)', 
                      color: 'white',
                      '&:hover': { borderColor: 'white', backgroundColor: 'rgba(255,255,255,0.1)' }
                    }}
                  >
                    Scan Network
                  </Button>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Model Configuration Pipeline */}
        <Grid size={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <Speed sx={{ fontSize: 28, color: 'primary.main' }} />
                <Box>
                  <Typography variant="h6">Pipeline Configuration</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Assign models to each step of the story generation pipeline
                  </Typography>
                </Box>
              </Box>

              {/* Quick Assignment Section */}
              <Box sx={{ mb: 4, p: 3, backgroundColor: 'primary.50', borderRadius: 2, border: '1px solid', borderColor: 'primary.main' }}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom sx={{ color: 'primary.main', mb: 2 }}>
                  Quick Assignment
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Apply the same model to all pipeline steps at once
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                  <FormControl sx={{ minWidth: 200 }} size="small">
                    <InputLabel>Select Node</InputLabel>
                    <Select 
                      value={quickAssignNode}
                      onChange={(e) => handleQuickAssignNodeChange(e.target.value)}
                      label="Select Node"
                    >
                      {nodes.filter(n => {
                        if (n.status !== 'online') return false;
                        if (n.category === 'local' && !servicesEnabled.local) return false;
                        if (n.category === 'online' && !servicesEnabled.online) return false;
                        return true;
                      }).map((node) => (
                        <MenuItem key={node.id} value={node.id}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ color: 'primary.main' }}>{getNodeTypeIcon(node.type)}</Box>
                            {node.name}
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl sx={{ minWidth: 200 }} size="small">
                    <InputLabel>Select Model</InputLabel>
                    <Select 
                      value={quickAssignModel}
                      onChange={(e) => setQuickAssignModel(e.target.value)}
                      label="Select Model"
                      disabled={!quickAssignNode}
                    >
                      {quickAssignNode ? (
                        getQuickAssignModels().map((model) => (
                          <MenuItem key={model} value={model}>
                            {model}
                          </MenuItem>
                        ))
                      ) : (
                        <MenuItem value="">
                          <em>Choose a node first</em>
                        </MenuItem>
                      )}
                    </Select>
                  </FormControl>
                  <Button 
                    variant="contained" 
                    disabled={!quickAssignNode || !quickAssignModel}
                    startIcon={<PlayArrow />}
                    onClick={handleQuickAssignment}
                    sx={{ 
                      whiteSpace: 'nowrap',
                      background: 'linear-gradient(45deg, #667eea 30%, #764ba2 90%)',
                      '&:hover': {
                        background: 'linear-gradient(45deg, #5a6fd8 30%, #6a4190 90%)',
                      }
                    }}
                  >
                    Apply to All
                  </Button>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {PIPELINE_STEPS.map((step, index) => (
                  <MultiNodeConfig
                    key={step.key}
                    step={step}
                    configs={modelConfigs}
                    nodes={nodes}
                    onConfigChange={handleMultiNodeConfigChange}
                    stepIndex={index}
                    servicesEnabled={servicesEnabled}
                  />
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* API Configuration */}
        <Grid size={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <SettingsIcon sx={{ fontSize: 28, color: 'primary.main' }} />
                <Box>
                  <Typography variant="h6">API Configuration</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Configure external AI service providers
                  </Typography>
                </Box>
              </Box>

              <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
                    <TextField
                      fullWidth
                      label="OpenAI API Key"
                      type="password"
                      value={apiKeys.openai}
                      onChange={(e) => handleAPIKeyChange('openai', e.target.value)}
                      placeholder="sk-..."
                      helperText="Required for GPT models"
                    />
                    {isAPIServiceMissing('openai') && (
                      <Tooltip title="Re-add deleted OpenAI service">
                        <IconButton
                          onClick={() => handleReAddAPIService('openai')}
                          color="primary"
                          sx={{ mb: 2.5 }}
                        >
                          <Add />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
                    <TextField
                      fullWidth
                      label="Claude API Key"
                      type="password"
                      value={apiKeys.claude}
                      onChange={(e) => handleAPIKeyChange('claude', e.target.value)}
                      placeholder="sk-ant-..."
                      helperText="Required for Claude models"
                    />
                    {isAPIServiceMissing('claude') && (
                      <Tooltip title="Re-add deleted Claude service">
                        <IconButton
                          onClick={() => handleReAddAPIService('claude')}
                          color="primary"
                          sx={{ mb: 2.5 }}
                        >
                          <Add />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* General Settings */}
        <Grid size={12}>
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <SettingsIcon />
                <Typography variant="h6">General Settings</Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>Theme</InputLabel>
                    <Select
                      value={settings.theme}
                      label="Theme"
                      onChange={(e) => updateSettings({ theme: e.target.value as any })}
                    >
                      <MenuItem value="light">Light</MenuItem>
                      <MenuItem value="dark">Dark</MenuItem>
                      <MenuItem value="system">System</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.autoSave}
                        onChange={(e) => updateSettings({ autoSave: e.target.checked })}
                      />
                    }
                    label="Auto-save enabled"
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.notificationsEnabled}
                        onChange={(e) => updateSettings({ notificationsEnabled: e.target.checked })}
                      />
                    }
                    label="Enable notifications"
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Grid>
      </Grid>

      {/* Add Node Dialog */}
      <Dialog open={addNodeDialog} onClose={() => setAddNodeDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Remote Ollama Instance</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Add a remote Ollama instance by IP address. Make sure Ollama is running and accessible on port 11434.
          </Typography>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
            <TextField
              label="Host/IP Address"
              value={newNodeHost}
              onChange={(e) => setNewNodeHost(e.target.value)}
              placeholder="192.168.1.100 or gpu-server.local"
              fullWidth
              helperText="Enter IP address or hostname of the remote machine"
            />
            
            <TextField
              label="Port"
              type="number"
              value={newNodePort}
              onChange={(e) => setNewNodePort(parseInt(e.target.value) || 11434)}
              fullWidth
              helperText="Default Ollama port is 11434"
            />
            
            <Box sx={{ p: 2, bgcolor: 'info.50', borderRadius: 1 }}>
              <Typography variant="caption" fontWeight="bold" color="info.main">
                📝 Common Examples:
              </Typography>
              <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                • 192.168.1.100 (local network IP)
              </Typography>
              <Typography variant="caption" component="div">
                • gpu-server.local (mDNS hostname)
              </Typography>
              <Typography variant="caption" component="div">
                • desktop-ai:11435 (custom port)
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddNodeDialog(false)}>Cancel</Button>
          <Button 
            onClick={handleAddNode} 
            variant="contained"
            disabled={!newNodeHost.trim()}
          >
            Add & Test Connection
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Settings;