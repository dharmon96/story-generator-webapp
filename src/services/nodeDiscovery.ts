export interface OllamaNode {
  id: string;
  name: string;
  host: string;
  port: number;
  status: 'online' | 'offline' | 'checking';
  models: string[];
  version?: string;
  lastChecked: Date;
  type: 'ollama' | 'openai' | 'claude' | 'elevenlabs' | 'suno' | 'comfyui' | 'unified';
  category: 'local' | 'online';

  // Dual capability support - for unified nodes that run both Ollama and ComfyUI
  capabilities?: {
    ollama: boolean;
    comfyui: boolean;
  };

  // Port per capability (for unified nodes)
  ollamaPort?: number;   // Default: 11434
  comfyUIPort?: number;  // Default: 8188

  // Independent status per capability
  ollamaStatus?: 'online' | 'offline' | 'busy';
  comfyuiStatus?: 'online' | 'offline' | 'busy';

  // ComfyUI-specific fields
  comfyUIData?: {
    checkpoints: string[];
    vaes: string[];
    loras: string[];
    clipModels: string[];
    unets: string[];
    customNodes: string[];
    embeddings: string[];
  };
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
    console.log('🔍 Starting network scan for Ollama and ComfyUI nodes...');
    const promises: Promise<OllamaNode | null>[] = [];

    // Common ComfyUI ports (in addition to default 8188)
    const comfyUIPorts = [8188, 8000, 8080, 7860];

    // Scan common local addresses for Ollama AND ComfyUI (localhost only gets full port scan)
    for (const host of this.commonHosts) {
      for (const port of this.commonPorts) {
        promises.push(this.checkNode(host, port));
      }
      // Scan for standalone ComfyUI on common ports - ONLY for localhost
      for (const port of comfyUIPorts) {
        promises.push(this.checkStandaloneComfyUI(host, port));
      }
    }

    // Try common device hostnames (may work with mDNS/DNS resolution)
    const commonHostnames = ['ollama', 'ai', 'gpu', 'server', 'comfyui', 'render'];
    for (const hostname of commonHostnames) {
      promises.push(this.checkNode(hostname, 11434));
      promises.push(this.checkNode(`${hostname}.local`, 11434));
      // Also check for ComfyUI on hostnames (but only default port to limit requests)
      promises.push(this.checkStandaloneComfyUI(hostname, 8188));
      promises.push(this.checkStandaloneComfyUI(`${hostname}.local`, 8188));
    }

    // Try common IP ranges (works if no CORS restrictions)
    // Scan the FULL range 1-254 for each common network prefix
    // NOTE: Only scan Ollama port (11434) for network ranges to avoid overwhelming the network
    // ComfyUI on specific IPs can be added manually or via "Add Unified Node"
    const networkRanges = [
      '192.168.0.',
      '192.168.1.',
      '192.168.2.',
      '10.0.0.',
      '10.0.1.',
      '10.1.0.',
      '172.16.0.',
    ];

    for (const range of networkRanges) {
      // Scan FULL IP range 1-254 for Ollama (port 11434 only)
      // checkNode will also check for ComfyUI on port 8188 when Ollama is found
      for (let i = 1; i <= 254; i++) {
        promises.push(this.checkNode(`${range}${i}`, 11434));
      }
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
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout for network latency

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

        // Also check for ComfyUI on the same host (default port 8188)
        // This allows local nodes to automatically detect both services
        const comfyUIPort = 8188;
        const comfyUIResult = await this.checkComfyUIOnHost(host, comfyUIPort);
        const hasComfyUI = comfyUIResult !== null;

        if (hasComfyUI) {
          console.log(`✅ Also found ComfyUI at ${host}:${comfyUIPort} - creating unified node`);
        }

        const node: OllamaNode = {
          id,
          name: this.generateNodeName(host, port, hasComfyUI),
          host,
          port,
          status: 'online',
          models,
          lastChecked: new Date(),
          type: hasComfyUI ? 'unified' : 'ollama',
          category: 'local',
          // Add dual capability fields
          capabilities: {
            ollama: true,
            comfyui: hasComfyUI
          },
          ollamaPort: port,
          comfyUIPort: hasComfyUI ? comfyUIPort : undefined,
          ollamaStatus: 'online',
          comfyuiStatus: hasComfyUI ? 'online' : 'offline',
          comfyUIData: comfyUIResult?.comfyUIData
        };

        // Add ComfyUI models to the list if available
        if (comfyUIResult?.models) {
          node.models = [
            ...node.models,
            ...comfyUIResult.models.filter(m => m.startsWith('[Video') || m.startsWith('[Checkpoint'))
          ];
        }

        return node;
      } else {
        // Log all non-success responses for debugging
        console.log(`❌ ${host}:${port} responded with ${response.status}: ${response.statusText}`);
      }
    } catch (error: any) {
      // More detailed error logging to debug connection issues
      if (error.name === 'AbortError') {
        // Only log timeouts for local network IPs (to reduce noise)
        if (host.startsWith('192.168.') || host.startsWith('10.0.')) {
          // Silent - too many timeout logs during scan
        }
      } else if (error.message?.includes('Failed to fetch')) {
        // CORS or network block - this is the most common issue for remote Ollama
        // Log prominently for debugging
        if (host.startsWith('192.168.') || host.startsWith('10.0.')) {
          console.warn(`🔒 CORS/Network blocked: ${host}:${port} - Ollama may need OLLAMA_ORIGINS=* env var`);
        }
      } else if (error.message?.includes('NetworkError') || error.message?.includes('network')) {
        // Network-level failure
        if (host.startsWith('192.168.') || host.startsWith('10.0.')) {
          console.warn(`🌐 Network error for ${host}:${port}: ${error.message}`);
        }
      } else {
        console.log(`🚫 ${host}:${port} error: ${error.message}`);
      }
    }

    return null;
  }

  /**
   * Check for standalone ComfyUI on a specific host/port
   * Creates a ComfyUI-only node if found (no Ollama required)
   */
  private async checkStandaloneComfyUI(host: string, port: number): Promise<OllamaNode | null> {
    const id = `comfyui_${host}:${port}`;

    // Skip if we already have this node (from checkNode or previous scan)
    if (this.nodes.has(id)) {
      return null;
    }

    try {
      const comfyUIResult = await this.checkComfyUIOnHost(host, port);

      if (comfyUIResult) {
        console.log(`✅ Found standalone ComfyUI at ${host}:${port}`);

        const node: OllamaNode = {
          id,
          name: this.generateUnifiedNodeName(host, false, true),
          host,
          port,
          status: 'online',
          models: comfyUIResult.models || [],
          version: comfyUIResult.version,
          lastChecked: new Date(),
          type: 'comfyui',
          category: 'local',
          capabilities: {
            ollama: false,
            comfyui: true
          },
          comfyUIPort: port,
          comfyuiStatus: 'online',
          comfyUIData: comfyUIResult.comfyUIData
        };

        this.nodes.set(id, node);
        return node;
      }
    } catch (error: any) {
      // Silent fail for scans - only log if it's a non-standard port we explicitly tried
      if (port !== 8188) {
        // Don't spam logs during network scan
      }
    }

    return null;
  }

  async refreshNode(nodeId: string): Promise<OllamaNode | null> {
    const existingNode = this.nodes.get(nodeId);
    if (!existingNode) return null;

    // For unified nodes or nodes that might have ComfyUI, use checkNode which auto-detects both
    const refreshedNode = await this.checkNode(existingNode.host, existingNode.ollamaPort || existingNode.port);
    if (refreshedNode) {
      // Preserve the original ID to avoid duplicates
      refreshedNode.id = nodeId;
      this.nodes.set(nodeId, refreshedNode);
      return refreshedNode;
    } else {
      // Mark as offline but keep in list
      const offlineNode = {
        ...existingNode,
        status: 'offline' as const,
        ollamaStatus: 'offline' as const,
        comfyuiStatus: existingNode.capabilities?.comfyui ? 'offline' as const : undefined,
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

  private generateNodeName(host: string, port: number, hasComfyUI: boolean = false): string {
    const isLocal = host === 'localhost' || host === '127.0.0.1';

    if (hasComfyUI) {
      // Unified node with both Ollama and ComfyUI
      return isLocal ? 'Local AI + Render' : `AI + Render (${host})`;
    }

    // Ollama only
    if (isLocal) {
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

  /**
   * Add a ComfyUI instance
   * ComfyUI has a different API structure than Ollama
   */
  async addComfyUINode(host: string, port: number = 8188): Promise<OllamaNode | null> {
    const id = `comfyui_${host}:${port}`;

    console.log(`🎨 Adding ComfyUI node at ${host}:${port}...`);

    const node: OllamaNode = {
      id,
      name: this.generateComfyUIName(host, port),
      host,
      port,
      status: 'checking',
      models: [],
      lastChecked: new Date(),
      type: 'comfyui',
      category: 'local',
    };

    this.nodes.set(id, node);

    // Check the node
    const checkedNode = await this.checkComfyUINode(host, port);
    if (checkedNode) {
      this.nodes.set(id, checkedNode);
      return checkedNode;
    } else {
      const offlineNode = { ...node, status: 'offline' as const };
      this.nodes.set(id, offlineNode);
      return offlineNode;
    }
  }

  /**
   * Check if a ComfyUI instance is reachable and get its info
   * Tries multiple endpoints since ComfyUI API can vary by version/installation type
   */
  private async checkComfyUINode(host: string, port: number): Promise<OllamaNode | null> {
    const id = `comfyui_${host}:${port}`;

    // Try multiple endpoints - ComfyUI API endpoints vary by version
    // The installer version may have different endpoints than portable
    const endpoints = [
      '/system_stats',      // Newer ComfyUI
      '/api/system_stats',  // Some versions use /api prefix
      '/object_info',       // Common in all versions
      '/api/object_info',   // With /api prefix
      '/queue',             // Basic queue endpoint
      '/api/queue',         // With /api prefix
      '/',                  // Root - just check if server responds
    ];

    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        console.log(`🔍 Checking ComfyUI at ${host}:${port}${endpoint}...`);

        const response = await fetch(`http://${host}:${port}${endpoint}`, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'Accept': 'application/json, text/html, */*',
          },
          mode: 'cors',
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          console.log(`✅ ComfyUI detected at ${host}:${port} via ${endpoint}`);

          // Try to get version from system_stats
          let version: string | undefined;
          try {
            // Try both with and without /api prefix
            for (const statsEndpoint of ['/system_stats', '/api/system_stats']) {
              const statsResponse = await fetch(`http://${host}:${port}${statsEndpoint}`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000),
                mode: 'cors',
              });
              if (statsResponse.ok) {
                const stats = await statsResponse.json();
                version = stats.system?.comfyui_version;
                if (version) break;
              }
            }
          } catch {
            // Version fetch is optional
          }

          // Try to get available models/checkpoints
          const { models, comfyUIData } = await this.getComfyUIModels(host, port);

          return {
            id,
            name: this.generateComfyUIName(host, port),
            host,
            port,
            status: 'online',
            models,
            version: version || 'unknown',
            lastChecked: new Date(),
            type: 'comfyui',
            category: 'local',
            comfyUIData,
            comfyUIPort: port,
            comfyuiStatus: 'online',
            capabilities: {
              ollama: false,
              comfyui: true
            }
          };
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log(`⏱️ ComfyUI check timed out for ${host}:${port}${endpoint}`);
        } else if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
          console.log(`🔒 ComfyUI connection blocked at ${host}:${port}${endpoint} (CORS or network issue)`);
        } else {
          console.log(`❌ ComfyUI check failed for ${host}:${port}${endpoint}:`, error.message);
        }
        // Continue to next endpoint
      }
    }

    console.log(`⚠️ Could not detect ComfyUI at ${host}:${port}. Tried endpoints: ${endpoints.join(', ')}`);
    console.log(`   If ComfyUI is running, it may need CORS enabled: --enable-cors-header`);
    return null;
  }

  /**
   * Get available models/checkpoints from ComfyUI
   * Returns both a flat model list and detailed ComfyUI data
   */
  private async getComfyUIModels(host: string, port: number): Promise<{
    models: string[];
    comfyUIData: OllamaNode['comfyUIData'];
  }> {
    const comfyUIData: OllamaNode['comfyUIData'] = {
      checkpoints: [],
      vaes: [],
      loras: [],
      clipModels: [],
      unets: [],
      customNodes: [],
      embeddings: []
    };

    // Try both with and without /api prefix
    const objectInfoEndpoints = ['/object_info', '/api/object_info'];
    let response: Response | null = null;

    for (const endpoint of objectInfoEndpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        // Get object_info which contains all node types and their options
        const res = await fetch(`http://${host}:${port}${endpoint}`, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
          },
          mode: 'cors',
        });

        clearTimeout(timeoutId);

        if (res.ok) {
          response = res;
          console.log(`📦 Got object_info from ${host}:${port}${endpoint}`);
          break;
        }
      } catch (e) {
        // Continue to next endpoint
      }
    }

    try {
      if (response && response.ok) {
        const objectInfo = await response.json();
        const models: string[] = [];

        // Extract checkpoint models
        if (objectInfo.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0]) {
          const checkpoints = objectInfo.CheckpointLoaderSimple.input.required.ckpt_name[0];
          comfyUIData.checkpoints = checkpoints;
          models.push(...checkpoints);
        }

        // Extract VAE models
        if (objectInfo.VAELoader?.input?.required?.vae_name?.[0]) {
          comfyUIData.vaes = objectInfo.VAELoader.input.required.vae_name[0];
        }

        // Extract LoRA models
        if (objectInfo.LoraLoader?.input?.required?.lora_name?.[0]) {
          comfyUIData.loras = objectInfo.LoraLoader.input.required.lora_name[0];
        }

        // Extract CLIP models (various loaders)
        const clipLoaders = ['CLIPLoader', 'DualCLIPLoader', 'TripleCLIPLoader'];
        for (const loader of clipLoaders) {
          if (objectInfo[loader]?.input?.required?.clip_name?.[0]) {
            comfyUIData.clipModels.push(...objectInfo[loader].input.required.clip_name[0]);
          }
        }

        // Extract UNET models
        if (objectInfo.UNETLoader?.input?.required?.unet_name?.[0]) {
          comfyUIData.unets = objectInfo.UNETLoader.input.required.unet_name[0];
        }

        // Also check for Diffusion models folder (for Wan/HoloCine)
        const diffusionLoaders = ['DownloadAndLoadWanVideo2Model', 'WanVideoModelLoader', 'LoadWanVideoModel'];
        for (const loader of diffusionLoaders) {
          if (objectInfo[loader]?.input?.required?.model?.[0]) {
            const diffModels = objectInfo[loader].input.required.model[0];
            comfyUIData.unets.push(...diffModels);
            // Also add to models with [Video] prefix
            diffModels.forEach((m: string) => models.push(`[Video Model] ${m}`));
          }
        }

        // Collect all custom nodes
        comfyUIData.customNodes = Object.keys(objectInfo);

        // Look for video generation capability nodes
        const videoNodes = [
          'WanVideoWrapper', 'WanVideoSampler', 'WanVideoVAEDecode', 'WanVideoModelLoader',
          'DownloadAndLoadWanVideo2Model', 'WanVideo2VAEDecode',
          'HoloCineLoader', 'HoloCineSceneLoader',
          'CogVideoXLoader', 'CogVideoXSampler'
        ];

        for (const nodeName of videoNodes) {
          if (objectInfo[nodeName]) {
            console.log(`🎬 Found video generation node: ${nodeName}`);
            models.push(`[Video Node] ${nodeName}`);
          }
        }

        console.log(`🎨 ComfyUI data found:`, {
          checkpoints: comfyUIData.checkpoints.length,
          vaes: comfyUIData.vaes.length,
          loras: comfyUIData.loras.length,
          clipModels: comfyUIData.clipModels.length,
          unets: comfyUIData.unets.length,
          customNodes: comfyUIData.customNodes.length
        });

        return { models, comfyUIData };
      }
    } catch (error) {
      console.warn(`⚠️ Could not fetch ComfyUI models from ${host}:${port}:`, error);
    }

    // Return defaults as fallback
    return {
      models: ['HoloCine', 'Wan 2.2', 'SDXL', 'Flux'],
      comfyUIData
    };
  }

  private generateComfyUIName(host: string, port: number): string {
    if (host === 'localhost' || host === '127.0.0.1') {
      return port === 8188 ? 'Local ComfyUI' : `Local ComfyUI (:${port})`;
    }
    return port === 8188 ? `ComfyUI (${host})` : `ComfyUI (${host}:${port})`;
  }

  /**
   * Refresh a ComfyUI node's status
   */
  async refreshComfyUINode(nodeId: string): Promise<OllamaNode | null> {
    const existingNode = this.nodes.get(nodeId);
    if (!existingNode || existingNode.type !== 'comfyui') return null;

    const refreshedNode = await this.checkComfyUINode(existingNode.host, existingNode.port);
    if (refreshedNode) {
      this.nodes.set(nodeId, refreshedNode);
      return refreshedNode;
    } else {
      const offlineNode = {
        ...existingNode,
        status: 'offline' as const,
        lastChecked: new Date(),
      };
      this.nodes.set(nodeId, offlineNode);
      return offlineNode;
    }
  }

  /**
   * Get all ComfyUI nodes
   */
  getComfyUINodes(): OllamaNode[] {
    return Array.from(this.nodes.values()).filter(node => node.type === 'comfyui');
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

  /**
   * Node Health Monitoring
   * Periodically checks the health of all configured nodes
   */
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private healthCheckCallbacks: Set<(nodes: OllamaNode[]) => void> = new Set();

  /**
   * Start periodic health monitoring of all nodes
   * @param intervalMs - Check interval in milliseconds (default: 30 seconds)
   */
  startHealthMonitoring(intervalMs: number = 30000): void {
    if (this.healthCheckInterval) {
      console.log('⚠️ Health monitoring already running');
      return;
    }

    console.log(`🏥 Starting node health monitoring (interval: ${intervalMs / 1000}s)`);

    // Run immediately
    this.performHealthCheck();

    // Then run periodically
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, intervalMs);
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      console.log('🛑 Stopped node health monitoring');
    }
  }

  /**
   * Check if health monitoring is active
   */
  isHealthMonitoringActive(): boolean {
    return this.healthCheckInterval !== null;
  }

  /**
   * Subscribe to health check updates
   * @returns Unsubscribe function
   */
  onHealthUpdate(callback: (nodes: OllamaNode[]) => void): () => void {
    this.healthCheckCallbacks.add(callback);
    return () => {
      this.healthCheckCallbacks.delete(callback);
    };
  }

  /**
   * Perform health check on all local Ollama nodes
   */
  private async performHealthCheck(): Promise<void> {
    const localNodes = Array.from(this.nodes.values()).filter(
      node => node.category === 'local' && node.type === 'ollama'
    );

    if (localNodes.length === 0) {
      return;
    }

    console.log(`🏥 Health check: checking ${localNodes.length} local nodes...`);

    const statusChanges: { nodeId: string; oldStatus: string; newStatus: string }[] = [];

    for (const node of localNodes) {
      const oldStatus = node.status;

      try {
        const refreshed = await this.refreshNode(node.id);
        if (refreshed && refreshed.status !== oldStatus) {
          statusChanges.push({
            nodeId: node.id,
            oldStatus,
            newStatus: refreshed.status
          });
        }
      } catch (error) {
        console.warn(`❌ Health check failed for ${node.name}:`, error);
      }
    }

    // Log status changes
    if (statusChanges.length > 0) {
      console.log('🔄 Node status changes detected:');
      statusChanges.forEach(change => {
        const icon = change.newStatus === 'online' ? '✅' : '❌';
        console.log(`   ${icon} ${change.nodeId}: ${change.oldStatus} → ${change.newStatus}`);
      });
    }

    // Notify subscribers
    const updatedNodes = this.getNodes();
    this.healthCheckCallbacks.forEach(callback => {
      try {
        callback(updatedNodes);
      } catch (error) {
        console.error('Error in health check callback:', error);
      }
    });
  }

  /**
   * Get online nodes only
   */
  getOnlineNodes(): OllamaNode[] {
    return Array.from(this.nodes.values()).filter(node => node.status === 'online');
  }

  /**
   * Get offline nodes only
   */
  getOfflineNodes(): OllamaNode[] {
    return Array.from(this.nodes.values()).filter(node => node.status === 'offline');
  }

  /**
   * Get nodes that were last checked more than X milliseconds ago
   */
  getStaleNodes(maxAgeMs: number = 60000): OllamaNode[] {
    const now = Date.now();
    return Array.from(this.nodes.values()).filter(
      node => now - node.lastChecked.getTime() > maxAgeMs
    );
  }

  // ============== DUAL CAPABILITY (UNIFIED NODE) METHODS ==============

  /**
   * Scan a host for both Ollama and ComfyUI capabilities
   * Creates a unified node if both are present
   */
  async scanHostForCapabilities(host: string): Promise<OllamaNode | null> {
    console.log(`🔍 Scanning ${host} for dual capabilities (Ollama + ComfyUI)...`);

    const ollamaPort = 11434;
    const comfyuiPort = 8188;

    // Check both services in parallel
    const [ollamaResult, comfyuiResult] = await Promise.all([
      this.checkOllamaOnHost(host, ollamaPort),
      this.checkComfyUIOnHost(host, comfyuiPort)
    ]);

    const hasOllama = ollamaResult !== null;
    const hasComfyUI = comfyuiResult !== null;

    if (!hasOllama && !hasComfyUI) {
      console.log(`❌ No services found on ${host}`);
      return null;
    }

    // Create a unified node if BOTH are present, otherwise single-capability node
    const isUnified = hasOllama && hasComfyUI;
    const nodeId = isUnified ? `unified_${host}` : (hasOllama ? `${host}:${ollamaPort}` : `comfyui_${host}:${comfyuiPort}`);
    const nodeName = this.generateUnifiedNodeName(host, hasOllama, hasComfyUI);

    const node: OllamaNode = {
      id: nodeId,
      name: nodeName,
      host,
      port: hasOllama ? ollamaPort : comfyuiPort, // Primary port for backwards compatibility
      status: 'online',
      models: ollamaResult?.models || [],
      version: ollamaResult?.version || comfyuiResult?.version,
      lastChecked: new Date(),
      type: isUnified ? 'unified' : (hasOllama ? 'ollama' : 'comfyui'),
      category: 'local',

      // Dual capability fields
      capabilities: {
        ollama: hasOllama,
        comfyui: hasComfyUI
      },
      ollamaPort: hasOllama ? ollamaPort : undefined,
      comfyUIPort: hasComfyUI ? comfyuiPort : undefined,
      ollamaStatus: hasOllama ? 'online' : 'offline',
      comfyuiStatus: hasComfyUI ? 'online' : 'offline',

      // ComfyUI data if present
      comfyUIData: comfyuiResult?.comfyUIData
    };

    // Add ComfyUI models to the models list with prefix
    if (comfyuiResult?.models) {
      node.models = [
        ...node.models,
        ...comfyuiResult.models.filter(m => m.startsWith('[Video'))
      ];
    }

    console.log(`✅ Created ${isUnified ? 'UNIFIED' : node.type.toUpperCase()} node for ${host}:`, {
      ollama: hasOllama,
      comfyui: hasComfyUI,
      ollamaModels: ollamaResult?.models?.length || 0,
      comfyuiCheckpoints: comfyuiResult?.comfyUIData?.checkpoints?.length || 0
    });

    this.nodes.set(nodeId, node);
    return node;
  }

  /**
   * Check for Ollama on a specific host/port
   */
  private async checkOllamaOnHost(host: string, port: number): Promise<{ models: string[]; version?: string } | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`http://${host}:${port}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors'
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const models = data.models?.map((m: any) => m.name) || [];
        return { models };
      }
    } catch {
      // Silent fail - host doesn't have Ollama
    }
    return null;
  }

  /**
   * Check for ComfyUI on a specific host/port
   * Tries multiple endpoints since ComfyUI API can vary by version
   */
  private async checkComfyUIOnHost(host: string, port: number): Promise<{
    models: string[];
    version?: string;
    comfyUIData: OllamaNode['comfyUIData'];
  } | null> {
    // Try multiple endpoints - ComfyUI API endpoints vary by version/installation type
    const endpoints = [
      '/system_stats',      // Newer ComfyUI
      '/api/system_stats',  // Some versions use /api prefix
      '/object_info',       // Common in all versions
      '/api/object_info',   // With /api prefix
      '/queue',             // Basic queue endpoint
      '/api/queue',         // With /api prefix
    ];

    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        console.log(`🔍 Checking ComfyUI at ${host}:${port}${endpoint}...`);

        const response = await fetch(`http://${host}:${port}${endpoint}`, {
          method: 'GET',
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
          mode: 'cors',
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          console.log(`✅ ComfyUI detected at ${host}:${port} via ${endpoint}`);

          // Try to get version from system_stats if available
          let version: string | undefined;
          try {
            for (const statsEndpoint of ['/system_stats', '/api/system_stats']) {
              const statsResponse = await fetch(`http://${host}:${port}${statsEndpoint}`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000),
                mode: 'cors',
              });
              if (statsResponse.ok) {
                const stats = await statsResponse.json();
                version = stats.system?.comfyui_version;
                if (version) break;
              }
            }
          } catch {
            // Version fetch is optional
          }

          // Get models and comfyUI data
          const { models, comfyUIData } = await this.getComfyUIModels(host, port);
          return {
            models,
            version,
            comfyUIData
          };
        }
      } catch (error: any) {
        // Continue to next endpoint with more context
        if (error.name === 'AbortError') {
          console.log(`⏱️ ComfyUI check timed out for ${host}:${port}${endpoint}`);
        } else if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
          // CORS or network error - likely ComfyUI is running but CORS is blocking
          console.log(`🔒 ComfyUI connection blocked at ${host}:${port}${endpoint} (possible CORS issue or not running)`);
        } else {
          console.log(`❌ ComfyUI check failed for ${host}:${port}${endpoint}:`, error.message || error);
        }
      }
    }

    // Only log if we're checking default ComfyUI port
    if (port === 8188) {
      console.log(`⚠️ No ComfyUI detected at ${host}:${port}. If ComfyUI is running, check:`);
      console.log(`   1. ComfyUI is accessible at http://${host}:${port}`);
      console.log(`   2. CORS is not blocking requests (--enable-cors-header)`);
    }
    return null;
  }

  /**
   * Generate a name for unified or single-capability nodes
   */
  private generateUnifiedNodeName(host: string, hasOllama: boolean, hasComfyUI: boolean): string {
    const isLocal = host === 'localhost' || host === '127.0.0.1';

    if (hasOllama && hasComfyUI) {
      return isLocal ? 'Local AI + Render' : `AI + Render (${host})`;
    } else if (hasOllama) {
      return isLocal ? 'Local Ollama' : `Ollama (${host})`;
    } else {
      return isLocal ? 'Local ComfyUI' : `ComfyUI (${host})`;
    }
  }

  /**
   * Add a unified node by scanning a host for both services
   */
  async addUnifiedNode(host: string): Promise<OllamaNode | null> {
    return this.scanHostForCapabilities(host);
  }

  /**
   * Get nodes with Ollama capability
   */
  getOllamaCapableNodes(): OllamaNode[] {
    return Array.from(this.nodes.values()).filter(node =>
      (node.type === 'ollama') ||
      (node.type === 'unified' && node.capabilities?.ollama)
    );
  }

  /**
   * Get nodes with ComfyUI capability (for rendering)
   */
  getComfyUICapableNodes(): OllamaNode[] {
    return Array.from(this.nodes.values()).filter(node =>
      (node.type === 'comfyui') ||
      (node.type === 'unified' && node.capabilities?.comfyui)
    );
  }

  /**
   * Check if a node is available for a specific capability
   */
  isNodeAvailableFor(nodeId: string, capability: 'ollama' | 'comfyui'): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;

    if (capability === 'ollama') {
      // Check Ollama availability
      if (node.type === 'ollama') {
        return node.status === 'online';
      }
      if (node.type === 'unified') {
        return node.capabilities?.ollama === true && node.ollamaStatus === 'online';
      }
    } else {
      // Check ComfyUI availability
      if (node.type === 'comfyui') {
        return node.status === 'online';
      }
      if (node.type === 'unified') {
        return node.capabilities?.comfyui === true && node.comfyuiStatus === 'online';
      }
    }

    return false;
  }

  /**
   * Mark a node's capability as busy
   */
  markNodeBusy(nodeId: string, capability: 'ollama' | 'comfyui'): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    if (node.type === 'unified') {
      if (capability === 'ollama') {
        node.ollamaStatus = 'busy';
      } else {
        node.comfyuiStatus = 'busy';
      }
    } else {
      // For single-capability nodes, mark the main status as busy
      node.status = 'online'; // Keep online but busy tracked separately
      if (capability === 'ollama' && node.type === 'ollama') {
        node.ollamaStatus = 'busy';
      } else if (capability === 'comfyui' && node.type === 'comfyui') {
        node.comfyuiStatus = 'busy';
      }
    }

    this.nodes.set(nodeId, node);
  }

  /**
   * Mark a node's capability as available (not busy)
   */
  markNodeAvailable(nodeId: string, capability: 'ollama' | 'comfyui'): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    if (capability === 'ollama') {
      node.ollamaStatus = 'online';
    } else {
      node.comfyuiStatus = 'online';
    }

    this.nodes.set(nodeId, node);
  }

  /**
   * Get the correct endpoint URL for a node's capability
   */
  getNodeEndpoint(nodeId: string, capability: 'ollama' | 'comfyui'): string | null {
    const node = this.nodes.get(nodeId);
    if (!node) return null;

    if (capability === 'ollama') {
      const port = node.ollamaPort || node.port;
      return `http://${node.host}:${port}`;
    } else {
      const port = node.comfyUIPort || (node.type === 'comfyui' ? node.port : 8188);
      return `http://${node.host}:${port}`;
    }
  }

  /**
   * Refresh a unified node - checks both capabilities
   */
  async refreshUnifiedNode(nodeId: string): Promise<OllamaNode | null> {
    const existingNode = this.nodes.get(nodeId);
    if (!existingNode) return null;

    // For unified nodes, re-scan the host for both capabilities
    if (existingNode.type === 'unified') {
      const refreshed = await this.scanHostForCapabilities(existingNode.host);
      return refreshed;
    }

    // For other nodes, use existing refresh methods
    if (existingNode.type === 'ollama') {
      return this.refreshNode(nodeId);
    }
    if (existingNode.type === 'comfyui') {
      return this.refreshComfyUINode(nodeId);
    }

    return existingNode;
  }

  /**
   * Get unified nodes only
   */
  getUnifiedNodes(): OllamaNode[] {
    return Array.from(this.nodes.values()).filter(node => node.type === 'unified');
  }

  /**
   * Find the best available node for a given capability
   * Prefers nodes that are not busy, then least recently used
   */
  findBestAvailableNode(capability: 'ollama' | 'comfyui'): OllamaNode | null {
    const capableNodes = capability === 'ollama'
      ? this.getOllamaCapableNodes()
      : this.getComfyUICapableNodes();

    // Filter to only available (not busy) nodes
    const availableNodes = capableNodes.filter(node =>
      this.isNodeAvailableFor(node.id, capability)
    );

    if (availableNodes.length === 0) return null;

    // Sort by last checked (least recently used first)
    availableNodes.sort((a, b) =>
      a.lastChecked.getTime() - b.lastChecked.getTime()
    );

    return availableNodes[0];
  }

}

export const nodeDiscoveryService = new NodeDiscoveryService();