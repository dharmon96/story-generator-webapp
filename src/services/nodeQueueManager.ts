import { ModelConfig } from '../store/useStore';
import { nodeDiscoveryService, OllamaNode } from './nodeDiscovery';
import { debugService } from './debugService';
import { aiLogService } from './aiLogService';

export interface QueueTask {
  id: string;
  type: 'story' | 'segment' | 'shot' | 'character' | 'location' | 'prompt' | 'comfyui_prompts' | 'narration' | 'music';
  priority: number;
  storyId: string;
  parentTaskId?: string;
  data: any;
  status: 'pending' | 'assigned' | 'processing' | 'completed' | 'failed';
  assignedNode?: string;
  assignedModel?: string;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: any;
  dependencies?: string[]; // Task IDs that must complete first
}

export interface NodeUsageStats {
  nodeId: string;
  currentTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageProcessingTime: number;
  lastUsed: Date;
  isAvailable: boolean;
  queuedTasks: QueueTask[];
}

export interface ProcessingQueue {
  id: string;
  name: string;
  tasks: QueueTask[];
  maxConcurrent: number;
  processing: number;
}

class NodeQueueManager {
  private queues: Map<string, ProcessingQueue> = new Map();
  private tasks: Map<string, QueueTask> = new Map();
  private nodeStats: Map<string, NodeUsageStats> = new Map();
  private taskCallbacks: Map<string, (result: any) => void> = new Map();
  private errorCallbacks: Map<string, (error: Error) => void> = new Map();
  private progressCallbacks: Map<string, (progress: any) => void> = new Map();
  private processingInterval?: NodeJS.Timeout;
  private isProcessing: boolean = false;
  
  constructor() {
    const timestamp = new Date().toISOString();
    debugService.info('queue', `🚀 NodeQueueManager constructor called`, {
      timestamp,
      stackTrace: new Error().stack?.slice(0, 500)
    });
    this.initializeQueues();
    // DISABLED: Auto-processing causes double execution when used with enhancedAiPipeline
    // this.startProcessing();
    debugService.warn('queue', '⚠️ NodeQueueManager auto-processing DISABLED to prevent double execution');
  }

  private initializeQueues() {
    // Main story processing queue
    this.queues.set('story', {
      id: 'story',
      name: 'Story Generation Queue',
      tasks: [],
      maxConcurrent: 1,
      processing: 0
    });

    // Shot processing queue (can handle multiple shots in parallel)
    this.queues.set('shots', {
      id: 'shots',
      name: 'Shot Processing Queue',
      tasks: [],
      maxConcurrent: 4,
      processing: 0
    });

    // Character/Location analysis queue
    this.queues.set('analysis', {
      id: 'analysis',
      name: 'Analysis Queue',
      tasks: [],
      maxConcurrent: 2,
      processing: 0
    });

    // Prompt generation queue (high parallelism)
    this.queues.set('prompts', {
      id: 'prompts',
      name: 'Prompt Generation Queue',
      tasks: [],
      maxConcurrent: 8,
      processing: 0
    });

    // ComfyUI prompt generation queue
    this.queues.set('comfyui_prompts', {
      id: 'comfyui_prompts',
      name: 'ComfyUI Prompt Generation Queue',
      tasks: [],
      maxConcurrent: 6,
      processing: 0
    });

    // Audio processing queue (narration/music)
    this.queues.set('audio', {
      id: 'audio',
      name: 'Audio Processing Queue',
      tasks: [],
      maxConcurrent: 2,
      processing: 0
    });
  }

  private startProcessing() {
    // Process queues every 500ms
    this.processingInterval = setInterval(() => {
      this.processQueues();
    }, 500);
  }

