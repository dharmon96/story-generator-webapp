export interface OllamaNode {
  id: string;
  name: string;
  host: string;
  port: number;
  status: 'online' | 'offline' | 'checking';
  models: string[];
  version?: string;
  lastChecked: Date;
  type: 'ollama' | 'openai' | 'claude' | 'elevenlabs' | 'suno' | 'comfyui';
  category: 'local' | 'online';
}

export interface ModelConfig {
  step: string;
  nodeId: string;
  model: string;
  enabled: boolean;
}

class NodeDiscoveryService {
  private nodes: Map<string, OllamaNode> = new Map();
  private commonPorts = [11434, 11435, 11436, 8080, 8000, 3000, 7860, 8188];
  private commonHosts = ['localhost', '127.0.0.1'];
  private apiKeys: { [key: string]: string } = {};

  constructor() {
    // Load API keys from localStorage on initialization
    this.loadAPIKeysFromStorage();
    // Initialize API nodes if keys exist - delayed to ensure methods are available
    setTimeout(async () => {
      await this.initializeAPINodesWithValidation();
    }, 0);
  }

  private loadAPIKeysFromStorage(): void {
    try {
      const storedKeys = localStorage.getItem('story-generator-api-keys');
      if (storedKeys) {
        this.apiKeys = JSON.parse(storedKeys);
      }
    } catch (error) {
      console.warn('Failed to load API keys from localStorage:', error);
      this.apiKeys = {};
    }
  }

  private saveAPIKeysToStorage(): void {
    try {
      localStorage.setItem('story-generator-api-keys', JSON.stringify(this.apiKeys));
    } catch (error) {
      console.warn('Failed to save API keys to localStorage:', error);
    }
  }


