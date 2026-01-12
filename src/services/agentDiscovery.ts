/**
 * Agent Discovery Service
 *
 * Simplified discovery service focused on agent nodes only.
 * Agents report their capabilities via heartbeat or direct query.
 */

import { AgentNode, CloudServiceType } from '../types/agentTypes';
import { apiResponseToAgentNode } from '../store/slices/agentSlice';
import { debugService } from './debugService';

/**
 * Default ports to scan for agents
 */
const DEFAULT_AGENT_PORTS = [8765, 8766, 8767];

/**
 * Timeout for agent requests in milliseconds
 */
const AGENT_TIMEOUT = 5000;

/**
 * Timeout for backend API requests in milliseconds
 */
const BACKEND_TIMEOUT = 10000;

/**
 * Agent Discovery Service
 */
class AgentDiscoveryService {
  private abortController: AbortController | null = null;

  /**
   * Quick scan for localhost agent (development mode)
   */
  async quickLocalScan(): Promise<AgentNode[]> {
    const agents: AgentNode[] = [];
    const localhost = '127.0.0.1';

    debugService.info('agentDiscovery', 'Starting quick local scan...');

    for (const port of DEFAULT_AGENT_PORTS) {
      try {
        const agent = await this.checkAgentEndpoint(localhost, port);
        if (agent) {
          agents.push(agent);
          debugService.info('agentDiscovery', `Found local agent at port ${port}`);
        }
      } catch {
        // Silently continue if port doesn't respond
      }
    }

    debugService.info('agentDiscovery', `Quick local scan complete. Found ${agents.length} agent(s)`);
    return agents;
  }

  /**
   * Scan specific IP addresses for agents
   */
  async scanIPs(ips: string[]): Promise<AgentNode[]> {
    const agents: AgentNode[] = [];
    this.abortController = new AbortController();

    debugService.info('agentDiscovery', `Scanning ${ips.length} IP(s) for agents...`);

    const promises = ips.flatMap((ip) =>
      DEFAULT_AGENT_PORTS.map((port) =>
        this.checkAgentEndpoint(ip, port, this.abortController!.signal)
          .then((agent) => {
            if (agent) agents.push(agent);
          })
          .catch(() => {
            // Silently ignore failed checks
          })
      )
    );

    await Promise.allSettled(promises);

    debugService.info('agentDiscovery', `Scan complete. Found ${agents.length} agent(s)`);
    return agents;
  }

  /**
   * Fetch registered agents from backend
   * Only returns online agents - offline agents are filtered out
   */
  async fetchRegisteredAgents(backendUrl: string): Promise<AgentNode[]> {
    try {
      debugService.info('agentDiscovery', `Fetching registered agents from backend at ${backendUrl}...`);

      const response = await fetch(`${backendUrl}/api/nodes`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(BACKEND_TIMEOUT)
      });

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }

      const data = await response.json();
      const nodes = data.nodes || data || [];

      // Convert all nodes to AgentNode format
      const allAgents = nodes.map((node: any) => {
        // Construct agent URL from ip_addresses and agent_port
        const ip = node.ip_addresses?.[0] || '127.0.0.1';
        const port = node.agent_port || 8765;
        const agentUrl = node.agent_url || `http://${ip}:${port}`;
        return apiResponseToAgentNode(node, agentUrl);
      });

      // Filter out offline agents - if heartbeat times out, agent should disappear
      const onlineAgents = allAgents.filter(
        (agent: AgentNode) => agent.status === 'online' || agent.status === 'busy'
      );

