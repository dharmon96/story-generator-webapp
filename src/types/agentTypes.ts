/**
 * Agent Types
 *
 * Type definitions for the agent-centric architecture.
 * Agents are machines running our node-agent script that report their capabilities.
 */

/**
 * Agent category - local network or cloud API
 */
export type AgentCategory = 'local' | 'cloud';

/**
 * Video generation method identifiers
 */
export type VideoMethodId =
  | 'holocine'
  | 'wan22'
  | 'hunyuan15'
  | 'sora'
  | 'veo'
  | 'kling'
  | 'nanobanana';

/**
 * Image generation method identifiers (for future use)
 */
export type ImageMethodId =
  | 'flux'
  | 'sdxl'
  | 'sd15'
  | 'dalle3';

/**
 * Workflow availability status on an agent
 */
export interface WorkflowAvailability {
  id: VideoMethodId;
  name: string;
  available: boolean;
  missingModels?: string[];
  models?: Record<string, { name: string; available: boolean }>;
}

/**
 * GPU information from an agent
 */
export interface AgentGpuInfo {
  index: number;
  name: string;
  driverVersion?: string;
  memoryTotalMb: number;
  memoryUsedMb: number;
  memoryFreeMb: number;
  utilizationPercent: number | null;
  memoryUsagePercent: number;
  temperatureC: number | null;
  powerDrawW: number | null;
  powerLimitW: number | null;
}

/**
 * Agent system statistics for monitoring and load balancing
 */
export interface AgentSystemStats {
  cpuPercent: number;
  cpuModel?: string;
  cpuCores?: number;
  memoryPercent: number;
  memoryTotalGb: number;
  memoryAvailableGb: number;
  gpuInfo: AgentGpuInfo[];
  diskUsagePercent?: number;
  uptime?: number;
}

/**
 * Ollama service statistics
 */
export interface OllamaStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  avgResponseTimeMs: number;
  requestsPerMinute: number;
  tokensGenerated: number;
  tokensPerSecondAvg: number;
  lastError?: string;
  lastErrorTime?: string;
}

/**
 * ComfyUI service statistics
 */
export interface ComfyUIStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  avgResponseTimeMs: number;
  requestsPerMinute: number;
  rendersCompleted: number;
  lastError?: string;
  lastErrorTime?: string;
}

/**
 * Agent Ollama capability information
 */
export interface AgentOllamaCapability {
  available: boolean;
  port: number;
  models: string[];
  busy: boolean;
  currentJob?: {
    type: string;
    model: string;
    startedAt: string;
  };
  stats?: OllamaStats;
}

/**
 * Agent ComfyUI capability information
 */
export interface AgentComfyUICapability {
  available: boolean;
  port: number;
  workflows: WorkflowAvailability[];
  busy: boolean;
  currentJob?: {
    type: string;
    workflow?: string;
    startedAt: string;
    promptId?: string;
  };
  stats?: ComfyUIStats;
  modelsInfo?: {
    checkpoints: string[];
    vae: string[];
    clip: string[];
    loras: string[];
    unet: string[];
  };
}

/**
 * Agent Node - represents a machine running our agent software
 */
export interface AgentNode {
  // Identity
  id: string;
  hostname: string;
  displayName: string;
  category: AgentCategory;

  // Network
  ipAddresses: string[];
  agentPort: number;
  agentUrl: string;

  // Status
  status: 'online' | 'offline' | 'busy' | 'checking';
  lastHeartbeat: string;
  lastChecked?: string;

  // Capabilities
  ollama: AgentOllamaCapability | null;
  comfyui: AgentComfyUICapability | null;

  // System stats
  system: AgentSystemStats | null;

  // Platform info
  platform?: string;
  platformVersion?: string;
}

/**
 * Cloud service types
 */
export type CloudServiceType = 'openai' | 'claude' | 'google';

/**
 * Cloud service capabilities
 */
export interface CloudServiceCapabilities {
  chat: boolean;
  vision: boolean;
  video: boolean;
  image: boolean;
}

/**
 * Cloud Service Node - represents configured cloud APIs
 * These appear alongside local agents in the UI
 */
