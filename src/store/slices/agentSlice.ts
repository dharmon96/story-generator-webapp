/**
 * Agent Store Slice
 *
 * Manages all agent-related state including:
 * - Local agent nodes (machines running our agent script)
 * - Cloud service configurations (OpenAI, Claude, Google)
 * - Pipeline model assignments
 * - Scanning state
 */

import { StateCreator } from 'zustand';
import {
  AgentNode,
  CloudServiceNode,
  PipelineModelAssignment,
  VideoModelStatus,
  DEFAULT_CLOUD_SERVICES,
  DEFAULT_PIPELINE_ASSIGNMENTS,
  VIDEO_MODELS,
  maskApiKey,
  VideoMethodId
} from '../../types/agentTypes';

/**
 * Maps backend workflow IDs (from agent heartbeat) to frontend video model IDs
 * Backend uses descriptive IDs like "hunyuan_video_1.5_720p_t2v"
 * Frontend uses short IDs like "hunyuan15" for VIDEO_MODELS
 */
const WORKFLOW_ID_MAP: Record<string, string> = {
  'hunyuan_video_1.5_720p_t2v': 'hunyuan15',
  'wan2.2_14B_t2v': 'wan22',
  'holocine': 'holocine'
};

/**
 * Convert backend workflow ID to frontend video model ID
 */
const mapWorkflowId = (backendId: string): string => {
  return WORKFLOW_ID_MAP[backendId] || backendId;
};

/**
 * Agent slice state and actions
 */
export interface AgentSlice {
  // State
  agents: AgentNode[];
  cloudServices: CloudServiceNode[];
  pipelineAssignments: PipelineModelAssignment[];
  isScanning: boolean;
  lastScanTime: string | null;
  // Map of agentId -> set of disabled model names
  // Models not in this map (or set to false) are enabled
  disabledModels: Record<string, string[]>;

  // Agent actions
  setAgents: (agents: AgentNode[]) => void;
  addAgent: (agent: AgentNode) => void;
  updateAgent: (id: string, updates: Partial<AgentNode>) => void;
  removeAgent: (id: string) => void;
  clearAgents: () => void;

  // Cloud service actions
  setCloudServices: (services: CloudServiceNode[]) => void;
  updateCloudService: (id: string, updates: Partial<CloudServiceNode>) => void;
  setCloudServiceApiKey: (id: string, apiKey: string) => void;

  // Pipeline assignment actions
  setPipelineAssignments: (assignments: PipelineModelAssignment[]) => void;
  updatePipelineAssignment: (stepId: string, updates: Partial<PipelineModelAssignment>) => void;
  setAllPipelineModels: (modelId: string) => void;

  // Scanning actions
  setScanning: (isScanning: boolean) => void;
  setLastScanTime: (time: string | null) => void;

  // Model filtering actions
  toggleModelEnabled: (agentId: string, modelName: string) => void;
  setModelEnabled: (agentId: string, modelName: string, enabled: boolean) => void;
  isModelEnabled: (agentId: string, modelName: string) => boolean;
  getEnabledModelsForAgent: (agentId: string) => string[];

  // Computed getters
  getOnlineAgents: () => AgentNode[];
  getLocalAgents: () => AgentNode[];
  getAllAvailableModels: () => string[];
  getAgentsForModel: (modelId: string) => AgentNode[];
  getVideoModelStatus: () => VideoModelStatus[];
  getConfiguredCloudServices: () => CloudServiceNode[];
  canExecuteStep: (stepId: string) => boolean;
}

/**
 * Create the agent slice
 */