  public stopProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
  }

  public addTask(
    task: Omit<QueueTask, 'id' | 'status' | 'attempts' | 'createdAt'>,
    onComplete?: (result: any) => void,
    onError?: (error: Error) => void,
    onProgress?: (progress: any) => void
  ): string {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();
    
    console.log(`🔧 [${timestamp}] NodeQueueManager.addTask() - START`);
    console.log(`🔧 [${timestamp}] Creating task:`, {
      taskId,
      type: task.type,
      priority: task.priority,
      storyId: task.storyId,
      hasOnComplete: !!onComplete,
      hasOnError: !!onError,
      hasOnProgress: !!onProgress
    });
    
    const newTask: QueueTask = {
      ...task,
      id: taskId,
      status: 'pending',
      attempts: 0,
      createdAt: new Date()
    };

    console.log(`🔧 [${timestamp}] Adding task to tasks map:`, taskId);
    this.tasks.set(taskId, newTask);
    
    if (onComplete) {
      console.log(`🔧 [${timestamp}] Setting onComplete callback for:`, taskId);
      this.taskCallbacks.set(taskId, onComplete);
    }
    if (onError) {
      console.log(`🔧 [${timestamp}] Setting onError callback for:`, taskId);
      this.errorCallbacks.set(taskId, onError);
    }
    if (onProgress) {
      console.log(`🔧 [${timestamp}] Setting onProgress callback for:`, taskId);
      this.progressCallbacks.set(taskId, onProgress);
    }

    // Add to appropriate queue
    const queueId = this.getQueueForTaskType(task.type);
    console.log(`🔧 [${timestamp}] Task type ${task.type} maps to queue:`, queueId);
    
    const queue = this.queues.get(queueId);
    if (queue) {
      console.log(`🔧 [${timestamp}] Adding to queue ${queueId}, current tasks:`, queue.tasks.length);
      queue.tasks.push(newTask);
      this.sortQueueByPriority(queue);
      console.log(`🔧 [${timestamp}] Queue ${queueId} now has ${queue.tasks.length} tasks`);
    } else {
      console.error(`🔧 [${timestamp}] ERROR: Queue ${queueId} not found!`);
    }

    console.log(`📥 [${timestamp}] Added task ${taskId} to queue ${queueId}:`, {
      type: task.type,
      priority: task.priority,
      storyId: task.storyId,
      queueLength: queue?.tasks.length || 0
    });

    // Since auto-processing is disabled, we need to manually process
    console.log(`🔧 [${timestamp}] Auto-processing is disabled, manually triggering processTask`);
    this.processTaskDirectly(newTask, queue!);

    console.log(`🔧 [${timestamp}] NodeQueueManager.addTask() - END`);
    return taskId;
  }

  private async processTaskDirectly(task: QueueTask, queue: ProcessingQueue) {
    const timestamp = new Date().toISOString();
    console.log(`🔧 [${timestamp}] processTaskDirectly() - START for task:`, task.id);
    
    try {
      // Find best available node for this task
      const nodeAssignment = this.findBestNodeForTask(task);
      
      if (!nodeAssignment) {
        console.log(`🔧 [${timestamp}] No available node for task ${task.id}, calling error callback`);
        const errorCallback = this.errorCallbacks.get(task.id);
        if (errorCallback) {
          errorCallback(new Error('No available node for task processing'));
        }
        // Clean up callbacks
        this.taskCallbacks.delete(task.id);
        this.errorCallbacks.delete(task.id);
        this.progressCallbacks.delete(task.id);
        return;
      }

    // Assign and start processing
    task.status = 'assigned';
    task.assignedNode = nodeAssignment.nodeId;
    task.assignedModel = nodeAssignment.model;
    console.log(`🔧 [${timestamp}] Task ${task.id} assigned to node ${nodeAssignment.nodeId} with model ${nodeAssignment.model}`);

    // Remove from queue tasks array
    const taskIndex = queue.tasks.indexOf(task);
    if (taskIndex > -1) {
      queue.tasks.splice(taskIndex, 1);
      console.log(`🔧 [${timestamp}] Removed task ${task.id} from queue, remaining: ${queue.tasks.length}`);
    }

      // Start async processing
      console.log(`🔧 [${timestamp}] Starting async processing for task:`, task.id);
      await this.processTask(task, queue);
    } catch (error) {
      console.error(`❌ [${timestamp}] Error processing task ${task.id}:`, error);
      this.handleTaskError(task, error as Error, queue);
    }
  }

  private getQueueForTaskType(type: QueueTask['type']): string {
    switch (type) {
      case 'story':
        return 'story';
      case 'shot':
        return 'shots';
      case 'character':
      case 'location':
        return 'analysis';
      case 'prompt':
        return 'prompts';
      case 'comfyui_prompts':
        return 'comfyui_prompts';
      case 'narration':
      case 'music':
        return 'audio';
      default:
        return 'story';
    }
  }

  private sortQueueByPriority(queue: ProcessingQueue) {
    queue.tasks.sort((a, b) => {
      // Check dependencies first
      if (a.dependencies?.includes(b.id)) return 1;
      if (b.dependencies?.includes(a.id)) return -1;
      
      // Then sort by priority (higher priority first)
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      
      // Finally by creation time (older first)
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  private async processQueues() {
    // Prevent concurrent processing
    if (this.isProcessing) {
      return;
    }
    
    this.isProcessing = true;
    try {
      const queuesArray = Array.from(this.queues.values());
      for (const queue of queuesArray) {
        if (queue.tasks.length > 0 || queue.processing > 0) {
          console.log(`📊 Processing queue ${queue.id}: ${queue.tasks.length} pending, ${queue.processing} processing`);
        }
        await this.processQueue(queue);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async processQueue(queue: ProcessingQueue) {
    // Skip if queue is at max capacity
    if (queue.processing >= queue.maxConcurrent) {
      console.log(`🚫 Queue ${queue.id} at max capacity: ${queue.processing}/${queue.maxConcurrent}`);
      return;
    }

    // Find next available task
    const availableTasks = queue.tasks.filter(task => 
      task.status === 'pending' &&
      this.areDependenciesMet(task)
    );

    if (availableTasks.length === 0) {
      if (queue.tasks.length > 0) {
        console.log(`⏳ Queue ${queue.id} has ${queue.tasks.length} tasks but none are available (dependencies or status)`);
      }
      return;
    }

    console.log(`✅ Queue ${queue.id} has ${availableTasks.length} available tasks`);

    // Process tasks up to max concurrent limit
    const tasksToProcess = availableTasks.slice(0, queue.maxConcurrent - queue.processing);
    
    for (const task of tasksToProcess) {
      console.log(`🔍 Finding node for task ${task.id} (type: ${task.type})`);
      // Find best available node for this task
      const nodeAssignment = this.findBestNodeForTask(task);
      
      if (!nodeAssignment) {
        console.log(`⚠️ No available node for task ${task.id} (type: ${task.type})`);
        continue;
      }

      // Assign and start processing
      task.status = 'assigned';
      task.assignedNode = nodeAssignment.nodeId;
      task.assignedModel = nodeAssignment.model;
      queue.processing++;

      // Remove from queue tasks array
      const taskIndex = queue.tasks.indexOf(task);
      if (taskIndex > -1) {
        queue.tasks.splice(taskIndex, 1);
      }

      // Start async processing
      this.processTask(task, queue).catch(error => {
        console.error(`❌ Error processing task ${task.id}:`, error);
        this.handleTaskError(task, error, queue);
      });
    }
  }

  private areDependenciesMet(task: QueueTask): boolean {
    if (!task.dependencies || task.dependencies.length === 0) {
      return true;
    }

    return task.dependencies.every(depId => {
      const depTask = this.tasks.get(depId);
      return depTask && depTask.status === 'completed';
    });
  }

  private findBestNodeForTask(task: QueueTask): { nodeId: string; model: string } | null {
    const nodes = nodeDiscoveryService.getNodes();
    const modelConfigs = this.getModelConfigsForTaskType(task.type);
    
    console.log(`🔎 Finding node for task type ${task.type}, found ${modelConfigs?.length || 0} model configs`);
    
    if (!modelConfigs || modelConfigs.length === 0) {
      console.log(`❌ No model configs found for task type ${task.type}`);
      return null;
    }

    // Find available nodes with required models
    const availableNodes: Array<{ node: OllamaNode; model: string; stats: NodeUsageStats }> = [];
    
    console.log(`🌐 System has ${nodes.length} total nodes, but only checking configured nodes for step "${task.type}"`);
    console.log(`📋 Configured nodes for ${task.type}: ${modelConfigs.map(c => `${c.nodeId}(${c.model})`).join(', ')}`);
    
    for (const config of modelConfigs) {
      console.log(`  🔍 Checking configured node ${config.nodeId} with model ${config.model}`);
      const node = nodes.find(n => 
        n.id === config.nodeId && 
        n.status === 'online' &&
        n.models.includes(config.model)
      );
      
      if (node) {
        console.log(`    ✅ Found node ${node.name}, checking availability`);
        const stats = this.getOrCreateNodeStats(node.id);
        if (stats.isAvailable) {
          availableNodes.push({ 
            node, 
            model: config.model,
            stats 
          });
          console.log(`    ✅ Node is available`);
        } else {
          console.log(`    ❌ Node is busy`);
        }
      } else {
        console.log(`    ❌ Node not found or offline`);
      }
    }

    if (availableNodes.length === 0) {
      console.log(`❌ No available nodes found for task type ${task.type}`);
      return null;
    }

    // Select node with lowest current load
    availableNodes.sort((a, b) => a.stats.currentTasks - b.stats.currentTasks);
    const selected = availableNodes[0];
    
    // Update node stats
    selected.stats.currentTasks++;
    selected.stats.lastUsed = new Date();
    
    return {
      nodeId: selected.node.id,
      model: selected.model
    };
  }

  private modelConfigs: ModelConfig[] = [];

  public setModelConfigs(configs: ModelConfig[]) {
    console.log(`🔧 NodeQueueManager: Setting ${configs.length} model configs`);
    configs.forEach(config => {
      if (config.enabled) {
        console.log(`  ✅ ${config.step}: ${config.nodeId} - ${config.model}`);
      }
    });
    this.modelConfigs = configs;
  }

  private getModelConfigsForTaskType(type: QueueTask['type']): ModelConfig[] {
    const stepMap: Record<QueueTask['type'], string> = {
      'story': 'story',
      'segment': 'story', // Use same model config as story
      'shot': 'shots',
      'character': 'characters',
      'location': 'characters', // Using same as characters for now
      'prompt': 'prompts',
      'comfyui_prompts': 'prompts', // Use same model config as prompts
      'narration': 'narration',
      'music': 'music'
    };

    const stepName = stepMap[type];
    return this.modelConfigs.filter(config => 
      config.enabled && config.step === stepName
    );
  }

  private getOrCreateNodeStats(nodeId: string): NodeUsageStats {
    if (!this.nodeStats.has(nodeId)) {
      this.nodeStats.set(nodeId, {
        nodeId,
        currentTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        averageProcessingTime: 0,
        lastUsed: new Date(),
        isAvailable: true,
        queuedTasks: []
      });
    }
    return this.nodeStats.get(nodeId)!;
  }

  private async processTask(task: QueueTask, queue: ProcessingQueue) {
    try {
      task.status = 'processing';
      task.startedAt = new Date();
      
      console.log(`🔄 Processing task ${task.id} on node ${task.assignedNode}`);
      
      // Notify progress callback
      const progressCallback = this.progressCallbacks.get(task.id);
      if (progressCallback) {
        progressCallback({
          taskId: task.id,
          status: 'processing',
          node: task.assignedNode,
          model: task.assignedModel,
          step: 'starting',
          timestamp: new Date().toISOString()
        });
      }

      // TODO: Actual task processing based on type
      // This would call the appropriate AI service
      const result = await this.executeTask(task);
      
      // Mark as completed
      task.status = 'completed';
      task.completedAt = new Date();
      task.result = result;
      
      // Update node stats
      const stats = this.getOrCreateNodeStats(task.assignedNode!);
      stats.currentTasks--;
      stats.completedTasks++;
      
      // Calculate average processing time
      const processingTime = task.completedAt.getTime() - task.startedAt!.getTime();
      stats.averageProcessingTime = 
        (stats.averageProcessingTime * (stats.completedTasks - 1) + processingTime) / stats.completedTasks;
      
      // Notify completion callback
      const callback = this.taskCallbacks.get(task.id);
      if (callback) {
        console.log(`📤 Calling completion callback for task ${task.id} with result:`, result);
        callback(result);
        console.log(`✅ Callback completed for task ${task.id}`);
      } else {
        console.log(`⚠️ No callback found for task ${task.id}`);
      }
      
      // Clean up callbacks after success
      this.taskCallbacks.delete(task.id);
      this.errorCallbacks.delete(task.id);
      this.progressCallbacks.delete(task.id);
      
      console.log(`✅ Completed task ${task.id}`);
      
    } catch (error) {
      this.handleTaskError(task, error as Error, queue);
    } finally {
      queue.processing--;
    }
  }

  private async executeTask(task: QueueTask): Promise<any> {
    if (!task.assignedNode || !task.assignedModel) {
      throw new Error('Task not properly assigned to node');
    }

    const node = nodeDiscoveryService.getNode(task.assignedNode);
    if (!node) {
      throw new Error(`Node ${task.assignedNode} not found`);
    }
    
    try {
      const result = await this.executeTaskByType(task, node, task.assignedModel);
      return {
        taskId: task.id,
        type: task.type,
        result,
        timestamp: new Date()
      };
    } catch (error) {
      console.error(`❌ Task execution failed:`, error);
      throw error;
    }
  }

  private async executeTaskByType(task: QueueTask, node: any, model: string): Promise<any> {
    
    switch (task.type) {
      case 'story':
        return this.executeStoryTask(task, node, model);
      case 'segment':
        return this.executeSegmentTask(task, node, model);
      case 'shot':
        return this.executeShotTask(task, node, model);
      case 'character':
        return this.executeCharacterTask(task, node, model);
      case 'prompt':
        return this.executePromptTask(task, node, model);
      case 'comfyui_prompts':
        return this.executeComfyUIPromptTask(task, node, model);
      case 'narration':
        return this.executeNarrationTask(task, node, model);
      case 'music':
        return this.executeMusicTask(task, node, model);
      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  private async executeStoryTask(task: QueueTask, node: any, model: string): Promise<any> {
    console.log('🎬 executeStoryTask called for task:', task.id);
    
    // Call AI service directly for story generation
    const { SYSTEM_PROMPTS } = await import('./aiPipeline');
    
    const prompt = `Genre: ${task.data.genre}
Length: ${task.data.length}
Concept: ${task.data.prompt}`;

    console.log('📝 Calling AI with prompt:', prompt.slice(0, 100) + '...');
    const response = await this.callAI(node, model, SYSTEM_PROMPTS.story_writer, prompt, task.id);
    console.log('📝 AI response received, length:', response.length);
    console.log('📝 First 500 chars:', response.slice(0, 500));
    
    // Parse story response - look for title in various formats
    const lines = response.split('\n');
    let title = '';
    
    // Try to find title in the response - be more aggressive
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const line = lines[i];
      
      // Check for "Title:" format (case insensitive)
      if (line.toLowerCase().includes('title:')) {
        title = line.substring(line.toLowerCase().indexOf('title:') + 6).trim();
        // Remove quotes if present
        title = title.replace(/^["']|["']$/g, '');
        console.log('📝 Found title with "Title:" format:', title);
        break;
      }
      
      // Check for "# Title" markdown format
      if (line.startsWith('#') && !line.startsWith('##')) {
        title = line.replace(/^#+\s*/, '').trim();
        console.log('📝 Found title with markdown format:', title);
        break;
      }
      
      // Check for first non-empty line that looks like a title (shorter than 100 chars)
      if (!title && line.trim() && line.trim().length < 100 && !line.includes(':')) {
        title = line.trim();
        console.log('📝 Using first line as title:', title);
      }
    }
    
    // If no title found, use first line or prompt excerpt
    if (!title) {
      const firstNonEmptyLine = lines.find(line => line.trim().length > 0);
      if (firstNonEmptyLine && firstNonEmptyLine.length < 100) {
        title = firstNonEmptyLine.trim();
      } else {
        // Use a portion of the prompt as title
        title = task.data.prompt.slice(0, 50) + '...';
      }
      console.log('📝 Using fallback title:', title);
    }
    
    const result = {
      id: `story_${Date.now()}`,
      title: title || 'Untitled Story',
      content: response,
      genre: task.data.genre || 'Unknown',
      length: task.data.length || 'Medium',
      createdAt: new Date()
    };
    
    debugService.info('ai', '📝 Returning story result:', { 
      id: result.id, 
      title: result.title,
      hasContent: !!result.content,
      contentLength: result.content?.length,
      genre: result.genre,
      length: result.length
    });
    return result;
  }

  private async executeSegmentTask(task: QueueTask, node: any, model: string): Promise<any> {
    const { SYSTEM_PROMPTS } = await import('./aiPipeline');
    
    debugService.info('ai', '📑 SEGMENT TASK DATA:', {
      hasStory: !!task.data?.story,
      storyKeys: task.data?.story ? Object.keys(task.data.story) : [],
      storyContent: task.data?.story?.content ? `${task.data.story.content.length} chars` : 'UNDEFINED'
    });
    
    const prompt = `Story Title: ${task.data.story?.title || 'Untitled'}
Genre: ${task.data.story?.genre || 'Unknown'}

Story Content:
${task.data.story?.content || 'NO CONTENT PROVIDED'}`;

    debugService.info('ai', '📑 Calling AI for story segmentation:', {
      promptLength: prompt.length,
      hasStoryContent: !!task.data.story?.content
    });
    
    const response = await this.callAI(node, model, SYSTEM_PROMPTS.story_segmenter, prompt, task.id);
    
    debugService.info('ai', '📑 Segmentation response received:', {
      responseLength: response.length,
      preview: response.slice(0, 200),
      containsJSON: response.includes('{'),
      containsParts: response.includes('parts')
    });
    
    try {
      // Simple direct JSON parsing - the prompt should generate clean JSON
      let data = null;
      
      try {
        data = JSON.parse(response.trim());
        debugService.success('ai', '📑 Direct JSON parsing succeeded');
      } catch (e: any) {
        debugService.warn('ai', '📑 Direct JSON parsing failed, trying fallback', { error: e.message });
        
        // Fallback: Extract JSON from markdown if present
        const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || 
                         response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const extractedJson = jsonMatch[1] || jsonMatch[0];
          data = JSON.parse(extractedJson.trim());
          debugService.success('ai', '📑 Extracted JSON parsing worked');
        }
      }
      
      if (data && data.parts && Array.isArray(data.parts) && data.parts.length > 0) {
        debugService.success('ai', `📑 Successfully parsed ${data.parts.length} story parts`);
        return data.parts;
      } else {
        debugService.error('ai', '📑 Failed to parse story parts', {
          hasData: !!data,
          hasParts: !!(data && data.parts),
          isArray: !!(data && Array.isArray(data.parts)),
          partsLength: data && data.parts ? data.parts.length : 0
        });
        throw new Error('Could not parse any valid story parts from AI response');
      }
    } catch (error) {
      debugService.error('ai', `📑 Segmentation parsing error: ${error}`, { response: response.slice(0, 500) });
      throw error;
    }
  }

  private async executeShotTask(task: QueueTask, node: any, model: string): Promise<any> {
    // This would handle shot list creation
    const { SYSTEM_PROMPTS } = await import('./aiPipeline');
    
    // Debug to in-app console - show exactly what we have
    debugService.info('ai', '🎬 SHOT TASK DATA:', {
      hasStory: !!task.data?.story,
      hasStoryPart: !!task.data?.storyPart,
      storyKeys: task.data?.story ? Object.keys(task.data.story) : [],
      storyContent: task.data?.story?.content ? `${task.data.story.content.length} chars` : 'UNDEFINED',
      partContent: task.data?.storyPart?.content ? `${task.data.storyPart.content.length} chars` : 'UNDEFINED',
      partNumber: task.data?.partNumber,
      totalParts: task.data?.totalParts,
      startingShotNumber: task.data?.startingShotNumber,
      fullData: task.data
    });
    
    // Use story part if available, otherwise use full story
    const contentToProcess = task.data?.storyPart?.content || task.data.story?.content || 'NO CONTENT PROVIDED';
    const isPartMode = !!task.data?.storyPart;
    
    let prompt = `Story Title: ${task.data.story?.title || 'Untitled'}
Genre: ${task.data.story?.genre || 'Unknown'}
Length: ${task.data?.length || 'Medium'}`;

    if (isPartMode) {
      prompt += `
Part: ${task.data.partNumber}/${task.data.totalParts} - ${task.data.storyPart.title}
Starting Shot Number: ${task.data.startingShotNumber}

Story Part Content:
${contentToProcess}

IMPORTANT: This is part ${task.data.partNumber} of ${task.data.totalParts}. Generate shots starting from shot number ${task.data.startingShotNumber}. Ensure shot transitions work with previous and next parts.`;
    } else {
      prompt += `

Story Content:
${contentToProcess}`;
    }

    debugService.info('ai', '🎬 Calling AI for shot breakdown:', {
      promptLength: prompt.length,
      hasStoryContent: !!task.data.story?.content
    });
    
    const response = await this.callAI(node, model, SYSTEM_PROMPTS.shot_list_creator, prompt, task.id);
    
    // Debug response to in-app console
    if (response.length < 500) {
      debugService.warn('ai', '🎬 SHORT SHOT RESPONSE - Possible error:', {
        responseLength: response.length,
        fullResponse: response,
        containsJSON: response.includes('{') && response.includes('}'),
        containsShots: response.includes('shots')
      });
    } else {
      debugService.info('ai', '🎬 Shot breakdown response received:', {
        responseLength: response.length,
        preview: response.slice(0, 200),
        containsJSON: response.includes('{') && response.includes('}'),
        containsShots: response.includes('shots')
      });
    }
    
    try {
      // The prompt should generate clean JSON - try direct parsing first
      let data = null;
      
      debugService.info('ai', '🎬 Attempting direct JSON parsing', {
        responseLength: response.length,
        responsePreview: response.slice(0, 200),
        startsWithBrace: response.trim().startsWith('{'),
        endsWithBrace: response.trim().endsWith('}')
      });
      
      try {
        data = JSON.parse(response.trim());
        debugService.success('ai', '🎬 SUCCESS: Direct JSON parsing worked');
      } catch (e: any) {
        debugService.warn('ai', '🎬 Direct JSON parsing failed, trying fallback', { error: e.message });
        
        // Fallback: Try to complete truncated JSON
        if (response.trim().startsWith('{') && !response.trim().endsWith('}')) {
          debugService.info('ai', '🎬 Attempting to complete truncated JSON');
          
          // Find the start of the shots array and extract complete shots
          const shotsMatch = response.match(/"shots"\s*:\s*\[([\s\S]*)/); 
          if (shotsMatch) {
            const shotsContent = shotsMatch[1];
            const completeShots = [];
            
            // Split by shot objects and parse complete ones
            const shotBlocks = shotsContent.split(/\},\s*\{/);
            
            for (let i = 0; i < shotBlocks.length; i++) {
              let shotJson = shotBlocks[i].trim();
              
              // Add missing braces
              if (i === 0) {
                shotJson = '{' + shotJson;
              } else if (i === shotBlocks.length - 1) {
                shotJson = '{' + shotJson;
                // Don't add closing brace for last incomplete shot
                if (!shotJson.includes('"music_cue"')) continue;
              } else {
                shotJson = '{' + shotJson + '}';
              }
              
              try {
                const shot = JSON.parse(shotJson + '}');
                if (shot.shot_number && shot.description) {
                  completeShots.push(shot);
                }
              } catch (e) {
                debugService.warn('ai', `🎬 Skipped incomplete shot ${i + 1}`);
                break; // Stop at first unparseable shot
              }
            }
            
            if (completeShots.length > 0) {
              data = { shots: completeShots };
              debugService.success('ai', `🎬 SUCCESS: Recovered ${completeShots.length} complete shots from truncated response`);
            }
          }
        }
        
        // Final fallback: Extract JSON from markdown if present
        if (!data) {
          const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || 
                           response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const extractedJson = jsonMatch[1] || jsonMatch[0];
            debugService.info('ai', '🎬 Extracted JSON from formatting', {
              extractedLength: extractedJson.length,
              extractedPreview: extractedJson.slice(0, 200)
            });
            
            try {
              data = JSON.parse(extractedJson.trim());
              debugService.success('ai', '🎬 SUCCESS: Extracted JSON parsing worked');
            } catch (e2: any) {
              debugService.error('ai', '🎬 FAILED: Extracted JSON parsing error', { error: e2.message });
            }
          }
        }
      }
      
      // Strategy 3: Parse structured text response
      if (!data || !data.shots || data.shots.length === 0) {
        console.log('🎬 executeShotTask: Attempting to parse structured text');
        const shots = [];
        const lines = response.split('\n');
        let currentShot: any = null;
        
        for (const line of lines) {
          const trimmed = line.trim();
          
          // Look for shot markers like "Shot 1:", "SHOT 1:", "1.", "Shot #1", etc.
          const shotMatch = trimmed.match(/^(?:shot\s*#?\s*)?(\d+)[.:\s-]|^(\d+)\./i);
          if (shotMatch) {
            if (currentShot) {
              shots.push(currentShot);
            }
            const shotNumber = parseInt(shotMatch[1] || shotMatch[2]);
            currentShot = {
              shot_number: shotNumber,
              description: trimmed.replace(/^[^:]+[:.]\s*/, '').trim(),
              duration: 2,
              camera: 'medium shot',
              narration: ''
            };
          } else if (currentShot && trimmed) {
            // Parse shot properties
            const lowerTrimmed = trimmed.toLowerCase();
            
            if (lowerTrimmed.includes('duration:')) {
              const durationMatch = trimmed.match(/duration:\s*(\d+(?:\.\d+)?)/i);
              if (durationMatch) {
                currentShot.duration = parseFloat(durationMatch[1]);
              }
            } else if (lowerTrimmed.includes('camera:') || lowerTrimmed.includes('shot type:')) {
              const cameraMatch = trimmed.match(/(?:camera|shot type):\s*(.+)/i);
              if (cameraMatch) {
                currentShot.camera = cameraMatch[1].trim();
              }
            } else if (lowerTrimmed.includes('narration:') || lowerTrimmed.includes('dialogue:')) {
              const narrationMatch = trimmed.match(/(?:narration|dialogue):\s*(.+)/i);
              if (narrationMatch) {
                currentShot.narration = narrationMatch[1].trim();
              }
            } else if (lowerTrimmed.includes('description:')) {
              const descMatch = trimmed.match(/description:\s*(.+)/i);
              if (descMatch) {
                currentShot.description = descMatch[1].trim();
              }
            } else if (!lowerTrimmed.includes(':') && !lowerTrimmed.startsWith('-')) {
              // If no property indicator, append to description
              currentShot.description = (currentShot.description + ' ' + trimmed).trim();
            }
          }
        }
        
        // Add the last shot if exists
        if (currentShot) {
          shots.push(currentShot);
        }
        
        if (shots.length > 0) {
          data = { shots };
          console.log('🎬 executeShotTask: Parsed', shots.length, 'shots from structured text');
        }
      }
      
      // Validate and format the shots
      if (data && data.shots && Array.isArray(data.shots) && data.shots.length > 0) {
        const shots = data.shots.map((shot: any, index: number) => ({
          id: `shot_${Date.now()}_${index}`,
          storyId: task.data.story.id,
          shotNumber: shot.shot_number || shot.shotNumber || index + 1,
          description: shot.description || shot.content || `Shot ${index + 1}`,
          duration: parseFloat(shot.duration) || 2,
          frames: shot.frames || Math.floor((parseFloat(shot.duration) || 2) * 24),
          camera: shot.camera || shot.camera_angle || shot.shot_type || 'medium shot',
          narration: shot.narration || shot.dialogue || '',
          musicCue: shot.music_cue === null || shot.music_cue === '' ? null : (shot.music_cue || shot.musicCue || null),
          renderStatus: 'pending' as const,
          visualPrompt: ''
        }));
        
        console.log('🎬 executeShotTask: Successfully formatted', shots.length, 'shots');
        console.log('🎬 executeShotTask: First shot:', shots[0]);
        return shots;
      } else {
        // Log what we got for debugging
        debugService.error('ai', '🎬 Failed to parse shots. Data structure:', {
          hasData: !!data,
          hasShots: !!(data && data.shots),
          isArray: !!(data && Array.isArray(data.shots)),
          length: data && data.shots ? data.shots.length : 0,
          dataType: typeof data,
          dataString: JSON.stringify(data).slice(0, 500),
          responsePreview: response.slice(0, 1000)
        });
        // If we still couldn't parse any shots, throw an error to trigger retry
        throw new Error(`Could not parse any valid shots from AI response. Data: ${JSON.stringify(data).slice(0, 200)}`);
      }
    } catch (error) {
      console.error('🎬 executeShotTask: Error parsing response:', error);
      console.error('🎬 executeShotTask: Raw response was:', response);
      
      // Re-throw the error to trigger retry logic
      throw error;
    }
  }

  private async executeCharacterTask(task: QueueTask, node: any, model: string): Promise<any> {
    const { SYSTEM_PROMPTS } = await import('./aiPipeline');
    
    const prompt = `Story: ${task.data.story.title}
Genre: ${task.data.story.genre}

${task.data.story.content}

Analyze all characters and provide detailed style sheet information for visual consistency.
For each character, include:
1. Physical appearance (height, build, hair, eyes, skin tone, age)
2. Distinctive features (scars, tattoos, accessories)
3. Clothing style and colors
4. Personality traits that affect appearance
5. Importance level (1-5, where 5 is protagonist)
6. Estimated screen time in seconds
7. Visual reference prompt for AI generation`;

    console.log('👥 executeCharacterTask: Calling AI for character analysis');
    const response = await this.callAI(node, model, SYSTEM_PROMPTS.character_analyzer, prompt, task.id);
    console.log('👥 executeCharacterTask: Response length:', response.length);
    
    try {
      // Parse JSON response
      const jsonStart = response.indexOf('{');
      const jsonEnd = response.lastIndexOf('}') + 1;
      
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        const jsonResponse = response.slice(jsonStart, jsonEnd);
        console.log('👥 executeCharacterTask: Attempting to parse JSON');
        const data = JSON.parse(jsonResponse);
        
        if (!data.characters || !Array.isArray(data.characters)) {
          console.error('👥 executeCharacterTask: No characters array found');
          throw new Error('Invalid character list format');
        }
        
        const characters = data.characters.map((char: any, index: number) => ({
          id: `char_${Date.now()}_${index}`,
          storyId: task.data.story.id,
          name: char.name || `Character ${index + 1}`,
          role: char.role || 'supporting',
          physicalDescription: char.physical_description || char.physicalDescription || '',
          age: char.age_range || char.age || 'adult',
          gender: char.gender || 'unspecified',
          clothing: char.clothing_style || char.clothing || '',
          distinctiveFeatures: char.distinctive_features || char.distinctiveFeatures || [],
          personality: char.personality_traits || char.personality || '',
          importanceLevel: char.importance_level || char.importanceLevel || 3,
          screenTime: char.screen_time || char.screenTime || 0,
          visualPrompt: char.visual_prompt || char.visualPrompt || `${char.name || 'Character'}: ${char.physical_description || ''}`,
          createdAt: new Date()
        }));
        
        console.log('👥 executeCharacterTask: Successfully parsed', characters.length, 'characters');
        return characters;
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (error) {
      console.error('👥 executeCharacterTask: Error parsing response:', error);
      
      // Return fallback characters
      return [
        {
          id: `char_${Date.now()}_0`,
          storyId: task.data.story.id,
          name: 'Main Character',
          role: 'protagonist',
          physicalDescription: 'To be defined',
          age: 'adult',
          gender: 'unspecified',
          clothing: '',
          distinctiveFeatures: [],
          personality: '',
          importanceLevel: 5,
          screenTime: 60,
          visualPrompt: 'Main character of the story',
          createdAt: new Date()
        }
      ];
    }
  }

  private async executePromptTask(task: QueueTask, node: any, model: string): Promise<any> {
    const { SYSTEM_PROMPTS } = await import('./aiPipeline');
    
    let prompt = `Shot: ${task.data.shot.description}
Duration: ${task.data.shot.duration}s
Shot #${task.data.shot.shotNumber}
Shot Type: ${task.data.shot.shotType || 'medium'}
Camera Angle: ${task.data.shot.angle || 'eye-level'}`;

    if (task.data.characters && task.data.characters.length > 0) {
      prompt += `\n\nCharacter Style Sheet:`;
      task.data.characters.forEach((char: any) => {
        const desc = char.physical_description || char.physicalDescription || 'no description';
        const age = char.age_range || char.age || 'adult';
        const clothing = char.clothing || char.clothingStyle || '';
        prompt += `\n- ${char.name} (${char.role}): ${desc}, ${age}`;
        if (clothing) prompt += `, wearing ${clothing}`;
        if (char.distinctiveFeatures && char.distinctiveFeatures.length > 0) {
          prompt += `, distinctive: ${char.distinctiveFeatures.join(', ')}`;
        }
      });
    }

    const response = await this.callAI(node, model, SYSTEM_PROMPTS.prompt_engineer, prompt, task.id);
    
    // Extract positive prompt
    if (response.includes('Positive:')) {
      const parts = response.split('Positive:')[1];
      if (parts) {
        const positive = parts.split('Negative:')[0]?.trim();
        if (positive) return positive;
      }
    }
    
    return response.split('\n')[0]?.trim() || response.trim();
  }

  private async executeComfyUIPromptTask(task: QueueTask, node: any, model: string): Promise<any> {
    console.log('🎨 executeComfyUIPromptTask called for shot:', task.data.shotNumber);
    
    const { SYSTEM_PROMPTS } = await import('./aiPipeline');
    
    // Extract important shot details with defaults
    const shotType = task.data.shot.shotType || 'medium shot';
    const angle = task.data.shot.angle || 'eye-level';
    const cameraMovement = task.data.shot.cameraMovement || 'static';
    
    let prompt = `Generate ComfyUI-optimized positive and negative prompts for this cinematic shot:

Shot Details:
- Shot #${task.data.shotNumber}
- Description: ${task.data.shot.description}
- Duration: ${task.data.shot.duration}s
- Shot Type: ${shotType}
- Camera Angle: ${angle}
- Camera Movement: ${cameraMovement}`;

    // Add character descriptions if available
    if (task.data.characters && task.data.characters.length > 0) {
      prompt += `\n\nCharacters in this shot:`;
      task.data.characters.forEach((char: any) => {
        const description = char.physical_description || char.physicalDescription || 'no description';
        const age = char.age_range || char.age || 'adult';
        prompt += `\n- ${char.name} (${char.role}): ${description}, ${age}`;
        if (char.clothing) prompt += `, wearing ${char.clothing}`;
        if (char.distinctiveFeatures && char.distinctiveFeatures.length > 0) {
          prompt += `, features: ${char.distinctiveFeatures.join(', ')}`;
        }
      });
    }
    
    // Add location info if available
    if (task.data.shot.locations && task.data.shot.locations.length > 0) {
      prompt += `\n\nLocations: ${task.data.shot.locations.join(', ')}`;
    }

    prompt += `\n\nGenerate both positive and negative prompts optimized for ComfyUI/Stable Diffusion image generation.

IMPORTANT GUIDELINES FOR HIGH-QUALITY PROMPTS:

Positive Prompt Requirements:
1. Start with the main subject and action
2. Include cinematic descriptors: "cinematic lighting", "professional cinematography", "film grain", "color grading"
3. Specify the shot composition: "${shotType}", "${angle} angle"
4. Add quality markers: "masterpiece", "best quality", "highly detailed", "8k", "photorealistic"
5. Include atmosphere and mood descriptors
6. Describe character appearances consistently and in detail
7. Add environmental and lighting details
8. Use style tags if needed (e.g., "cyberpunk", "fantasy", "noir")

Negative Prompt Requirements:
1. Exclude common AI artifacts: "deformed", "distorted", "mutation", "bad anatomy"
2. Prevent quality issues: "blurry", "low quality", "pixelated", "jpeg artifacts"
3. Avoid unwanted elements: "watermark", "text", "logo", "signature", "username"
4. Fix anatomical problems: "extra limbs", "missing limbs", "bad hands", "bad face", "extra fingers"
5. Prevent composition issues: "cropped", "out of frame", "duplicate"

Format your response as JSON:
{
  "positive": "[detailed positive prompt with all visual elements, maximum 200 words]",
  "negative": "[comprehensive negative prompt listing all exclusions, maximum 150 words]"
}

Or use plain text format:
POSITIVE: [detailed positive prompt]
NEGATIVE: [comprehensive negative prompt]`;

    console.log('🎨 Calling AI for ComfyUI prompts...');
    const response = await this.callAI(node, model, SYSTEM_PROMPTS.comfyui_prompt_generator, prompt, task.id);
    console.log('🎨 ComfyUI prompt response received');
    console.log('🎨 Raw response:', response.substring(0, 200) + '...');
    
    // Parse the response to extract positive and negative prompts
    let positivePrompt = '';
    let negativePrompt = '';
    
    try {
      // First try JSON parsing
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        console.log('🎨 Attempting JSON parsing...');
        const jsonData = JSON.parse(jsonMatch[0]);
        if (jsonData.positive) {
          positivePrompt = jsonData.positive.trim();
        }
        if (jsonData.negative) {
          negativePrompt = jsonData.negative.trim();
        }
        console.log('🎨 JSON parsing successful');
      }
    } catch (error) {
      console.log('🎨 JSON parsing failed, trying text parsing...');
    }
    
    // If JSON parsing failed, try text parsing
    if (!positivePrompt || !negativePrompt) {
      // More flexible text parsing
      const patterns = [
        { pos: /POSITIVE:\s*(.+?)(?=NEGATIVE:|$)/is, neg: /NEGATIVE:\s*(.+?)$/is },
        { pos: /Positive:\s*(.+?)(?=Negative:|$)/is, neg: /Negative:\s*(.+?)$/is },
        { pos: /\*\*Positive\*\*:\s*(.+?)(?=\*\*Negative\*\*:|$)/is, neg: /\*\*Negative\*\*:\s*(.+?)$/is },
        { pos: /positive prompt:\s*(.+?)(?=negative prompt:|$)/is, neg: /negative prompt:\s*(.+?)$/is }
      ];
      
      for (const pattern of patterns) {
        if (!positivePrompt) {
          const posMatch = response.match(pattern.pos);
          if (posMatch) {
            positivePrompt = posMatch[1].trim();
          }
        }
        if (!negativePrompt) {
          const negMatch = response.match(pattern.neg);
          if (negMatch) {
            negativePrompt = negMatch[1].trim();
          }
        }
        if (positivePrompt && negativePrompt) break;
      }
    }
    
    // Clean up quotes and extra formatting
    positivePrompt = positivePrompt.replace(/^["']|["']$/g, '').trim();
    negativePrompt = negativePrompt.replace(/^["']|["']$/g, '').trim();
    
    // Enhanced fallback if parsing still fails
    if (!positivePrompt) {
      console.log('🎨 Using enhanced fallback positive prompt');
      const shotType = task.data.shot.shotType || 'medium shot';
      const angle = task.data.shot.angle || 'eye-level';
      const baseDescription = task.data.shot.description || 'cinematic scene';
      
      // Build a comprehensive fallback prompt
      positivePrompt = `cinematic ${shotType}, ${angle} angle, ${baseDescription}, professional cinematography, dramatic lighting, film grain, cinematic color grading, depth of field, highly detailed, photorealistic, 8k resolution, ultra quality, masterpiece, best quality, award winning photography`;
      
      // Add character descriptions if available
      if (task.data.characters && task.data.characters.length > 0) {
        const charDescriptions = task.data.characters.map((char: any) => {
          const desc = char.physical_description || char.physicalDescription || 'person';
          return `${char.name}: ${desc}`;
        }).join(', ');
        positivePrompt += `, featuring ${charDescriptions}`;
      }
    }
    
    if (!negativePrompt) {
      console.log('🎨 Using comprehensive fallback negative prompt');
      // Comprehensive negative prompt covering all common issues
      negativePrompt = 'blurry, low quality, low resolution, pixelated, jpeg artifacts, compression artifacts, ' +
                      'distorted, deformed, disfigured, ugly, bad anatomy, wrong anatomy, ' +
                      'extra limb, missing limb, floating limbs, disconnected limbs, ' +
                      'mutation, mutated, disgusting, amputation, ' +
                      'bad hands, missing hands, extra hands, poorly drawn hands, malformed hands, ' +
                      'bad fingers, missing fingers, extra fingers, poorly drawn fingers, fused fingers, too many fingers, ' +
                      'bad face, ugly face, poorly drawn face, deformed face, ' +
                      'bad eyes, missing eyes, extra eyes, crossed eyes, lazy eye, asymmetrical eyes, ' +
                      'watermark, text, logo, signature, username, artist name, ' +
                      'cropped, out of frame, cut off, duplicate, clone, ' +
                      'gross proportions, malformed limbs, long neck, ' +
                      'worst quality, normal quality, low quality, lowres';
    }
    
    const result = {
      positivePrompt,
      negativePrompt,
      shotNumber: task.data.shotNumber
    };
    
    console.log('🎨 Parsed ComfyUI prompts:');
    console.log('🎨 Positive:', positivePrompt.substring(0, 100) + '...');
    console.log('🎨 Negative:', negativePrompt.substring(0, 100) + '...');
    
    console.log('🎨 Returning ComfyUI prompts:', { 
      positive: result.positivePrompt.slice(0, 50) + '...',
      negative: result.negativePrompt.slice(0, 50) + '...'
    });
    
    return result;
  }

  private async executeNarrationTask(task: QueueTask, node: any, model: string): Promise<any> {
    const { SYSTEM_PROMPTS } = await import('./aiPipeline');
    
    const prompt = `Shot: ${task.data.shot.description}
Duration: ${task.data.shot.duration}s
Existing narration: ${task.data.shot.narration}
Shot #${task.data.shot.shotNumber}`;

    const response = await this.callAI(node, model, SYSTEM_PROMPTS.narration_writer, prompt, task.id);
    return response.replace(/<think>.*?<\/think>/gs, '').trim();
  }

  private async executeMusicTask(task: QueueTask, node: any, model: string): Promise<any> {
    const { SYSTEM_PROMPTS } = await import('./aiPipeline');
    
    const prompt = `Shot: ${task.data.shot.description}
Music: ${task.data.shot.musicCue}
Duration: ${task.data.shot.duration}s
Shot #${task.data.shot.shotNumber}`;

    const response = await this.callAI(node, model, SYSTEM_PROMPTS.music_director, prompt, task.id);
    return response.replace(/<think>.*?<\/think>/gs, '').trim();
  }

  private async callAI(node: any, model: string, systemPrompt: string, userPrompt: string, taskId?: string): Promise<string> {
    // Extract story ID and task type for logging
    const task = taskId ? this.tasks.get(taskId) : null;
    const storyId = task?.storyId || 'unknown';
    const stepType = task?.type || 'unknown';

    // Send prompt to progress callback for debugging
    const progressCallback = taskId ? this.progressCallbacks.get(taskId) : null;
    if (progressCallback) {
      progressCallback({
        taskId: taskId!,
        status: 'ai_request',
        node: node.id || node.host,
        model: model,
        systemPrompt: systemPrompt,
        userPrompt: userPrompt,
        timestamp: new Date().toISOString()
      });
    }

    // Log the request
    aiLogService.addLog(storyId, {
      type: 'request',
      step: stepType,
      model: model,
      node: node?.name || node?.host || 'unknown',
      prompt: userPrompt,
      metadata: { systemPrompt: systemPrompt.slice(0, 200) }
    });

    let response: string;
    try {
      if (node.type === 'ollama') {
        response = await this.callOllama(node, model, systemPrompt, userPrompt);
      } else if (node.type === 'openai') {
        response = await this.callOpenAI(model, systemPrompt, userPrompt);
      } else if (node.type === 'claude') {
        response = await this.callClaude(model, systemPrompt, userPrompt);
      } else {
        throw new Error(`Unsupported node type: ${node.type}`);
      }

      // Log the successful response
      aiLogService.addLog(storyId, {
        type: 'response',
        step: stepType,
        model: model,
        node: node?.name || node?.host || 'unknown',
        response: response,
        metadata: { responseLength: response.length }
      });

      // Send response to progress callback for debugging
      if (progressCallback) {
        progressCallback({
          taskId: taskId!,
          status: 'ai_response',
          node: node.id || node.host,
          model: model,
          response: response,
          timestamp: new Date().toISOString()
        });
      }

      return response;
    } catch (error: any) {
      // Log the error
      aiLogService.addLog(storyId, {
        type: 'error',
        step: stepType,
        model: model,
        node: node?.name || node?.host || 'unknown',
        error: error.message,
        metadata: { error }
      });
      throw error;
    }
  }

  private async callOllama(node: any, model: string, systemPrompt: string, userPrompt: string): Promise<string> {
    const timestamp = new Date().toISOString();
    debugService.info('ai', `🤖 ===== CALLING OLLAMA =====`);
    debugService.info('ai', `Node: ${node.host}:${node.port}, Model: ${model}`, {
      node: `${node.host}:${node.port}`,
      model,
      systemPrompt: systemPrompt.slice(0, 200) + '...',
      userPrompt: userPrompt.slice(0, 300) + '...',
      timestamp
    });
    
    const requestBody = {
      model: model,
      system: systemPrompt,
      prompt: userPrompt,
      stream: false,
      options: {
        temperature: 0.7,
        top_p: 0.9,
        num_predict: 8192  // Increase max tokens for longer shot list responses
      }
    };
    
    console.log(`🤖 [${timestamp}] Request Body:`, JSON.stringify(requestBody, null, 2));
    
    const response = await fetch(`http://${node.host}:${node.port}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`🤖 [${timestamp}] Ollama request failed: ${response.status} ${response.statusText}`);
      console.error(`🤖 [${timestamp}] Error response:`, errorText);
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const responseTimestamp = new Date().toISOString();
    debugService.success('ai', `✅ ===== OLLAMA RESPONSE RECEIVED =====`);
    debugService.success('ai', `Response received: ${data.response.length} characters`, {
      fullResponse: data.response,
      responseLength: data.response.length,
      preview: data.response.slice(0, 200) + '...',
      timestamp: responseTimestamp
    });
    
    return data.response;
  }

  private async callOpenAI(model: string, systemPrompt: string, userPrompt: string): Promise<string> {
    const timestamp = new Date().toISOString();
    debugService.info('ai', `🤖 ===== CALLING OPENAI =====`);
    debugService.info('ai', `OpenAI Model: ${model}`, {
      model,
      systemPrompt: systemPrompt.slice(0, 200) + '...',
      userPrompt: userPrompt.slice(0, 300) + '...',
      timestamp
    });
    
    const apiKey = nodeDiscoveryService.getAPIKey('openai');
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const requestBody = {
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    };
    
    console.log(`🤖 [${timestamp}] Request Body:`, JSON.stringify(requestBody, null, 2));

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`🤖 [${timestamp}] OpenAI request failed: ${response.status} ${response.statusText}`);
      console.error(`🤖 [${timestamp}] Error response:`, errorText);
      throw new Error(`OpenAI request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const responseTimestamp = new Date().toISOString();
    const responseContent = data.choices[0].message.content;
    debugService.success('ai', `✅ ===== OPENAI RESPONSE RECEIVED =====`);
    debugService.success('ai', `OpenAI response: ${responseContent.length} characters`, {
      fullResponse: responseContent,
      responseLength: responseContent.length,
      preview: responseContent.slice(0, 200) + '...',
      timestamp: responseTimestamp
    });
    
    return responseContent;
  }

  private async callClaude(model: string, systemPrompt: string, userPrompt: string): Promise<string> {
    const timestamp = new Date().toISOString();
    debugService.info('ai', `🤖 ===== CALLING CLAUDE =====`);
    debugService.info('ai', `Claude Model: ${model}`, {
      model,
      systemPrompt: systemPrompt.slice(0, 200) + '...',
      userPrompt: userPrompt.slice(0, 300) + '...',
      timestamp
    });
    
    const apiKey = nodeDiscoveryService.getAPIKey('claude');
    if (!apiKey) {
      throw new Error('Claude API key not configured');
    }

    const requestBody = {
      model: model,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ],
    };
    
    console.log(`🤖 [${timestamp}] Request Body:`, JSON.stringify(requestBody, null, 2));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`🤖 [${timestamp}] Claude request failed: ${response.status} ${response.statusText}`);
      console.error(`🤖 [${timestamp}] Error response:`, errorText);
      throw new Error(`Claude request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const responseTimestamp = new Date().toISOString();
    const responseContent = data.content[0].text;
    debugService.success('ai', `✅ ===== CLAUDE RESPONSE RECEIVED =====`);
    debugService.success('ai', `Claude response: ${responseContent.length} characters`, {
      fullResponse: responseContent,
      responseLength: responseContent.length,
      preview: responseContent.slice(0, 200) + '...',
      timestamp: responseTimestamp
    });
    
    return responseContent;
  }

  private handleTaskError(task: QueueTask, error: Error, queue: ProcessingQueue) {
    task.attempts++;
    
    if (task.attempts < task.maxAttempts) {
      // Retry the task
      console.log(`🔄 Retrying task ${task.id} (attempt ${task.attempts}/${task.maxAttempts})`);
      task.status = 'pending';
      task.assignedNode = undefined;
      task.assignedModel = undefined;
      queue.tasks.push(task);
      this.sortQueueByPriority(queue);
    } else {
      // Mark as failed
      task.status = 'failed';
      task.completedAt = new Date();
      task.error = error.message;
      
      // Update node stats if assigned
      if (task.assignedNode) {
        const stats = this.getOrCreateNodeStats(task.assignedNode);
        stats.currentTasks--;
        stats.failedTasks++;
      }
      
      // Notify error callback
      const errorCallback = this.errorCallbacks.get(task.id);
      if (errorCallback) {
        errorCallback(error);
      }
      
      // Clean up callbacks after error
      this.taskCallbacks.delete(task.id);
      this.errorCallbacks.delete(task.id);
      this.progressCallbacks.delete(task.id);
      
      console.error(`❌ Task ${task.id} failed after ${task.maxAttempts} attempts:`, error.message);
    }
  }

  public getQueueStatus(): Map<string, ProcessingQueue> {
    return new Map(this.queues);
  }

  public getNodeStats(): Map<string, NodeUsageStats> {
    return new Map(this.nodeStats);
  }

  public getTaskStatus(taskId: string): QueueTask | undefined {
    return this.tasks.get(taskId);
  }

  public cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status === 'completed' || task.status === 'failed') {
      return false;
    }

    task.status = 'failed';
    task.error = 'Cancelled by user';
    task.completedAt = new Date();

    // Remove from queue if pending
    const queuesArray = Array.from(this.queues.values());
    for (const queue of queuesArray) {
      const index = queue.tasks.findIndex((t: QueueTask) => t.id === taskId);
      if (index > -1) {
        queue.tasks.splice(index, 1);
      }
    }

    // Notify error callback
    const errorCallback = this.errorCallbacks.get(taskId);
    if (errorCallback) {
      errorCallback(new Error('Task cancelled'));
    }

    return true;
  }

  public clearCompleted() {
    // Remove completed tasks older than 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const tasksArray = Array.from(this.tasks.entries());
    for (const [taskId, task] of tasksArray) {
      if (
        (task.status === 'completed' || task.status === 'failed') &&
        task.completedAt &&
        task.completedAt < oneHourAgo
      ) {
        this.tasks.delete(taskId);
        this.taskCallbacks.delete(taskId);
        this.errorCallbacks.delete(taskId);
        this.progressCallbacks.delete(taskId);
      }
    }
  }
}

export const nodeQueueManager = new NodeQueueManager();