export interface CloudServiceNode {
  id: string;
  type: CloudServiceType;
  displayName: string;
  status: 'online' | 'offline' | 'unconfigured' | 'validating';
  apiKey: string;
  apiKeyMasked: string;
  models: {
    chat: string[];
    vision: string[];
    video: string[];
    image: string[];
  };
  capabilities: CloudServiceCapabilities;
  lastValidated?: string;
  error?: string;
}

/**
 * Pipeline step identifiers
 */
export type PipelineStepId =
  | 'ui_assistant'
  | 'story'
  | 'characters'
  | 'holocine_scenes'
  | 'shots'
  | 'prompts'
  | 'narration'
  | 'music';

/**
 * Pipeline model assignment - assigns a MODEL to each step
 * The system will find any available agent with that model
 */
export interface PipelineModelAssignment {
  stepId: PipelineStepId;
  modelId: string;
  enabled: boolean;
  fallbackModelId?: string;
}

/**
 * Pipeline step metadata for UI display
 */
export interface PipelineStepInfo {
  id: PipelineStepId;
  name: string;
  description: string;
  required: boolean;
  pipelineTypes: ('scene-based' | 'shot-based')[];
  icon: string;
}

/**
 * Video model status - aggregated across all agents
 */
export interface VideoModelStatus {
  id: VideoMethodId;
  name: string;
  description: string;
  enabled: boolean;
  agentCount: number;
  agents: string[];
  icon: string;
  color: string;
  type: 'local' | 'cloud';
  comingSoon?: boolean;
}

/**
 * Image model status (for future use)
 */
export interface ImageModelStatus {
  id: ImageMethodId;
  name: string;
  description: string;
  enabled: boolean;
  agentCount: number;
  icon: string;
  type: 'local' | 'cloud';
  comingSoon?: boolean;
}

/**
 * Default cloud service configurations
 */
export const DEFAULT_CLOUD_SERVICES: CloudServiceNode[] = [
  {
    id: 'cloud_openai',
    type: 'openai',
    displayName: 'OpenAI',
    status: 'unconfigured',
    apiKey: '',
    apiKeyMasked: '',
    models: {
      chat: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      vision: ['gpt-4o', 'gpt-4-turbo'],
      video: ['sora'],
      image: ['dall-e-3', 'dall-e-2']
    },
    capabilities: { chat: true, vision: true, video: true, image: true }
  },
  {
    id: 'cloud_claude',
    type: 'claude',
    displayName: 'Anthropic Claude',
    status: 'unconfigured',
    apiKey: '',
    apiKeyMasked: '',
    models: {
      chat: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'claude-3.5-sonnet'],
      vision: ['claude-3-opus', 'claude-3-sonnet', 'claude-3.5-sonnet'],
      video: [],
      image: []
    },
    capabilities: { chat: true, vision: true, video: false, image: false }
  },
  {
    id: 'cloud_google',
    type: 'google',
    displayName: 'Google AI',
    status: 'unconfigured',
    apiKey: '',
    apiKeyMasked: '',
    models: {
      chat: ['gemini-pro', 'gemini-pro-vision', 'gemini-1.5-pro'],
      vision: ['gemini-pro-vision', 'gemini-1.5-pro'],
      video: ['veo'],
      image: ['imagen-3']
    },
    capabilities: { chat: true, vision: true, video: true, image: true }
  }
];

/**
 * Pipeline step definitions
 */