export const createAgentSlice: StateCreator<AgentSlice, [], [], AgentSlice> = (set, get) => ({
  // Initial state
  agents: [],
  cloudServices: DEFAULT_CLOUD_SERVICES,
  pipelineAssignments: DEFAULT_PIPELINE_ASSIGNMENTS,
  isScanning: false,
  lastScanTime: null,
  disabledModels: {},

  // Agent actions
  setAgents: (agents) => set({ agents }),

  addAgent: (agent) =>
    set((state) => {
      // Check if agent already exists
      const exists = state.agents.find((a) => a.id === agent.id);
      if (exists) {
        // Update existing agent
        return {
          agents: state.agents.map((a) => (a.id === agent.id ? { ...a, ...agent } : a))
        };
      }
      return { agents: [...state.agents, agent] };
    }),

  updateAgent: (id, updates) =>
    set((state) => ({
      agents: state.agents.map((agent) =>
        agent.id === id ? { ...agent, ...updates } : agent
      )
    })),

  removeAgent: (id) =>
    set((state) => ({
      agents: state.agents.filter((agent) => agent.id !== id)
    })),

  clearAgents: () => set({ agents: [] }),

  // Cloud service actions
  setCloudServices: (services) => set({ cloudServices: services }),

  updateCloudService: (id, updates) =>
    set((state) => ({
      cloudServices: state.cloudServices.map((service) =>
        service.id === id ? { ...service, ...updates } : service
      )
    })),

  setCloudServiceApiKey: (id, apiKey) =>
    set((state) => ({
      cloudServices: state.cloudServices.map((service) =>
        service.id === id
          ? {
              ...service,
              apiKey,
              apiKeyMasked: maskApiKey(apiKey),
              status: apiKey ? 'validating' : 'unconfigured'
            }
          : service
      )
    })),

  // Pipeline assignment actions
  setPipelineAssignments: (assignments) => set({ pipelineAssignments: assignments }),

  updatePipelineAssignment: (stepId, updates) =>
    set((state) => ({
      pipelineAssignments: state.pipelineAssignments.map((assignment) =>
        assignment.stepId === stepId ? { ...assignment, ...updates } : assignment
      )
    })),

  setAllPipelineModels: (modelId) =>
    set((state) => ({
      pipelineAssignments: state.pipelineAssignments.map((assignment) => ({
        ...assignment,
        modelId
      }))
    })),

  // Scanning actions
  setScanning: (isScanning) => set({ isScanning }),

  setLastScanTime: (time) => set({ lastScanTime: time }),

  // Model filtering actions
  toggleModelEnabled: (agentId, modelName) =>
    set((state) => {
      const currentDisabled = state.disabledModels[agentId] || [];
      const isCurrentlyDisabled = currentDisabled.includes(modelName);

      if (isCurrentlyDisabled) {
        // Enable it (remove from disabled list)
        return {
          disabledModels: {
            ...state.disabledModels,
            [agentId]: currentDisabled.filter((m) => m !== modelName)
          }
        };
      } else {
        // Disable it (add to disabled list)
        return {
          disabledModels: {
            ...state.disabledModels,
            [agentId]: [...currentDisabled, modelName]
          }
        };
      }
    }),

  setModelEnabled: (agentId, modelName, enabled) =>
    set((state) => {
      const currentDisabled = state.disabledModels[agentId] || [];
      const isCurrentlyDisabled = currentDisabled.includes(modelName);

      if (enabled && isCurrentlyDisabled) {
        // Enable it (remove from disabled list)
        return {
          disabledModels: {
            ...state.disabledModels,
            [agentId]: currentDisabled.filter((m) => m !== modelName)
          }
        };
      } else if (!enabled && !isCurrentlyDisabled) {
        // Disable it (add to disabled list)
        return {
          disabledModels: {
            ...state.disabledModels,
            [agentId]: [...currentDisabled, modelName]
          }
        };
      }
      return state;
    }),

  isModelEnabled: (agentId, modelName) => {
    const { disabledModels } = get();
    const disabled = disabledModels[agentId] || [];
    return !disabled.includes(modelName);
  },

  getEnabledModelsForAgent: (agentId) => {
    const { agents } = get();
    const agent = agents.find((a) => a.id === agentId);
    if (!agent || !agent.ollama?.models) return [];

    // Agent already filters models on its side - the models list only contains enabled models
    return agent.ollama.models;
  },

  // Computed getters
  getOnlineAgents: () => {
    const { agents } = get();
    return agents.filter((agent) => agent.status === 'online' || agent.status === 'busy');
  },

  getLocalAgents: () => {
    const { agents } = get();
    return agents.filter((agent) => agent.category === 'local');
  },

  getAllAvailableModels: () => {
    const { agents, cloudServices } = get();
    const models = new Set<string>();

    // Collect models from online/busy local agents
    // Note: Agent already filters models on its side - we trust the agent's models list
    agents.forEach((agent) => {
      if (
        agent.ollama?.available &&
        agent.ollama.models &&
        (agent.status === 'online' || agent.status === 'busy')
      ) {
        agent.ollama.models.forEach((model) => models.add(model));
      }
    });

    // Collect models from configured cloud services
    cloudServices.forEach((service) => {
      if (service.status === 'online') {
        service.models.chat.forEach((model) => models.add(`${service.type}:${model}`));
      }
    });

    return Array.from(models).sort();
  },

  getAgentsForModel: (modelId) => {
    const { agents } = get();

    // Check if it's a cloud model (format: "provider:model")
    // But Ollama models like "llama3.1:latest" also have colons, so check against known providers
    const CLOUD_PROVIDERS = ['openai', 'claude', 'google'];
    const [potentialProvider] = modelId.split(':');
    if (CLOUD_PROVIDERS.includes(potentialProvider)) {
      return []; // Cloud models don't have local agents
    }

    // Debug: Log what models each agent has
    console.log(`[getAgentsForModel] Looking for model: "${modelId}"`);
    agents.forEach((agent) => {
      console.log(`  Agent ${agent.hostname} (${agent.id.slice(0, 8)}): status=${agent.status}, ollama.available=${agent.ollama?.available}, models=`, agent.ollama?.models);
    });

    // Agent already filters models on its side - we trust the agent's models list
    const result = agents.filter(
      (agent) =>
        agent.ollama?.available &&
        agent.ollama.models.includes(modelId) &&
        (agent.status === 'online' || agent.status === 'busy')
    );

    console.log(`[getAgentsForModel] Found ${result.length} agents with model "${modelId}"`);
    return result;
  },

  getVideoModelStatus: () => {
    const { agents, cloudServices } = get();

    return VIDEO_MODELS.map((model) => {
      let enabled = false;
      let agentCount = 0;
      const agentIds: string[] = [];

      if (model.type === 'local') {
        // Check local agents for this workflow
        agents.forEach((agent) => {
          if (agent.comfyui?.available && agent.comfyui.workflows) {
            const workflow = agent.comfyui.workflows.find((w) => w.id === model.id);
            if (workflow?.available) {
              enabled = true;
              agentCount++;
              agentIds.push(agent.id);
            }
          }
        });
      } else {
        // Check cloud services
        const serviceMap: Record<VideoMethodId, string> = {
          sora: 'openai',
          veo: 'google',
          kling: 'nanobanana',
          nanobanana: 'nanobanana',
          holocine: '',
          wan22: '',
          hunyuan15: ''
        };

        const serviceType = serviceMap[model.id];
        if (serviceType) {
          const service = cloudServices.find((s) => s.type === serviceType);
          if (service?.status === 'online' && service.capabilities.video) {
            enabled = true;
            agentCount = 1;
            agentIds.push(service.id);
          }
        }
      }

      return {
        ...model,
        enabled,
        agentCount,
        agents: agentIds
      };
    });
  },

  getConfiguredCloudServices: () => {
    const { cloudServices } = get();
    return cloudServices.filter((service) => service.status === 'online');
  },

  canExecuteStep: (stepId) => {
    const { pipelineAssignments, agents, cloudServices } = get();
    const assignment = pipelineAssignments.find((a) => a.stepId === stepId);

    if (!assignment || !assignment.enabled || !assignment.modelId) {
      return false;
    }

    const modelId = assignment.modelId;

    // Check if it's a cloud model
    if (modelId.includes(':')) {
      const [provider] = modelId.split(':');
      const service = cloudServices.find((s) => s.type === provider);
      return service?.status === 'online';
    }

    // Check local agents (online or busy agents can execute)
    const availableAgents = agents.filter(
      (agent) =>
        agent.ollama?.available &&
        agent.ollama.models.includes(modelId) &&
        (agent.status === 'online' || agent.status === 'busy')
    );

    return availableAgents.length > 0;
  }
});

