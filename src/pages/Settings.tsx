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
  Movie,
} from '@mui/icons-material';
import { useStore, ModelConfig as StoreModelConfig, ComfyUISettings, ComfyUINodeAssignment } from '../store/useStore';
import { nodeDiscoveryService, OllamaNode } from '../services/nodeDiscovery';
import MultiNodeConfig from '../components/MultiNodeConfig';
import ComfyUIRenderConfig, { RENDER_STEPS } from '../components/ComfyUIRenderConfig';
import { PREDEFINED_WORKFLOWS, modelMatchesRequirement } from '../types/comfyuiTypes';

// Pipeline step type definition
interface PipelineStep {
  key: string;
  label: string;
  description: string;
  pipeline: 'all' | 'scene-based' | 'shot-based';
  badge?: string;
  optional?: boolean;
}

// Pipeline steps - some are shared, some are pipeline-specific
const PIPELINE_STEPS: PipelineStep[] = [
  // Shared steps (all pipelines)
  { key: 'story', label: 'Story Generation', description: 'Main story creation and plot development', pipeline: 'all' },
  { key: 'characters', label: 'Character Development', description: 'Character descriptions and visual style', pipeline: 'all' },

  // Scene-based pipeline (HoloCine)
  { key: 'holocine_scenes', label: 'HoloCine Scenes', description: 'Multi-shot scene creation with character refs', pipeline: 'scene-based', badge: 'HoloCine' },

  // Shot-based pipeline (Wan/Kling)
  { key: 'shots', label: 'Shot Planning', description: 'Visual scene breakdown and shot composition', pipeline: 'shot-based', badge: 'Wan/Kling' },
  { key: 'prompts', label: 'ComfyUI Prompts', description: 'AI image generation prompt creation', pipeline: 'shot-based', badge: 'Wan/Kling' },

  // Optional steps (all pipelines)
  { key: 'narration', label: 'Narration', description: 'Voice-over script and timing', pipeline: 'all', optional: true },
  { key: 'music', label: 'Music & Audio', description: 'Background music and sound effects', pipeline: 'all', optional: true },

  // Render step (final step, uses ComfyUI)
  { key: 'comfyui_render', label: 'Video Rendering', description: 'Render to video using ComfyUI', pipeline: 'all', optional: true, badge: 'ComfyUI' },
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
  const [addComfyUIDialog, setAddComfyUIDialog] = useState(false);
  const [newNodeHost, setNewNodeHost] = useState('');
  const [newNodePort, setNewNodePort] = useState(11434);
  const [newComfyUIHost, setNewComfyUIHost] = useState('localhost');
  const [newComfyUIPort, setNewComfyUIPort] = useState(8188);
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

  // ComfyUI workflow configuration state
  const [comfyUISettings, setComfyUISettings] = useState<ComfyUISettings>(
    settings.comfyUISettings || {
      nodeAssignments: [],
      defaultWorkflow: 'holocine',
      modelMappings: {},
      autoValidateModels: true,
      defaultNegativePrompt: 'blurry, low quality, distorted, deformed, bad anatomy, watermark, text, logo',
      maxConcurrentRenders: 1,
      autoRetryFailed: true,
      retryAttempts: 2
    }
  );

  // Enabled workflow types for the render step
  const [enabledWorkflows, setEnabledWorkflows] = useState<{
    holocine: boolean;
    wan22: boolean;
    hunyuan15: boolean;
    cogvideox: boolean;
  }>({
    holocine: true,
    wan22: false,
    hunyuan15: false,
    cogvideox: false
  });

  // Validation status for each workflow type
  const [workflowValidationStatus, setWorkflowValidationStatus] = useState<Record<string, {
    isValid: boolean;
    missingModels: string[];
    availableModels: string[];
  }>>({});

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

    // Auto-scan if no nodes found - use quick scan for faster startup
    if (existingNodes.length === 0) {
      handleScanNetwork(false); // Quick scan on initial load
    }

    // Initialize API nodes if they have keys
    if (apiKeys.openai && !existingNodes.find(n => n.id === 'api_openai')) {
      nodeDiscoveryService.addAPINode('openai', apiKeys.openai);
    }
    if (apiKeys.claude && !existingNodes.find(n => n.id === 'api_claude')) {
      nodeDiscoveryService.addAPINode('claude', apiKeys.claude);
    }
  };

  const handleScanNetwork = async (fullScan: boolean = true) => {
    setScanning(true);
    try {
      console.log(fullScan ? '🔍 Starting full network scan...' : '⚡ Starting quick scan...');
      const foundNodes = await nodeDiscoveryService.scanLocalNetwork(fullScan);
      
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

      // Report ComfyUI detection status
      const comfyNodes = allNodes.filter(n =>
        n.type === 'comfyui' || (n.type === 'unified' && n.capabilities?.comfyui)
      );
      if (comfyNodes.length > 0) {
        console.log(`🎬 Found ${comfyNodes.length} ComfyUI-capable node(s):`);
        comfyNodes.forEach(node => {
          const port = node.comfyUIPort || node.port;
          const status = node.type === 'unified' ? node.comfyuiStatus : node.status;
          console.log(`  🖥️ ${node.name} (${node.host}:${port}) - Status: ${status}`);
          if (node.comfyUIData) {
            console.log(`     📦 Checkpoints: ${node.comfyUIData.checkpoints?.length || 0}, Video Models: ${node.comfyUIData.unets?.length || 0}`);
          }
        });
      } else {
        console.warn('⚠️ No ComfyUI nodes detected. Make sure ComfyUI is running (default port: 8188).');
        console.warn('   Tip: You can manually add a ComfyUI node using the "Add Node" button.');
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

        // Auto-detect if ComfyUI is also running on this host
        // Use addUnifiedNode to check for both services automatically
        const result = await nodeDiscoveryService.addUnifiedNode(host);

        setAddNodeDialog(false);
        setNewNodeHost('');
        setNewNodePort(11434);
        loadNodes();

        // Show success message with detected capabilities
        if (result?.capabilities?.comfyui) {
          alert(`✅ Successfully added ${host}\n\n🎯 Auto-detected both services!\n• Ollama: ${models.length} models\n• ComfyUI: Also available\n\nCreated unified AI + Render node.`);
        } else {
          alert(`✅ Successfully added ${host}:${newNodePort}\nFound ${models.length} models: ${models.join(', ')}`);
        }
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

  const handleAddComfyUI = async () => {
    const host = newComfyUIHost.trim();
    if (!host) return;

    console.log(`🎨 Testing connection to ComfyUI at ${host}:${newComfyUIPort}...`);

    try {
      // First check if ComfyUI is reachable on the specified port
      const comfyResult = await nodeDiscoveryService.addComfyUINode(host, newComfyUIPort);

      if (comfyResult && comfyResult.status === 'online') {
        console.log(`✅ Successfully connected to ComfyUI at ${host}:${newComfyUIPort}`);

        // Auto-detect if Ollama is also running on this host
        // Use addUnifiedNode to check for both services automatically
        const unifiedResult = await nodeDiscoveryService.addUnifiedNode(host);

        setAddComfyUIDialog(false);
        setNewComfyUIHost('localhost');
        setNewComfyUIPort(8188);
        setNodes(nodeDiscoveryService.getNodes());

        // Show success message with detected capabilities
        if (unifiedResult?.capabilities?.ollama) {
          alert(`✅ Successfully added ${host}\n\n🎯 Auto-detected both services!\n• ComfyUI: ${comfyResult.models.length} models/nodes\n• Ollama: Also available\n\nCreated unified AI + Render node.`);
        } else {
          alert(`✅ Successfully added ComfyUI at ${host}:${newComfyUIPort}\nFound ${comfyResult.models.length} models/nodes`);
        }
      } else {
        alert(`❌ Could not connect to ComfyUI!\n\nPlease check:\n- ComfyUI is running on ${host}:${newComfyUIPort}\n- Firewall allows connections\n- IP address is correct`);
      }
    } catch (error: any) {
      console.error(`❌ ComfyUI connection error:`, error);
      alert(`❌ Connection failed!\n\nError: ${error.message}\n\nPlease check:\n- ComfyUI is running on ${host}:${newComfyUIPort}\n- Firewall settings\n- Network configuration`);
    }
  };

  const handleRefreshUnifiedNode = async (nodeId: string) => {
    const refreshedNode = await nodeDiscoveryService.refreshUnifiedNode(nodeId);
    if (refreshedNode) {
      setNodes(prev => prev.map(n => n.id === nodeId ? refreshedNode : n));
    }
  };

  // Validate all workflow types against available ComfyUI models
  const validateAllWorkflows = () => {
    // Find a ComfyUI-capable node to check models
    const comfyNode = nodes.find(n =>
      (n.type === 'comfyui' && n.status === 'online') ||
      (n.type === 'unified' && n.capabilities?.comfyui && n.comfyuiStatus === 'online')
    );

    if (!comfyNode?.comfyUIData) {
      setWorkflowValidationStatus({});
      return;
    }

    const availableModels: string[] = [
      ...comfyNode.comfyUIData.checkpoints,
      ...comfyNode.comfyUIData.vaes,
      ...comfyNode.comfyUIData.clipModels,
      ...comfyNode.comfyUIData.unets,
      ...comfyNode.comfyUIData.loras
    ];

    const validation: Record<string, { isValid: boolean; missingModels: string[]; availableModels: string[] }> = {};

    for (const workflow of PREDEFINED_WORKFLOWS.filter(w => w.available)) {
      const missingModels: string[] = [];

      for (const req of workflow.requiredModels) {
        if (req.required) {
          const found = availableModels.some(m => modelMatchesRequirement(m, req));
          if (!found) {
            missingModels.push(`${req.name} (${req.defaultModel || 'required'})`);
          }
        }
      }

      validation[workflow.type] = {
        isValid: missingModels.length === 0,
        missingModels,
        availableModels
      };
    }

    setWorkflowValidationStatus(validation);
  };

  // Run workflow validation when nodes change
  useEffect(() => {
    if (nodes.length > 0) {
      validateAllWorkflows();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  // Handle workflow type toggle
  const handleWorkflowToggle = (type: 'holocine' | 'wan22' | 'hunyuan15' | 'cogvideox') => {
    setEnabledWorkflows(prev => ({
      ...prev,
      [type]: !prev[type]
    }));
  };

  // Handle ComfyUI render step assignment changes (multi-node support)
  const handleRenderStepAssignmentChange = (stepKey: string, newAssignments: ComfyUINodeAssignment[]) => {
    setComfyUISettings(prev => {
      // Remove all existing assignments for this step
      const otherAssignments = prev.nodeAssignments.filter(a => a.stepId !== stepKey);
      // Add the new assignments
      return {
        ...prev,
        nodeAssignments: [...otherAssignments, ...newAssignments]
      };
    });
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
    // Save model configurations, processing settings, and ComfyUI settings
    updateSettings({
      modelConfigs: modelConfigs,
      processingEnabled: nodes.some(n => n.status === 'online'),
      parallelProcessing: 3,
      autoRetry: true,
      retryAttempts: 3,
      comfyUISettings: comfyUISettings,
    });

    console.log('Saved model configurations:', modelConfigs);
    console.log('Saved ComfyUI settings:', comfyUISettings);
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

  const getNodeTypeIcon = (type: 'ollama' | 'openai' | 'claude' | 'elevenlabs' | 'suno' | 'comfyui' | 'unified') => {
    switch (type) {
      case 'ollama': return <Computer />;
      case 'openai': return <SmartToy />;
      case 'claude': return <Cloud />;
      case 'elevenlabs': return <SmartToy />;
      case 'suno': return <SmartToy />;
      case 'comfyui': return <Computer />;
      case 'unified': return <Speed />; // Unified nodes use Speed icon to indicate dual capabilities
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
                  <Tooltip title="Quick Scan (localhost + known hosts)">
                    <IconButton
                      onClick={() => handleScanNetwork(false)}
                      disabled={scanning}
                      sx={{
                        backgroundColor: 'rgba(76, 175, 80, 0.3)',
                        color: 'white',
                        '&:hover': { backgroundColor: 'rgba(76, 175, 80, 0.5)' },
                        '&:disabled': { backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }
                      }}
                    >
                      {scanning ? <CircularProgress size={20} color="inherit" /> : <Speed />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Full Network Scan (slower, scans IP ranges)">
                    <IconButton
                      onClick={() => handleScanNetwork(true)}
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
                  <Tooltip title="Add Ollama Node">
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
                  <Tooltip title="Add ComfyUI Node">
                    <IconButton
                      onClick={() => setAddComfyUIDialog(true)}
                      sx={{
                        backgroundColor: 'rgba(156, 39, 176, 0.3)',
                        color: 'white',
                        '&:hover': { backgroundColor: 'rgba(156, 39, 176, 0.5)' }
                      }}
                    >
                      <Movie />
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

              {/* Unified Nodes Section (AI + Rendering) */}
              {(() => {
                const unifiedNodes = nodes.filter(n => n.type === 'unified');
                if (unifiedNodes.length === 0) return null;
                return (
                  <Box sx={{ mb: 4 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                      <Speed sx={{ color: 'rgba(76, 175, 80, 0.9)' }} />
                      <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
                        Unified Nodes (AI + Rendering)
                      </Typography>
                      <Chip
                        size="small"
                        label={`${unifiedNodes.length}`}
                        sx={{
                          backgroundColor: 'rgba(76, 175, 80, 0.3)',
                          color: 'white',
                          border: '1px solid rgba(76, 175, 80, 0.5)',
                        }}
                        variant="outlined"
                      />
                      <Chip
                        size="small"
                        label="Ollama + ComfyUI"
                        sx={{
                          backgroundColor: 'rgba(76, 175, 80, 0.2)',
                          color: 'white',
                          border: '1px solid rgba(76, 175, 80, 0.4)',
                        }}
                        variant="outlined"
                      />
                    </Box>
                    <Grid container spacing={2}>
                      {unifiedNodes.map((node) => (
                        <Grid size={{ xs: 12, md: 6 }} key={node.id}>
                          <Fade in timeout={300}>
                            <Paper
                              sx={{
                                p: 2,
                                background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.15) 0%, rgba(33, 150, 243, 0.15) 100%)',
                                backdropFilter: 'blur(10px)',
                                border: '1px solid rgba(76, 175, 80, 0.3)',
                                borderRadius: 2,
                                '&:hover': {
                                  background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.25) 0%, rgba(33, 150, 243, 0.25) 100%)',
                                  transform: 'translateY(-1px)',
                                },
                                transition: 'all 0.2s',
                              }}
                            >
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <Box sx={{ flex: 1 }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                    <Box sx={{ color: '#4caf50' }}><Speed /></Box>
                                    {getStatusIcon(node.status)}
                                    <Typography variant="subtitle1" fontWeight="bold" sx={{ color: 'white' }}>
                                      {node.name}
                                    </Typography>
                                  </Box>
                                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }} gutterBottom>
                                    {node.host}
                                  </Typography>
                                  {/* Capability Status */}
                                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                                    <Chip
                                      size="small"
                                      icon={<Computer sx={{ fontSize: 14, color: 'inherit !important' }} />}
                                      label={`Ollama: ${node.ollamaStatus || 'unknown'}`}
                                      sx={{
                                        height: 22,
                                        fontSize: '0.7rem',
                                        backgroundColor: node.ollamaStatus === 'online' ? 'rgba(76, 175, 80, 0.3)' :
                                          node.ollamaStatus === 'busy' ? 'rgba(255, 152, 0, 0.3)' : 'rgba(244, 67, 54, 0.3)',
                                        color: 'white',
                                        border: `1px solid ${node.ollamaStatus === 'online' ? 'rgba(76, 175, 80, 0.6)' :
                                          node.ollamaStatus === 'busy' ? 'rgba(255, 152, 0, 0.6)' : 'rgba(244, 67, 54, 0.6)'}`,
                                      }}
                                    />
                                    <Chip
                                      size="small"
                                      icon={<Computer sx={{ fontSize: 14, color: 'inherit !important' }} />}
                                      label={`ComfyUI: ${node.comfyuiStatus || 'unknown'}`}
                                      sx={{
                                        height: 22,
                                        fontSize: '0.7rem',
                                        backgroundColor: node.comfyuiStatus === 'online' ? 'rgba(156, 39, 176, 0.3)' :
                                          node.comfyuiStatus === 'busy' ? 'rgba(255, 152, 0, 0.3)' : 'rgba(244, 67, 54, 0.3)',
                                        color: 'white',
                                        border: `1px solid ${node.comfyuiStatus === 'online' ? 'rgba(156, 39, 176, 0.6)' :
                                          node.comfyuiStatus === 'busy' ? 'rgba(255, 152, 0, 0.6)' : 'rgba(244, 67, 54, 0.6)'}`,
                                      }}
                                    />
                                  </Box>
                                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                                    <Chip
                                      size="small"
                                      label={`${node.models.filter(m => !m.startsWith('[')).length} AI models`}
                                      sx={{
                                        backgroundColor: 'rgba(255,255,255,0.2)',
                                        color: 'white',
                                        border: '1px solid rgba(255,255,255,0.3)',
                                      }}
                                      variant="outlined"
                                    />
                                    {node.ollamaPort && (
                                      <Chip
                                        size="small"
                                        label={`:${node.ollamaPort}`}
                                        sx={{
                                          height: 18,
                                          fontSize: '0.65rem',
                                          backgroundColor: 'rgba(76, 175, 80, 0.2)',
                                          color: 'white',
                                        }}
                                      />
                                    )}
                                    {node.comfyUIPort && (
                                      <Chip
                                        size="small"
                                        label={`:${node.comfyUIPort}`}
                                        sx={{
                                          height: 18,
                                          fontSize: '0.65rem',
                                          backgroundColor: 'rgba(156, 39, 176, 0.2)',
                                          color: 'white',
                                        }}
                                      />
                                    )}
                                  </Box>
                                </Box>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                  <Tooltip title="Refresh Both Services">
                                    <IconButton
                                      size="small"
                                      onClick={() => handleRefreshUnifiedNode(node.id)}
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
                  </Box>
                );
              })()}

              {/* ComfyUI Workflow Configuration Section - Always shown */}
              <Box sx={{ mb: 4 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <SettingsIcon sx={{ color: 'rgba(255,255,255,0.9)' }} />
                  <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
                    ComfyUI Workflow Configuration
                  </Typography>
                  <Chip
                    size="small"
                    label="Video Rendering"
                    sx={{
                      backgroundColor: 'rgba(156, 39, 176, 0.3)',
                      color: 'white',
                      border: '1px solid rgba(156, 39, 176, 0.5)',
                    }}
                    variant="outlined"
                  />
                  {nodes.filter(n => n.type === 'comfyui' || (n.type === 'unified' && n.capabilities?.comfyui)).length === 0 && (
                    <Chip
                      size="small"
                      icon={<Error sx={{ fontSize: 14 }} />}
                      label="No ComfyUI Nodes Found"
                      sx={{
                        backgroundColor: 'rgba(255, 152, 0, 0.3)',
                        color: 'white',
                        border: '1px solid rgba(255, 152, 0, 0.5)',
                      }}
                      variant="outlined"
                    />
                  )}
                </Box>

                <Paper
                  sx={{
                    p: 3,
                    background: 'rgba(255,255,255,0.1)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 2,
                  }}
                >
                  {/* Warning when no ComfyUI nodes detected */}
                  {nodes.filter(n => n.type === 'comfyui' || (n.type === 'unified' && n.capabilities?.comfyui)).length === 0 && (
                    <Alert
                      severity="warning"
                      sx={{
                        mb: 3,
                        backgroundColor: 'rgba(255, 152, 0, 0.1)',
                        border: '1px solid rgba(255, 152, 0, 0.3)',
                        '& .MuiAlert-icon': { color: 'rgba(255, 152, 0, 0.9)' },
                        '& .MuiAlert-message': { color: 'white' }
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                        No ComfyUI instances detected
                      </Typography>
                      <Typography variant="caption" sx={{ display: 'block' }}>
                        Make sure ComfyUI is running (usually on port 8188) and click "Scan Network" to detect it.
                        You can also add a node manually using the "Add Node" button above.
                      </Typography>
                    </Alert>
                  )}
                    {/* Enabled Workflow Types */}
                    <Typography variant="subtitle1" sx={{ color: 'white', mb: 2, fontWeight: 'bold' }}>
                      Enabled Video Workflows
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mb: 2 }}>
                      Select which video generation workflows to enable. Models will be validated against your ComfyUI installation.
                    </Typography>

                    <Grid container spacing={2} sx={{ mb: 4 }}>
                      {/* HoloCine Workflow */}
                      <Grid size={{ xs: 12, md: 3 }}>
                        <Paper
                          sx={{
                            p: 2,
                            background: enabledWorkflows.holocine ? 'rgba(156, 39, 176, 0.2)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${enabledWorkflows.holocine ? 'rgba(156, 39, 176, 0.5)' : 'rgba(255,255,255,0.1)'}`,
                            borderRadius: 2,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            '&:hover': { background: 'rgba(156, 39, 176, 0.15)' }
                          }}
                          onClick={() => handleWorkflowToggle('holocine')}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                            <Typography variant="subtitle2" sx={{ color: 'white', fontWeight: 'bold' }}>
                              HoloCine
                            </Typography>
                            <Switch
                              checked={enabledWorkflows.holocine}
                              onChange={() => handleWorkflowToggle('holocine')}
                              size="small"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </Box>
                          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', display: 'block', mb: 1 }}>
                            Multi-shot scene generation with character consistency
                          </Typography>
                          {workflowValidationStatus.holocine && (
                            <Chip
                              size="small"
                              icon={workflowValidationStatus.holocine.isValid ? <CheckCircle sx={{ fontSize: 14 }} /> : <Error sx={{ fontSize: 14 }} />}
                              label={workflowValidationStatus.holocine.isValid ? 'Models Ready' : 'Missing Models'}
                              color={workflowValidationStatus.holocine.isValid ? 'success' : 'warning'}
                              sx={{ height: 20, fontSize: '0.65rem' }}
                            />
                          )}
                          {!workflowValidationStatus.holocine && (
                            <Chip size="small" label="Not Validated" sx={{ height: 20, fontSize: '0.65rem' }} />
                          )}
                        </Paper>
                      </Grid>

                      {/* Wan 2.2 Workflow */}
                      <Grid size={{ xs: 12, md: 3 }}>
                        <Paper
                          sx={{
                            p: 2,
                            background: enabledWorkflows.wan22 ? 'rgba(33, 150, 243, 0.2)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${enabledWorkflows.wan22 ? 'rgba(33, 150, 243, 0.5)' : 'rgba(255,255,255,0.1)'}`,
                            borderRadius: 2,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            '&:hover': { background: 'rgba(33, 150, 243, 0.15)' }
                          }}
                          onClick={() => handleWorkflowToggle('wan22')}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                            <Typography variant="subtitle2" sx={{ color: 'white', fontWeight: 'bold' }}>
                              Wan 2.2
                            </Typography>
                            <Switch
                              checked={enabledWorkflows.wan22}
                              onChange={() => handleWorkflowToggle('wan22')}
                              size="small"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </Box>
                          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', display: 'block', mb: 1 }}>
                            Single-shot video generation
                          </Typography>
                          {workflowValidationStatus.wan22 && (
                            <Chip
                              size="small"
                              icon={workflowValidationStatus.wan22.isValid ? <CheckCircle sx={{ fontSize: 14 }} /> : <Error sx={{ fontSize: 14 }} />}
                              label={workflowValidationStatus.wan22.isValid ? 'Models Ready' : 'Missing Models'}
                              color={workflowValidationStatus.wan22.isValid ? 'success' : 'warning'}
                              sx={{ height: 20, fontSize: '0.65rem' }}
                            />
                          )}
                          {!workflowValidationStatus.wan22 && (
                            <Chip size="small" label="Not Validated" sx={{ height: 20, fontSize: '0.65rem' }} />
                          )}
                        </Paper>
                      </Grid>

                      {/* Hunyuan 1.5 Workflow */}
                      <Grid size={{ xs: 12, md: 3 }}>
                        <Paper
                          sx={{
                            p: 2,
                            background: enabledWorkflows.hunyuan15 ? 'rgba(255, 152, 0, 0.2)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${enabledWorkflows.hunyuan15 ? 'rgba(255, 152, 0, 0.5)' : 'rgba(255,255,255,0.1)'}`,
                            borderRadius: 2,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            '&:hover': { background: 'rgba(255, 152, 0, 0.15)' }
                          }}
                          onClick={() => handleWorkflowToggle('hunyuan15')}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                            <Typography variant="subtitle2" sx={{ color: 'white', fontWeight: 'bold' }}>
                              Hunyuan 1.5
                            </Typography>
                            <Switch
                              checked={enabledWorkflows.hunyuan15}
                              onChange={() => handleWorkflowToggle('hunyuan15')}
                              size="small"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </Box>
                          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', display: 'block', mb: 1 }}>
                            Tencent 720p video generation
                          </Typography>
                          {workflowValidationStatus.hunyuan15 && (
                            <Chip
                              size="small"
                              icon={workflowValidationStatus.hunyuan15.isValid ? <CheckCircle sx={{ fontSize: 14 }} /> : <Error sx={{ fontSize: 14 }} />}
                              label={workflowValidationStatus.hunyuan15.isValid ? 'Models Ready' : 'Missing Models'}
                              color={workflowValidationStatus.hunyuan15.isValid ? 'success' : 'warning'}
                              sx={{ height: 20, fontSize: '0.65rem' }}
                            />
                          )}
                          {!workflowValidationStatus.hunyuan15 && (
                            <Chip size="small" label="Not Validated" sx={{ height: 20, fontSize: '0.65rem' }} />
                          )}
                        </Paper>
                      </Grid>

                      {/* CogVideoX Workflow */}
                      <Grid size={{ xs: 12, md: 3 }}>
                        <Paper
                          sx={{
                            p: 2,
                            background: enabledWorkflows.cogvideox ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${enabledWorkflows.cogvideox ? 'rgba(76, 175, 80, 0.5)' : 'rgba(255,255,255,0.1)'}`,
                            borderRadius: 2,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            opacity: 0.6,
                            '&:hover': { background: 'rgba(76, 175, 80, 0.15)' }
                          }}
                          onClick={() => handleWorkflowToggle('cogvideox')}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                            <Typography variant="subtitle2" sx={{ color: 'white', fontWeight: 'bold' }}>
                              CogVideoX
                            </Typography>
                            <Switch
                              checked={enabledWorkflows.cogvideox}
                              onChange={() => handleWorkflowToggle('cogvideox')}
                              size="small"
                              onClick={(e) => e.stopPropagation()}
                              disabled
                            />
                          </Box>
                          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', display: 'block', mb: 1 }}>
                            Text-to-video (Coming Soon)
                          </Typography>
                          <Chip size="small" label="Coming Soon" sx={{ height: 20, fontSize: '0.65rem' }} />
                        </Paper>
                      </Grid>
                    </Grid>

                    {/* Render Step Assignments - Multi-node support */}
                    <Typography variant="subtitle1" sx={{ color: 'white', mb: 2, fontWeight: 'bold' }}>
                      Render Step Assignments
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mb: 3 }}>
                      Assign multiple ComfyUI nodes to each rendering step for load balancing.
                      Jobs will be distributed across enabled nodes.
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {RENDER_STEPS.map((step, index) => (
                        <ComfyUIRenderConfig
                          key={step.key}
                          step={step}
                          assignments={comfyUISettings.nodeAssignments}
                          nodes={nodes}
                          onAssignmentChange={handleRenderStepAssignmentChange}
                          stepIndex={index}
                        />
                      ))}
                    </Box>

                    {/* General Settings */}
                    <Box sx={{ mt: 3, pt: 3, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                      <Typography variant="subtitle2" sx={{ color: 'white', mb: 2 }}>
                        General Settings
                      </Typography>

                      <Grid container spacing={2}>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Default Negative Prompt"
                            value={comfyUISettings.defaultNegativePrompt}
                            onChange={(e) => setComfyUISettings(prev => ({ ...prev, defaultNegativePrompt: e.target.value }))}
                            multiline
                            rows={2}
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                color: 'white',
                                '& fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
                                '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.5)' },
                              },
                              '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.7)' },
                            }}
                          />
                        </Grid>

                        <Grid size={{ xs: 12, md: 3 }}>
                          <TextField
                            fullWidth
                            size="small"
                            type="number"
                            label="Max Concurrent Renders"
                            value={comfyUISettings.maxConcurrentRenders}
                            onChange={(e) => setComfyUISettings(prev => ({ ...prev, maxConcurrentRenders: parseInt(e.target.value) || 1 }))}
                            inputProps={{ min: 1, max: 4 }}
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                color: 'white',
                                '& fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
                                '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.5)' },
                              },
                              '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.7)' },
                            }}
                          />
                        </Grid>

                        <Grid size={{ xs: 12, md: 3 }}>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={comfyUISettings.autoValidateModels}
                                onChange={(e) => setComfyUISettings(prev => ({ ...prev, autoValidateModels: e.target.checked }))}
                                sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#9c27b0' } }}
                              />
                            }
                            label={<Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.9)' }}>Auto-validate Models</Typography>}
                          />
                        </Grid>
                      </Grid>
                    </Box>

                    {/* Available Models Info */}
                    {(() => {
                      const assignedNode = comfyUISettings.nodeAssignments.find(a => a.stepId === 'holocine_render');
                      const comfyNode = assignedNode ? nodes.find(n => n.id === assignedNode.nodeId) : null;

                      if (comfyNode?.comfyUIData) {
                        return (
                          <Box sx={{ mt: 3, pt: 3, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                            <Typography variant="subtitle2" sx={{ color: 'white', mb: 2 }}>
                              Available Models on {comfyNode.name}
                            </Typography>
                            <Grid container spacing={2}>
                              {comfyNode.comfyUIData.checkpoints.length > 0 && (
                                <Grid size={{ xs: 12, md: 4 }}>
                                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', mb: 1 }}>
                                    Checkpoints ({comfyNode.comfyUIData.checkpoints.length})
                                  </Typography>
                                  <Box sx={{ maxHeight: 100, overflow: 'auto' }}>
                                    {comfyNode.comfyUIData.checkpoints.slice(0, 5).map(m => (
                                      <Chip key={m} label={m} size="small" sx={{ m: 0.25, fontSize: '0.65rem', height: 20, backgroundColor: 'rgba(255,255,255,0.1)', color: 'white' }} />
                                    ))}
                                    {comfyNode.comfyUIData.checkpoints.length > 5 && (
                                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', mt: 0.5 }}>
                                        +{comfyNode.comfyUIData.checkpoints.length - 5} more
                                      </Typography>
                                    )}
                                  </Box>
                                </Grid>
                              )}
                              {comfyNode.comfyUIData.unets.length > 0 && (
                                <Grid size={{ xs: 12, md: 4 }}>
                                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', mb: 1 }}>
                                    Video/UNET Models ({comfyNode.comfyUIData.unets.length})
                                  </Typography>
                                  <Box sx={{ maxHeight: 100, overflow: 'auto' }}>
                                    {comfyNode.comfyUIData.unets.slice(0, 5).map(m => (
                                      <Chip key={m} label={m} size="small" sx={{ m: 0.25, fontSize: '0.65rem', height: 20, backgroundColor: 'rgba(156, 39, 176, 0.2)', color: 'white' }} />
                                    ))}
                                    {comfyNode.comfyUIData.unets.length > 5 && (
                                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', mt: 0.5 }}>
                                        +{comfyNode.comfyUIData.unets.length - 5} more
                                      </Typography>
                                    )}
                                  </Box>
                                </Grid>
                              )}
                              {comfyNode.comfyUIData.vaes.length > 0 && (
                                <Grid size={{ xs: 12, md: 4 }}>
                                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', mb: 1 }}>
                                    VAE Models ({comfyNode.comfyUIData.vaes.length})
                                  </Typography>
                                  <Box sx={{ maxHeight: 100, overflow: 'auto' }}>
                                    {comfyNode.comfyUIData.vaes.slice(0, 5).map(m => (
                                      <Chip key={m} label={m} size="small" sx={{ m: 0.25, fontSize: '0.65rem', height: 20, backgroundColor: 'rgba(255,255,255,0.1)', color: 'white' }} />
                                    ))}
                                  </Box>
                                </Grid>
                              )}
                            </Grid>
                          </Box>
                        );
                      }
                      return null;
                    })()}
                  </Paper>
                </Box>

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
                    <Grid size={{ xs: 12, md: 6 }}>
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
                    <Grid size={{ xs: 12, md: 6 }}>
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
                    onClick={() => handleScanNetwork(true)}
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

              {/* Pipeline Legend */}
              <Box sx={{ mb: 3, p: 2, backgroundColor: 'grey.50', borderRadius: 2, border: '1px solid', borderColor: 'grey.200' }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Pipeline Step Types:
                </Typography>
                <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                      size="small"
                      label="HoloCine"
                      sx={{
                        height: 20,
                        fontSize: '0.7rem',
                        fontWeight: 'bold',
                        backgroundColor: 'rgba(156, 39, 176, 0.15)',
                        color: '#9c27b0',
                        border: '1px solid rgba(156, 39, 176, 0.4)',
                      }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      Scene-based generation (multi-shot scenes)
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                      size="small"
                      label="Wan/Kling"
                      sx={{
                        height: 20,
                        fontSize: '0.7rem',
                        fontWeight: 'bold',
                        backgroundColor: 'rgba(33, 150, 243, 0.15)',
                        color: '#2196f3',
                        border: '1px solid rgba(33, 150, 243, 0.4)',
                      }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      Shot-based generation (individual shots)
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                    <Typography variant="caption" color="text.secondary">
                      Can be skipped based on story settings
                    </Typography>
                  </Box>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {PIPELINE_STEPS
                  .filter(step => step.key !== 'comfyui_render') // ComfyUI render uses dedicated workflow config above
                  .map((step, index) => (
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

      {/* Add ComfyUI Dialog */}
      <Dialog open={addComfyUIDialog} onClose={() => setAddComfyUIDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Computer color="primary" />
            Add ComfyUI Instance
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Add a ComfyUI instance for video generation (Wan 2.2, Hunyuan 1.5, HoloCine). Make sure ComfyUI is running and accessible.
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
            <TextField
              label="Host/IP Address"
              value={newComfyUIHost}
              onChange={(e) => setNewComfyUIHost(e.target.value)}
              placeholder="localhost or 192.168.1.100"
              fullWidth
              helperText="Enter IP address or hostname of the ComfyUI machine"
            />

            <TextField
              label="Port"
              type="number"
              value={newComfyUIPort}
              onChange={(e) => setNewComfyUIPort(parseInt(e.target.value) || 8188)}
              fullWidth
              helperText="Default ComfyUI port is 8188"
            />

            <Box sx={{ p: 2, bgcolor: 'primary.50', borderRadius: 1 }}>
              <Typography variant="caption" fontWeight="bold" color="primary.main">
                🎬 Video Generation Requirements:
              </Typography>
              <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                • For <strong>HoloCine</strong>: Install kijai/ComfyUI-WanVideoWrapper with HoloCine support
              </Typography>
              <Typography variant="caption" component="div">
                • For <strong>Wan 2.2</strong>: Install WanVideoWrapper nodes
              </Typography>
              <Typography variant="caption" component="div">
                • Ensure CORS is enabled if accessing from a different machine
              </Typography>
            </Box>

            <Box sx={{ p: 2, bgcolor: 'info.50', borderRadius: 1 }}>
              <Typography variant="caption" fontWeight="bold" color="info.main">
                📝 Common Examples:
              </Typography>
              <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                • localhost:8188 (local ComfyUI)
              </Typography>
              <Typography variant="caption" component="div">
                • 192.168.1.100:8188 (network ComfyUI)
              </Typography>
              <Typography variant="caption" component="div">
                • gpu-server.local:8188 (mDNS hostname)
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddComfyUIDialog(false)}>Cancel</Button>
          <Button
            onClick={handleAddComfyUI}
            variant="contained"
            disabled={!newComfyUIHost.trim()}
            sx={{
              background: 'linear-gradient(45deg, #9c27b0 30%, #673ab7 90%)',
              '&:hover': {
                background: 'linear-gradient(45deg, #7b1fa2 30%, #512da8 90%)',
              }
            }}
          >
            Add & Test Connection
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Settings;