export const PIPELINE_STEPS: PipelineStepInfo[] = [
  {
    id: 'ui_assistant',
    name: 'UI Assistant',
    description: 'AI helper for the interface',
    required: false,
    pipelineTypes: ['scene-based', 'shot-based'],
    icon: '🤖'
  },
  {
    id: 'story',
    name: 'Story Generation',
    description: 'Create the narrative structure',
    required: true,
    pipelineTypes: ['scene-based', 'shot-based'],
    icon: '📖'
  },
  {
    id: 'characters',
    name: 'Character Development',
    description: 'Define character appearances and traits',
    required: true,
    pipelineTypes: ['scene-based', 'shot-based'],
    icon: '👤'
  },
  {
    id: 'holocine_scenes',
    name: 'HoloCine Scenes',
    description: 'Scene-based shot organization',
    required: true,
    pipelineTypes: ['scene-based'],
    icon: '🎬'
  },
  {
    id: 'shots',
    name: 'Shot Planning',
    description: 'Break story into individual shots',
    required: true,
    pipelineTypes: ['shot-based'],
    icon: '🎯'
  },
  {
    id: 'prompts',
    name: 'Visual Prompts',
    description: 'Generate prompts for video generation',
    required: true,
    pipelineTypes: ['shot-based'],
    icon: '✨'
  },
  {
    id: 'narration',
    name: 'Narration',
    description: 'Generate voice-over narration',
    required: false,
    pipelineTypes: ['scene-based', 'shot-based'],
    icon: '🎙️'
  },
  {
    id: 'music',
    name: 'Music & Audio',
    description: 'Add musical cues and atmosphere',
    required: false,
    pipelineTypes: ['scene-based', 'shot-based'],
    icon: '🎵'
  }
];

/**
 * Video model definitions
 */
export const VIDEO_MODELS: Omit<VideoModelStatus, 'enabled' | 'agentCount' | 'agents'>[] = [
  {
    id: 'holocine',
    name: 'HoloCine',
    description: 'Scene-based multi-shot generation with Wan 2.2 14B',
    icon: '🎬',
    color: '#a55eea',
    type: 'local'
  },
  {
    id: 'wan22',
    name: 'Wan 2.2 14B',
    description: 'Fast text-to-video with LightX2V acceleration',
    icon: '⚡',
    color: '#00d9ff',
    type: 'local'
  },
  {
    id: 'hunyuan15',
    name: 'HunyuanVideo 1.5',
    description: 'High-quality 720p text-to-video generation',
    icon: '🎥',
    color: '#ff6b6b',
    type: 'local'
  },
  {
    id: 'sora',
    name: 'OpenAI Sora',
    description: 'High-quality cinematic video from text',
    icon: '🌟',
    color: '#10a37f',
    type: 'cloud',
    comingSoon: true
  },
  {
    id: 'veo',
    name: 'Google Veo',
    description: 'Gemini-powered video generation',
    icon: '🔮',
    color: '#4285f4',
    type: 'cloud',
    comingSoon: true
  },
  {
    id: 'kling',
    name: 'Kling',
    description: 'Shot-by-shot video generation',
    icon: '🎞️',
    color: '#ff9500',
    type: 'cloud',
    comingSoon: true
  },
  {
    id: 'nanobanana',
    name: 'Nano Banana',
    description: 'Fast API-based video generation',
    icon: '🍌',
    color: '#ffe135',
    type: 'cloud',
    comingSoon: true
  }
];

/**
 * Default pipeline assignments
 */
export const DEFAULT_PIPELINE_ASSIGNMENTS: PipelineModelAssignment[] = [
  { stepId: 'ui_assistant', modelId: '', enabled: false },
  { stepId: 'story', modelId: '', enabled: true },
  { stepId: 'characters', modelId: '', enabled: true },
  { stepId: 'holocine_scenes', modelId: '', enabled: true },
  { stepId: 'shots', modelId: '', enabled: true },
  { stepId: 'prompts', modelId: '', enabled: true },
  { stepId: 'narration', modelId: '', enabled: false },
  { stepId: 'music', modelId: '', enabled: false }
];

/**
 * Helper to mask API key for display
 */
export function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '••••••••';
  return key.slice(0, 4) + '••••••••' + key.slice(-4);
}

/**
 * Helper to determine agent status from its state
 */
export function getAgentStatus(agent: AgentNode): 'online' | 'offline' | 'busy' {
  if (agent.status === 'offline' || agent.status === 'checking') {
    return agent.status === 'checking' ? 'offline' : 'offline';
  }

  const ollamaBusy = agent.ollama?.busy || agent.ollama?.currentJob;
  const comfyuiBusy = agent.comfyui?.busy || agent.comfyui?.currentJob;

  if (ollamaBusy || comfyuiBusy) {
    return 'busy';
  }

  return 'online';
}