/**
 * Helper to convert agent data from API response to AgentNode
 */
export function apiResponseToAgentNode(data: any, agentUrl: string): AgentNode {
  // Determine if agent is busy (has active job on either service)
  const ollamaBusy = !!data.ollama?.current_job;
  const comfyuiBusy = !!data.comfyui?.current_job;
  const isBusy = ollamaBusy || comfyuiBusy;

  // Use backend status if provided, otherwise determine from service availability and job status
  const hasServices = data.ollama?.available || data.comfyui?.available;
  let status = data.status || (hasServices ? 'online' : 'offline');

  // Override to 'busy' if there's an active job
  if (status === 'online' && isBusy) {
    status = 'busy';
  }

  return {
    id: data.node_id || data.id,
    hostname: data.hostname || 'Unknown',
    displayName: data.hostname || data.node_id?.slice(0, 8) || 'Agent',
    category: 'local',
    ipAddresses: data.ip_addresses || [],
    agentPort: data.agent_port || 8765,
    agentUrl,
    status: status as 'online' | 'offline' | 'busy' | 'checking',
    lastHeartbeat: data.last_heartbeat || data.timestamp || new Date().toISOString(),
    lastChecked: new Date().toISOString(),
    ollama: data.ollama?.available
      ? {
          available: true,
          port: data.ollama.port || 11434,
          models: data.ollama.models || [],
          busy: !!data.ollama.current_job,
          currentJob: data.ollama.current_job
            ? {
                type: data.ollama.current_job.type,
                model: data.ollama.current_job.model,
                startedAt: data.ollama.current_job.started_at
              }
            : undefined,
          stats: data.stats?.ollama
            ? {
                totalRequests: data.stats.ollama.total_requests || 0,
                successfulRequests: data.stats.ollama.successful_requests || 0,
                failedRequests: data.stats.ollama.failed_requests || 0,
                successRate: data.stats.ollama.success_rate || 100,
                avgResponseTimeMs: data.stats.ollama.avg_response_time_ms || 0,
                requestsPerMinute: data.stats.ollama.requests_per_minute || 0,
                tokensGenerated: data.stats.ollama.tokens_generated || 0,
                tokensPerSecondAvg: data.stats.ollama.tokens_per_second_avg || 0
              }
            : undefined
        }
      : null,
    comfyui: data.comfyui?.available
      ? {
          available: true,
          port: data.comfyui.port || 8000,
          workflows: (data.workflows?.supported || []).map((id: string) => ({
            id: mapWorkflowId(id),  // Map backend workflow ID to frontend video model ID
            name: id,
            available: (data.workflows?.ready || []).includes(id)  // Check if all models are ready
          })),
          busy: !!data.comfyui.current_job,
          currentJob: data.comfyui.current_job
            ? {
                type: data.comfyui.current_job.type,
                workflow: data.comfyui.current_job.workflow,
                startedAt: data.comfyui.current_job.started_at,
                promptId: data.comfyui.current_job.prompt_id
              }
            : undefined,
          stats: data.stats?.comfyui
            ? {
                totalRequests: data.stats.comfyui.total_requests || 0,
                successfulRequests: data.stats.comfyui.successful_requests || 0,
                failedRequests: data.stats.comfyui.failed_requests || 0,
                successRate: data.stats.comfyui.success_rate || 100,
                avgResponseTimeMs: data.stats.comfyui.avg_response_time_ms || 0,
                requestsPerMinute: data.stats.comfyui.requests_per_minute || 0,
                rendersCompleted: data.stats.comfyui.renders_completed || 0
              }
            : undefined,
          modelsInfo: data.comfyui.models_info
        }
      : null,
    system: data.hardware
      ? {
          cpuPercent: data.hardware.cpu?.usage_percent || 0,
          cpuModel: data.hardware.cpu?.model,
          cpuCores: data.hardware.cpu?.logical_cores,
          memoryPercent: data.hardware.memory?.usage_percent || 0,
          memoryTotalGb: data.hardware.memory?.total_gb || 0,
          memoryAvailableGb: data.hardware.memory?.available_gb || 0,
          gpuInfo:
            data.hardware.gpu?.map((gpu: any) => ({
              index: gpu.index || 0,
              name: gpu.name || 'Unknown GPU',
              driverVersion: gpu.driver_version,
              memoryTotalMb: gpu.memory_total_mb || 0,
              memoryUsedMb: gpu.memory_used_mb || 0,
              memoryFreeMb: gpu.memory_free_mb || 0,
              utilizationPercent: gpu.utilization_gpu_percent,
              memoryUsagePercent: gpu.memory_usage_percent || 0,
              temperatureC: gpu.temperature_c,
              powerDrawW: gpu.power_draw_w,
              powerLimitW: gpu.power_limit_w
            })) || [],
          diskUsagePercent: data.hardware.disk?.usage_percent
        }
      : null,
    platform: data.system?.platform,
    platformVersion: data.system?.platform_version
  };
}
