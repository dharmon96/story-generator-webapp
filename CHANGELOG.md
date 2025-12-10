# Changelog

## [2025-12-10] Settings Page Refresh - Agent-Centric Architecture

### Overview
Complete refactoring of the Settings page from a monolithic 1996-line component to a modular, agent-centric architecture. The new design focuses on discovering agent nodes (machines running our node-agent script) rather than raw Ollama/ComfyUI services.

### Key Architecture Changes

1. **Agent-Centric Discovery**
   - Agents report their capabilities via `/api/capabilities` endpoint
   - Quick scan discovers agents on localhost ports 8765-8767
   - Manual IP entry for remote agents
   - Backend can also provide registered agents list

2. **Model-Centric Pipeline Assignment**
   - OLD: Assign specific node+model per pipeline step
   - NEW: Assign MODEL per step, any agent with that model can execute
   - Benefits: Simpler UX, automatic load balancing across agents

3. **Unified Agent Storage**
   - Local agents and cloud services stored in same state
   - Cloud APIs (OpenAI, Claude, Google) appear as "agent nodes" under Cloud Services
   - Video model availability aggregated across all agents

---

### New Files Created

#### Types
- `src/types/agentTypes.ts`
  - `AgentNode` - Local machine running node-agent
  - `CloudServiceNode` - Cloud API configuration
  - `AgentSystemStats`, `AgentGpuInfo` - Hardware monitoring
  - `AgentOllamaCapability`, `AgentComfyUICapability` - Service capabilities
  - `WorkflowAvailability` - ComfyUI workflow status
  - `PipelineModelAssignment` - Model-to-step mapping
  - `VideoModelStatus` - Aggregated video model availability
  - Constants: `DEFAULT_CLOUD_SERVICES`, `PIPELINE_STEPS`, `VIDEO_MODELS`, `DEFAULT_PIPELINE_ASSIGNMENTS`
  - Helpers: `maskApiKey()`, `getAgentStatus()`

#### Store
- `src/store/slices/agentSlice.ts`
  - State: `agents`, `cloudServices`, `pipelineAssignments`, `isScanning`, `lastScanTime`
  - Agent actions: `setAgents`, `addAgent`, `updateAgent`, `removeAgent`, `clearAgents`
  - Cloud actions: `setCloudServices`, `updateCloudService`, `setCloudServiceApiKey`
  - Pipeline actions: `setPipelineAssignments`, `updatePipelineAssignment`, `setAllPipelineModels`
  - Computed getters: `getOnlineAgents`, `getAllAvailableModels`, `getAgentsForModel`, `getVideoModelStatus`, `canExecuteStep`
  - Helper: `apiResponseToAgentNode()` - Converts Python agent API response to TypeScript type

#### Services
- `src/services/agentDiscovery.ts`
  - `quickLocalScan()` - Scan localhost for agents
  - `scanIPs()` - Scan specific IP addresses
  - `fetchRegisteredAgents()` - Get agents from backend
  - `checkAgentEndpoint()` - Check single agent URL
  - `refreshAgent()` - Refresh agent status
  - `validateCloudService()` - Validate OpenAI/Claude/Google API keys
  - `findBestAgentForModel()` - Load balancing helper
  - `findBestAgentForWorkflow()` - ComfyUI workflow load balancing

#### Components - Shared
- `src/components/settings/AgentCard.tsx`
  - Displays agent status, capabilities, system stats
  - Expandable details: Ollama models, ComfyUI workflows, hardware info
  - Actions: Refresh, Remove

- `src/components/settings/CloudServiceCard.tsx`
  - API key input with show/hide toggle
  - Validation button and status indicator
  - Capabilities display when connected

- `src/components/settings/VideoModelCard.tsx`
  - Video model status with enabled/disabled indicator
  - Agent count badge
  - Local vs Cloud type indicator
  - "Coming Soon" support

- `src/components/settings/AgentStatsDisplay.tsx`
  - Compact CPU/RAM/GPU progress bars
  - Temperature and VRAM usage display

#### Components - Sections
- `src/components/settings/AgentDiscoverySection.tsx`
  - Quick Scan button
  - Manual IP entry field
  - Local Agents subsection with AgentCard grid
  - Cloud Services subsection with CloudServiceCard list

- `src/components/settings/PipelineConfigSection.tsx`
  - Pipeline step list with model dropdowns
  - Model availability indicators
  - Enable/disable toggle per step
  - "Apply to All" quick action

- `src/components/settings/VideoModelsSection.tsx`
  - Local models grid (HoloCine, Wan 2.2, Hunyuan 1.5)
  - Cloud models grid (Sora, Veo, Kling, etc.)
  - Enabled count summary

- `src/components/settings/ImageGenerationSection.tsx`
  - Placeholder for future image generation
  - Lists planned models (Flux, SDXL, SD 1.5, DALL-E 3, Imagen 3)

- `src/components/settings/GeneralSettingsSection.tsx`
  - Theme selector (Light/Dark/System)
  - Auto-save toggle
  - Notifications toggle
  - Processing settings (parallel processing, auto-retry)

- `src/components/settings/index.ts`
  - Export barrel for all settings components

---

### Modified Files

#### `src/store/useStore.ts`
- Added imports for agent types
- Extended `StoreState` interface with agent state fields
- Added agent initial state
- Implemented all agent actions and computed getters
- Updated persist `partialize` to include agent state

#### `src/pages/Settings.tsx`
- Refactored from ~1996 lines to ~70 lines
- Now uses modular section components
- Clean grid layout with responsive breakpoints

#### `node-agent/agent.py`
- Added CORS support via `@app.after_request` decorator
- Enables browser requests from React frontend

---

### Video Models Supported

| ID | Name | Type | Status |
|----|------|------|--------|
| holocine | HoloCine | local | Available |
| wan22 | Wan 2.2 14B | local | Available |
| hunyuan15 | HunyuanVideo 1.5 | local | Available |
| sora | OpenAI Sora | cloud | Coming Soon |
| veo | Google Veo | cloud | Coming Soon |
| kling | Kling | cloud | Coming Soon |
| nanobanana | Nano Banana | cloud | Coming Soon |

---

### Pipeline Steps

| ID | Name | Required | Pipeline Types |
|----|------|----------|----------------|
| ui_assistant | UI Assistant | No | All |
| story | Story Generation | Yes | All |
| characters | Character Development | Yes | All |
| holocine_scenes | HoloCine Scenes | Yes | Scene-based |
| shots | Shot Planning | Yes | Shot-based |
| prompts | Visual Prompts | Yes | Shot-based |
| narration | Narration | No | All |
| music | Music & Audio | No | All |

---

### Breaking Changes

- Old Settings.tsx completely replaced
- Previous node pool assignment system replaced with model-centric assignment
- `modelConfigs` in settings may need migration to `pipelineAssignments`

---

### Migration Notes

1. **Existing Settings**: Old `modelConfigs` array in localStorage will be ignored. New `pipelineAssignments` will use defaults.

2. **Agent Discovery**: Previously discovered Ollama/ComfyUI nodes are not automatically migrated. Use Quick Scan to rediscover agents.

3. **API Keys**: Cloud service API keys need to be re-entered in the new Cloud Services section.