  async scanLocalNetwork(): Promise<OllamaNode[]> {
    console.log('🔍 Starting network scan for Ollama nodes...');
    const promises: Promise<OllamaNode | null>[] = [];
    
    // Scan common local addresses
    for (const host of this.commonHosts) {
      for (const port of this.commonPorts) {
        promises.push(this.checkNode(host, port));
      }
    }
    
    // Try common device hostnames (may work with mDNS/DNS resolution)
    const commonHostnames = ['ollama', 'ai', 'gpu', 'server'];
    for (const hostname of commonHostnames) {
      promises.push(this.checkNode(hostname, 11434));
      promises.push(this.checkNode(`${hostname}.local`, 11434));
    }

    // Try common IP ranges (works if no CORS restrictions)
    const networkRanges = [
      '192.168.1.',
      '192.168.0.',
      '10.0.0.',
      '10.0.1.',
    ];
    
    for (const range of networkRanges) {
      // Check a broader range to find remote nodes
      for (let i = 1; i <= 30; i++) {
        promises.push(this.checkNode(`${range}${i}`, 11434));
      }
      // Also check common higher IPs including the .160+ range where your remote is
      [100, 101, 150, 160, 161, 162, 163, 164, 165, 200, 254].forEach(i => {
        promises.push(this.checkNode(`${range}${i}`, 11434));
      });
    }

    // Process in larger batches for faster scanning
    const batchSize = 50;
    const foundNodes: OllamaNode[] = [];
    
    for (let i = 0; i < promises.length; i += batchSize) {
      const batch = promises.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(batch);
      
      batchResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          foundNodes.push(result.value);
        }
      });
      
      // Smaller delay for faster scanning
      if (i + batchSize < promises.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // Show progress
      const progress = Math.round(((i + batchSize) / promises.length) * 100);
      console.log(`🔍 Scanning progress: ${Math.min(progress, 100)}% (${foundNodes.length} found so far)`);
    }
    
    // Enhanced deduplication - merge localhost variants and local network IP
    const deduplicatedNodes = new Map<string, OllamaNode>();
    
    // First, identify local network IP by finding nodes with same models as localhost
    let localhostNode: OllamaNode | null = null;
    let localNetworkIP: string | null = null;
    
    // Find localhost node first
    for (const node of foundNodes) {
      if (node.host === 'localhost' || node.host === '127.0.0.1') {
        localhostNode = node;
        break;
      }
    }
    
    // Only merge if we can detect the actual local machine's network IP
    // We'll be conservative - only merge if we find exactly one 192.168.x.x IP with identical models
    if (localhostNode) {
      const localhostModels = localhostNode.models.sort().join(',');
      const potentialLocalIPs: string[] = [];
      
      // Find all 192.168.x.x IPs with identical models to localhost
      for (const node of foundNodes) {
        if (node.host.startsWith('192.168.') && node.models.sort().join(',') === localhostModels) {
          potentialLocalIPs.push(node.host);
        }
      }
      
      // Only merge if there's exactly one potential match (to avoid false positives)
      if (potentialLocalIPs.length === 1) {
        localNetworkIP = potentialLocalIPs[0];
        console.log(`🔍 Detected local network IP to merge: ${localNetworkIP} (identical models, single match)`);
      } else if (potentialLocalIPs.length > 1) {
        console.log(`⚠️ Found ${potentialLocalIPs.length} IPs with same models as localhost, keeping all to avoid false merging: ${potentialLocalIPs.join(', ')}`);
      }
    }
    
    foundNodes.forEach(node => {
      let key = node.id;
      let finalNode = node;
      
      // Normalize localhost/127.0.0.1 to single localhost entry
      if (node.host === '127.0.0.1') {
        key = `localhost:${node.port}`;
        finalNode = {
          ...node,
          id: key,
          host: 'localhost',
          name: this.generateNodeName('localhost', node.port)
        };
      }
      // Skip local network IP that matches localhost models (it's a duplicate)
      else if (localNetworkIP && node.host === localNetworkIP) {
        console.log(`🔍 Skipping duplicate local IP: ${node.host}:${node.port}`);
        return; // Skip this node entirely
      }
      
      // Keep localhost version if we have both, otherwise keep what we have
      if (!deduplicatedNodes.has(key) || finalNode.host === 'localhost') {
        deduplicatedNodes.set(key, finalNode);
      }
    });
    
    const finalNodes = Array.from(deduplicatedNodes.values());
    
    // Update our nodes map - only update/add local nodes, preserve existing online services
    finalNodes.forEach(node => {
      this.nodes.set(node.id, node);
    });
    
    // Remove any existing local nodes that were not found in this scan
    // (but keep online services)
    const discoveredLocalNodeIds = new Set(finalNodes.map(n => n.id));
    Array.from(this.nodes.entries()).forEach(([nodeId, node]) => {
      if (node.category === 'local' && !discoveredLocalNodeIds.has(nodeId)) {
        // Mark as offline instead of removing completely
        this.nodes.set(nodeId, { ...node, status: 'offline', lastChecked: new Date() });
      }
    });
    
    console.log(`✅ Network scan complete! Found ${foundNodes.length} raw nodes, ${finalNodes.length} after deduplication.`);
    if (finalNodes.length > 0) {
      console.log('🎉 Discovered Ollama instances:');
      finalNodes.forEach(node => {
        console.log(`  🖥️ ${node.name} at ${node.host}:${node.port} - ${node.models.length} models available`);
        if (node.models.length > 0) {
          console.log(`    Models: ${node.models.join(', ')}`);
        }
      });
    } else {
      console.log('⚠️ No Ollama instances found on the network.');
      console.log('💡 To find remote Ollama instances:');
      console.log('  1. Manually add the IP address using the "Add Custom Node" button');
      console.log('  2. Make sure remote Ollama allows CORS: set OLLAMA_ORIGINS=* environment variable');
      console.log('  3. Check firewall settings (allow port 11434)');
      console.log('  4. Browser security prevents automatic network scanning');
    }

    // Return all nodes (both newly discovered local nodes and existing online services)
    return Array.from(this.nodes.values());
  }

  private async checkNode(host: string, port: number): Promise<OllamaNode | null> {
    const id = `${host}:${port}`;
    
    try {
      // Fast connection check with shorter timeout (like Python version)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000); // Reduced to 1s like Python
      
      const response = await fetch(`http://${host}:${port}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        mode: 'cors', // Allow CORS requests
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const models = data.models?.map((m: any) => m.name) || [];
        
        console.log(`✅ Found Ollama at ${host}:${port} with ${models.length} models:`, models);
        
        return {
          id,
          name: this.generateNodeName(host, port),
          host,
          port,
          status: 'online',
          models,
          lastChecked: new Date(),
          type: 'ollama',
          category: 'local',
        };
      } else {
        // Log all non-success responses for debugging
        console.log(`❌ ${host}:${port} responded with ${response.status}: ${response.statusText}`);
      }
    } catch (error: any) {
      // More detailed error logging to debug connection issues
      if (error.name === 'AbortError') {
        console.log(`⏰ ${host}:${port} timeout (>1s)`);
      } else if (error.message?.includes('Failed to fetch')) {
        console.log(`🔒 ${host}:${port} connection blocked (CORS/network)`);
      } else {
        console.log(`🚫 ${host}:${port} error: ${error.message}`);
      }
    }

    return null;
  }

  async refreshNode(nodeId: string): Promise<OllamaNode | null> {
    const existingNode = this.nodes.get(nodeId);
    if (!existingNode) return null;

    const refreshedNode = await this.checkNode(existingNode.host, existingNode.port);
    if (refreshedNode) {
      this.nodes.set(nodeId, refreshedNode);
      return refreshedNode;
    } else {
      // Mark as offline but keep in list
      const offlineNode = {
        ...existingNode,
        status: 'offline' as const,
        lastChecked: new Date(),
      };
      this.nodes.set(nodeId, offlineNode);
      return offlineNode;
    }
  }

  async getModelsForNode(nodeId: string): Promise<string[]> {
    const node = this.nodes.get(nodeId);
    if (!node) return [];

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // Longer timeout for model fetching
      
      console.log(`🔍 Fetching models for ${node.host}:${node.port}...`);
      
      const response = await fetch(`http://${node.host}:${node.port}/api/tags`, {
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        mode: 'cors',
      });
      
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const models = data.models?.map((m: any) => m.name) || [];
        
        console.log(`✅ Retrieved ${models.length} models from ${node.host}:${node.port}:`, models);
        
        // Update node with latest models and status
        this.nodes.set(nodeId, { 
          ...node, 
          models, 
          status: 'online', 
          lastChecked: new Date() 
        });
        return models;
      } else {
        console.log(`❌ Models fetch failed for ${node.host}:${node.port}: ${response.status} ${response.statusText}`);
        // Mark as offline if can't get models
        this.nodes.set(nodeId, { 
          ...node, 
          status: 'offline', 
          lastChecked: new Date() 
        });
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log(`⏰ Models fetch timeout for ${node.host}:${node.port}`);
      } else if (error.message?.includes('Failed to fetch')) {
        console.log(`🔒 Models fetch blocked for ${node.host}:${node.port} (CORS/network)`);
      } else {
        console.log(`🚫 Models fetch error for ${node.host}:${node.port}:`, error.message);
      }
      
      // Mark as offline on error
      this.nodes.set(nodeId, { 
        ...node, 
        status: 'offline', 
        lastChecked: new Date() 
      });
    }
    
    return [];
  }

  private generateNodeName(host: string, port: number): string {
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'Local Ollama';
    }
    return port === 11434 ? `Ollama (${host})` : `Ollama (${host}:${port})`;
  }

  addCustomNode(host: string, port: number = 11434): void {
    const id = `${host}:${port}`;
    const node: OllamaNode = {
      id,
      name: this.generateNodeName(host, port),
      host,
      port,
      status: 'checking',
      models: [],
      lastChecked: new Date(),
      type: 'ollama',
      category: 'local',
    };
    
    this.nodes.set(id, node);
    
    // Check the node in the background
    this.checkNode(host, port).then(checkedNode => {
      if (checkedNode) {
        this.nodes.set(id, checkedNode);
      } else {
        this.nodes.set(id, { ...node, status: 'offline' });
      }
    });
  }

  addAPINode(type: 'openai' | 'claude', apiKey: string): void {
    const id = `api_${type}`;
    this.apiKeys[type] = apiKey;
    
    const models = this.getAPIModels(type);
    const node: OllamaNode = {
      id,
      name: type === 'openai' ? 'OpenAI' : 'Claude (Anthropic)',
      host: type === 'openai' ? 'api.openai.com' : 'api.anthropic.com',
      port: 443,
      status: apiKey ? 'online' : 'offline',
      models,
      lastChecked: new Date(),
      type,
      category: 'online',
    };
    
    this.nodes.set(id, node);
  }

  private async initializeAPINodesWithValidation(): Promise<void> {
    console.log('🔑 Initializing API nodes with validation...');
    console.log('🔑 Available API keys:', Object.keys(this.apiKeys));
    
    // Initialize OpenAI node with validation if key exists
    if (this.apiKeys.openai) {
      console.log('🤖 Validating OpenAI API key...');
      const isValid = await this.validateOpenAIKey(this.apiKeys.openai);
      console.log(`🤖 OpenAI validation result: ${isValid ? 'VALID' : 'INVALID'}`);
      
      this.addAPINode('openai', this.apiKeys.openai);
      // Update status based on validation
      const node = this.nodes.get('api_openai');
      if (node) {
        node.status = isValid ? 'online' : 'offline';
        this.nodes.set('api_openai', node);
        console.log(`🤖 OpenAI node status set to: ${node.status}`);
      }
    } else {
      console.log('🤖 No OpenAI API key found - skipping OpenAI initialization');
    }
    
    // Initialize Claude node with validation if key exists  
    if (this.apiKeys.claude) {
      console.log('🧠 Validating Claude API key...');
      const isValid = await this.validateClaudeKey(this.apiKeys.claude);
      console.log(`🧠 Claude validation result: ${isValid ? 'VALID' : 'INVALID'}`);
      
      this.addAPINode('claude', this.apiKeys.claude);
      // Update status based on validation
      const node = this.nodes.get('api_claude');
      if (node) {
        node.status = isValid ? 'online' : 'offline';
        this.nodes.set('api_claude', node);
        console.log(`🧠 Claude node status set to: ${node.status}`);
      }
    } else {
      console.log('🧠 No Claude API key found - skipping Claude initialization');
    }
    
    console.log('🔑 API node initialization complete');
  }

  private async validateOpenAIKey(apiKey: string): Promise<boolean> {
    try {
      // Use the models endpoint which is free and doesn't consume any credits/tokens
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ OpenAI API key validated successfully - ${data.data?.length || 0} models available`);
        return true;
      } else {
        console.warn(`⚠️ OpenAI API key validation failed: ${response.status} ${response.statusText}`);
        return false;
      }
    } catch (error) {
      console.warn('⚠️ OpenAI API key validation error:', error);
      return false;
    }
  }

  private async validateClaudeKey(apiKey: string): Promise<boolean> {
    try {
      // Try to use the messages endpoint with invalid parameters to test auth without consuming tokens
      // This will return 400 if auth is valid, 401/403 if auth is invalid
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          // Intentionally invalid request to avoid token consumption
          model: '',
          max_tokens: 0,
          messages: [],
        }),
      });

      if (response.status === 400) {
        // 400 means the request format is invalid but auth is valid
        console.log('✅ Claude API key validated successfully');
        return true;
      } else if (response.status === 401 || response.status === 403) {
        console.warn(`⚠️ Claude API key validation failed: Invalid credentials`);
        return false;
      } else if (response.ok) {
        // Shouldn't happen with invalid params, but means auth is valid
        console.log('✅ Claude API key validated successfully');
        return true;
      } else {
        console.warn(`⚠️ Claude API key validation failed: ${response.status} ${response.statusText}`);
        return false;
      }
    } catch (error) {
      console.warn('⚠️ Claude API key validation error:', error);
      return false;
    }
  }


  private getAPIModels(type: 'openai' | 'claude' | 'elevenlabs' | 'suno' | 'comfyui'): string[] {
    if (type === 'openai') {
      return [
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-4-turbo',
        'gpt-4',
        'gpt-3.5-turbo',
        'gpt-3.5-turbo-16k',
      ];
    } else if (type === 'claude') {
      return [
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022', 
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
      ];
    } else if (type === 'elevenlabs') {
      return [
        'eleven_multilingual_v2',
        'eleven_turbo_v2',
        'eleven_monolingual_v1',
        'eleven_multilingual_v1',
      ];
    } else if (type === 'suno') {
      return [
        'chirp-v3-5',
        'chirp-v3-0',
      ];
    } else if (type === 'comfyui') {
      return [
        'flux-schnell',
        'flux-dev',
        'sdxl-turbo',
        'sdxl-base',
        'sd-v1.5',
      ];
    }
    return [];
  }

  updateAPIKey(type: 'openai' | 'claude', apiKey: string): void {
    this.apiKeys[type] = apiKey;
    this.saveAPIKeysToStorage(); // Persist API keys
    
    const node = this.nodes.get(`api_${type}`);
    if (node) {
      node.status = apiKey ? 'online' : 'offline';
      node.lastChecked = new Date();
      this.nodes.set(node.id, node);
    } else {
      this.addAPINode(type, apiKey);
    }
  }

  getAPIKey(type: 'openai' | 'claude'): string {
    return this.apiKeys[type] || '';
  }

  removeNode(nodeId: string): void {
    this.nodes.delete(nodeId);
  }

  getNodes(): OllamaNode[] {
    return Array.from(this.nodes.values());
  }

  getNode(nodeId: string): OllamaNode | undefined {
    return this.nodes.get(nodeId);
  }

}

export const nodeDiscoveryService = new NodeDiscoveryService();