      debugService.info('agentDiscovery',
        `Fetched ${allAgents.length} total agent(s), ${onlineAgents.length} online`);
      return onlineAgents;
    } catch (error) {
      debugService.warn('agentDiscovery', 'Failed to fetch registered agents', error);
      return [];
    }
  }

  /**
   * Check a specific agent endpoint
   */
  async checkAgentEndpoint(
    ip: string,
    port: number,
    signal?: AbortSignal
  ): Promise<AgentNode | null> {
    const url = `http://${ip}:${port}`;

    try {
      const response = await fetch(`${url}/api/capabilities`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: signal || AbortSignal.timeout(AGENT_TIMEOUT)
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return apiResponseToAgentNode(data, url);
    } catch {
      return null;
    }
  }

  /**
   * Refresh a single agent's status
   */
  async refreshAgent(agent: AgentNode): Promise<AgentNode | null> {
    try {
      const response = await fetch(`${agent.agentUrl}/api/capabilities`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(AGENT_TIMEOUT)
      });

      if (!response.ok) {
        return { ...agent, status: 'offline' };
      }

      const data = await response.json();
      return apiResponseToAgentNode(data, agent.agentUrl);
    } catch {
      return { ...agent, status: 'offline' };
    }
  }

  /**
   * Validate a cloud service API key
   */
  async validateCloudService(
    type: CloudServiceType,
    apiKey: string
  ): Promise<{ valid: boolean; models?: string[]; error?: string }> {
    if (!apiKey) {
      return { valid: false, error: 'No API key provided' };
    }

    try {
      switch (type) {
        case 'openai':
          return await this.validateOpenAI(apiKey);
        case 'claude':
          return await this.validateClaude(apiKey);
        case 'google':
          return await this.validateGoogle(apiKey);
        default:
          return { valid: false, error: 'Unknown service type' };
      }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Validation failed'
      };
    }
  }

  /**
   * Validate OpenAI API key
   */
  private async validateOpenAI(apiKey: string): Promise<{ valid: boolean; models?: string[]; error?: string }> {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (response.status === 401) {
        return { valid: false, error: 'Invalid API key' };
      }

      if (!response.ok) {
        return { valid: false, error: `API error: ${response.status}` };
      }

      const data = await response.json();
      const models = data.data
        ?.filter((m: any) => m.id.startsWith('gpt-'))
        .map((m: any) => m.id) || [];

      return { valid: true, models };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  /**
   * Validate Anthropic Claude API key
   */
  private async validateClaude(apiKey: string): Promise<{ valid: boolean; models?: string[]; error?: string }> {
    try {
      // Claude doesn't have a list models endpoint, so we'll try a minimal completion
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }]
        }),
        signal: AbortSignal.timeout(15000)
      });

      if (response.status === 401) {
        return { valid: false, error: 'Invalid API key' };
      }

      // Even if we get rate limited, the key is valid
      if (response.ok || response.status === 429) {
        return {
          valid: true,
          models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307', 'claude-3-5-sonnet-20241022']
        };
      }

      return { valid: false, error: `API error: ${response.status}` };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  /**
   * Validate Google AI API key
   */
  private async validateGoogle(apiKey: string): Promise<{ valid: boolean; models?: string[]; error?: string }> {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10000)
        }
      );

      if (response.status === 400 || response.status === 401) {
        return { valid: false, error: 'Invalid API key' };
      }

      if (!response.ok) {
        return { valid: false, error: `API error: ${response.status}` };
      }

      const data = await response.json();
      const models = data.models
        ?.filter((m: any) => m.name.includes('gemini'))
        .map((m: any) => m.name.split('/').pop()) || [];

      return { valid: true, models };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  /**
   * Cancel any ongoing scans
   */
  cancelScan(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Get quick load balance info from an agent
   */
  async getAgentLoadInfo(agentUrl: string): Promise<{
    canHandle: boolean;
    queuePosition?: number;
    estimatedWaitMs?: number;
  } | null> {
    try {
      const response = await fetch(`${agentUrl}/api/load-balance-info`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(2000)
      });

      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * Find the best available agent for a given model
   */
  async findBestAgentForModel(
    agents: AgentNode[],
    modelId: string
  ): Promise<AgentNode | null> {
    // Filter agents that have the model and are online
    const eligibleAgents = agents.filter(
      (agent) =>
        agent.status === 'online' &&
        agent.ollama?.available &&
        agent.ollama.models.includes(modelId)
    );

    if (eligibleAgents.length === 0) {
      return null;
    }

    // For a single agent, return it immediately
    if (eligibleAgents.length === 1) {
      return eligibleAgents[0];
    }

    // Check load balance info for each agent
    const loadInfos = await Promise.all(
      eligibleAgents.map(async (agent) => {
        const loadInfo = await this.getAgentLoadInfo(agent.agentUrl);
        return { agent, loadInfo };
      })
    );

    // Sort by availability and estimated wait time
    const sorted = loadInfos
      .filter((info) => info.loadInfo?.canHandle !== false)
      .sort((a, b) => {
        const waitA = a.loadInfo?.estimatedWaitMs ?? 0;
        const waitB = b.loadInfo?.estimatedWaitMs ?? 0;
        return waitA - waitB;
      });

    return sorted[0]?.agent || eligibleAgents[0];
  }

  /**
   * Find the best available agent for a given ComfyUI workflow
   */
  async findBestAgentForWorkflow(
    agents: AgentNode[],
    workflowId: string
  ): Promise<AgentNode | null> {
    // Filter agents that have the workflow and are online
    const eligibleAgents = agents.filter(
      (agent) =>
        agent.status === 'online' &&
        agent.comfyui?.available &&
        agent.comfyui.workflows.some((w) => w.id === workflowId && w.available)
    );

    if (eligibleAgents.length === 0) {
      return null;
    }

    // For a single agent, return it immediately
    if (eligibleAgents.length === 1) {
      return eligibleAgents[0];
    }

    // Check load balance info for each agent
    const loadInfos = await Promise.all(
      eligibleAgents.map(async (agent) => {
        const loadInfo = await this.getAgentLoadInfo(agent.agentUrl);
        return { agent, loadInfo };
      })
    );

    // Sort by availability and estimated wait time
    const sorted = loadInfos
      .filter((info) => info.loadInfo?.canHandle !== false)
      .sort((a, b) => {
        const waitA = a.loadInfo?.estimatedWaitMs ?? 0;
        const waitB = b.loadInfo?.estimatedWaitMs ?? 0;
        return waitA - waitB;
      });

    return sorted[0]?.agent || eligibleAgents[0];
  }
}

// Export singleton instance
export const agentDiscoveryService = new AgentDiscoveryService();

// Export class for testing
export { AgentDiscoveryService };
