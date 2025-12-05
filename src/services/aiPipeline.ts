import { QueueItem, ModelConfig, Shot, Character } from '../store/useStore';
import { nodeDiscoveryService, OllamaNode } from './nodeDiscovery';
import { EnhancedStory, AILogEntry } from '../types/storyTypes';
import { SYSTEM_PROMPTS } from './systemPrompts';

// Re-export SYSTEM_PROMPTS for backward compatibility
export { SYSTEM_PROMPTS };

// Use Character from store for now
type StoryCharacter = Character;

/**
 * @deprecated This file is deprecated. Use sequentialAiPipeline.ts instead.
 * The SYSTEM_PROMPTS have been moved to systemPrompts.ts
 * PipelineProgress and PipelineStep interfaces are kept for compatibility.
 */

export interface PipelineStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  nodeId?: string;
  model?: string;
  startTime?: Date;
  endTime?: Date;
  input?: string;
  output?: string;
  error?: string;
}

export interface PipelineProgress {
  storyId: string;
  queueItemId: string;
  currentStep: string;
  steps: PipelineStep[];
  overallProgress: number;
  logs: AILogEntry[];
}

class AIPipelineService {
  private progressCallbacks: Map<string, (progress: PipelineProgress) => void> = new Map();

  async processQueueItem(
    queueItem: QueueItem,
    modelConfigs: ModelConfig[],
    onProgress?: (progress: PipelineProgress) => void
  ): Promise<EnhancedStory> {
    if (onProgress) {
      this.progressCallbacks.set(queueItem.id, onProgress);
    }

    const progress: PipelineProgress = {
      storyId: queueItem.id,
      queueItemId: queueItem.id,
      currentStep: 'story',
      steps: this.initializePipelineSteps(queueItem, modelConfigs),
      overallProgress: 0,
      logs: []
    };

    try {
      // Determine required steps based on queue item configuration
      const requiredSteps = ['story', 'shots', 'characters', 'prompts'];
      
      // Validate model configurations
      this.validateModelConfigs(modelConfigs, requiredSteps);

      // Step 1: Generate Story
      const story = await this.generateStory(queueItem, modelConfigs, progress);
      
      // Step 2: Create Shot List
      const shots = await this.createShotList(story, queueItem, modelConfigs, progress);
      
      // Step 3: Analyze Characters
      const characters = await this.analyzeCharacters(story, modelConfigs, progress);
      
      // Step 4: Generate Visual Prompts
      await this.generateVisualPrompts(shots, characters, modelConfigs, progress);
      
      // Step 5: Generate Narration (if enabled)
      if (queueItem.config.narrationGeneration) {
        await this.generateNarration(shots, modelConfigs, progress);
      }
      
      // Step 6: Generate Music Cues (if enabled)
      if (queueItem.config.musicGeneration) {
        await this.generateMusicCues(shots, modelConfigs, progress);
      }

      // Create enhanced story object (cast to avoid type issues for now)
      const enhancedStory = {
        id: story.id,
        title: story.title,
        content: story.content,
        genre: queueItem.config.genre,
        length: queueItem.config.length,
        characters: characters,
        shots: shots,
        status: 'completed' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      } as unknown as EnhancedStory;

      this.completeStep(progress, 'completed');
      this.notifyProgress(progress);

      return enhancedStory;

    } catch (error) {
      this.handleError(progress, error as Error);
      throw error;
    } finally {
      this.progressCallbacks.delete(queueItem.id);
    }
  }

  private validateModelConfigs(modelConfigs: ModelConfig[], requiredSteps: string[]): void {
    const enabledSteps = modelConfigs.filter(config => config.enabled);
    
    if (enabledSteps.length === 0) {
      throw new Error('No model configurations enabled. Please configure models in Settings.');
    }

    const missingSteps = requiredSteps.filter(step => 
      !enabledSteps.some(config => config.step === step)
    );

    if (missingSteps.length > 0) {
      throw new Error(`Missing required model configurations: ${missingSteps.join(', ')}`);
    }

    // Check that at least one node is available for each required step
    const unavailableSteps: string[] = [];
    
    for (const step of requiredSteps) {
      const stepConfigs = enabledSteps.filter(config => config.step === step);
      let hasAvailableNode = false;
      
      for (const config of stepConfigs) {
        const node = nodeDiscoveryService.getNode(config.nodeId);
        if (node && node.status === 'online' && node.models.includes(config.model)) {
          hasAvailableNode = true;
          break;
        }
      }
      
      if (!hasAvailableNode) {
        unavailableSteps.push(step);
      }
    }

    if (unavailableSteps.length > 0) {
      throw new Error(`No available nodes for steps: ${unavailableSteps.join(', ')}. Please check node connectivity and model availability.`);
    }
  }

  private initializePipelineSteps(queueItem: QueueItem, modelConfigs: ModelConfig[]): PipelineStep[] {
    const steps: PipelineStep[] = [
      { id: 'story', name: 'Story Generation', status: 'pending' },
      { id: 'shots', name: 'Shot Breakdown', status: 'pending' },
      { id: 'characters', name: 'Character Analysis', status: 'pending' },
      { id: 'prompts', name: 'Visual Prompt Generation', status: 'pending' }
    ];

    // Only add optional steps if enabled in queue config and model configs exist
    if (queueItem.config.narrationGeneration && modelConfigs.some(c => c.enabled && c.step === 'narration')) {
      steps.push({ id: 'narration', name: 'Narration Generation', status: 'pending' });
    }

    if (queueItem.config.musicGeneration && modelConfigs.some(c => c.enabled && c.step === 'music')) {
      steps.push({ id: 'music', name: 'Music Cue Generation', status: 'pending' });
    }

    return steps;
  }

  private async generateStory(
    queueItem: QueueItem,
    modelConfigs: ModelConfig[],
    progress: PipelineProgress
  ): Promise<any> {
    const step = this.startStep(progress, 'story', modelConfigs);
    
    const prompt = `Genre: ${queueItem.config.genre}
Length: ${queueItem.config.length}
Concept: ${queueItem.config.prompt}`;

    this.addLog(progress, {
      id: Date.now().toString(),
      timestamp: new Date(),
      step: 'story',
      level: 'info',
      message: `Generating story with prompt: ${prompt.slice(0, 100)}...`
    });

    try {
      const response = await this.callAI(step.nodeId!, step.model!, SYSTEM_PROMPTS.story_writer, prompt);
      
      // Parse the response to extract story data
      const story = this.parseStoryResponse(response, queueItem);
      
      this.completeStep(progress, 'story', JSON.stringify({ title: story.title, content: story.content.slice(0, 100) + '...' }));
      
      return story;
    } catch (error) {
      this.failStep(progress, 'story', (error as Error).message);
      throw error;
    }
  }

  private async createShotList(
    story: any,
    queueItem: QueueItem,
    modelConfigs: ModelConfig[],
    progress: PipelineProgress
  ): Promise<Shot[]> {
    const step = this.startStep(progress, 'shots', modelConfigs);
    
    const prompt = `Story: ${story.title}
Genre: ${story.genre}
Length: ${queueItem.config.length}

${story.content}`;

    this.addLog(progress, {
      id: Date.now().toString(),
      timestamp: new Date(),
      step: 'shots',
      level: 'info',
      message: `Creating shot list for story: ${story.title}`
    });

    try {
      const response = await this.callAI(step.nodeId!, step.model!, SYSTEM_PROMPTS.shot_list_creator, prompt);
      const shots = this.parseShotListResponse(response, story.id);
      
      this.completeStep(progress, 'shots', `Generated ${shots.length} shots`);
      
      return shots;
    } catch (error) {
      this.failStep(progress, 'shots', (error as Error).message);
      throw error;
    }
  }

  private async analyzeCharacters(
    story: any,
    modelConfigs: ModelConfig[],
    progress: PipelineProgress
  ): Promise<StoryCharacter[]> {
    const step = this.startStep(progress, 'characters', modelConfigs);
    
    const prompt = `Story: ${story.title}
Genre: ${story.genre}

${story.content}`;

    this.addLog(progress, {
      id: Date.now().toString(),
      timestamp: new Date(),
      step: 'characters',
      level: 'info',
      message: 'Analyzing characters and locations for consistency'
    });

    try {
      const response = await this.callAI(step.nodeId!, step.model!, SYSTEM_PROMPTS.character_analyzer, prompt);
      const analysisData = JSON.parse(this.cleanJSONResponse(response));
      
      const characters: StoryCharacter[] = analysisData.characters.map((char: any, index: number) => ({
        id: `char_${index}`,
        storyId: story.id,
        name: char.name,
        role: char.role,
        physicalDescription: char.physical_description,
        ageRange: char.age_range,
        clothingStyle: char.clothing_style,
        personalityTraits: char.personality_traits,
        importanceLevel: char.importance_level
      }));
      
      this.completeStep(progress, 'characters', `Analyzed ${characters.length} characters`);
      
      return characters;
    } catch (error) {
      this.failStep(progress, 'characters', (error as Error).message);
      throw error;
    }
  }

  private async generateVisualPrompts(
    shots: Shot[],
    characters: StoryCharacter[],
    modelConfigs: ModelConfig[],
    progress: PipelineProgress
  ): Promise<void> {
    const step = this.startStep(progress, 'prompts', modelConfigs);
    
    this.addLog(progress, {
      id: Date.now().toString(),
      timestamp: new Date(),
      step: 'prompts',
      level: 'info',
      message: `Generating visual prompts for ${shots.length} shots`
    });

    try {
      for (let i = 0; i < shots.length; i++) {
        const shot = shots[i];
        const relevantCharacters = this.findRelevantCharacters(shot, characters);
        
        const prompt = this.buildVisualPromptInput(shot, relevantCharacters);
        const response = await this.callAI(step.nodeId!, step.model!, SYSTEM_PROMPTS.prompt_engineer, prompt);
        
        shot.visualPrompt = this.parseVisualPromptResponse(response);
        
        // Update progress for this individual shot
        const shotProgress = Math.floor(((i + 1) / shots.length) * 100);
        this.addLog(progress, {
          id: Date.now().toString(),
          timestamp: new Date(),
          step: 'prompts',
          level: 'info',
          message: `Generated visual prompt for shot ${i + 1}/${shots.length} (${shotProgress}%)`
        });
      }
      
      this.completeStep(progress, 'prompts', `Generated visual prompts for ${shots.length} shots`);
    } catch (error) {
      this.failStep(progress, 'prompts', (error as Error).message);
      throw error;
    }
  }

  private async generateNarration(
    shots: Shot[],
    modelConfigs: ModelConfig[],
    progress: PipelineProgress
  ): Promise<void> {
    const step = this.startStep(progress, 'narration', modelConfigs);
    
    const shotsWithDialogue = shots.filter(shot => shot.narration && shot.narration.trim());
    
    this.addLog(progress, {
      id: Date.now().toString(),
      timestamp: new Date(),
      step: 'narration',
      level: 'info',
      message: `Processing narration for ${shotsWithDialogue.length} shots with dialogue`
    });

    try {
      for (const shot of shotsWithDialogue) {
        const prompt = `Shot: ${shot.description}
Duration: ${shot.duration}s
Existing narration: ${shot.narration}
Shot #${shot.shotNumber}`;

        const response = await this.callAI(step.nodeId!, step.model!, SYSTEM_PROMPTS.narration_writer, prompt);
        shot.narration = this.cleanAIResponse(response);
      }
      
      this.completeStep(progress, 'narration', `Processed narration for ${shotsWithDialogue.length} shots`);
    } catch (error) {
      this.failStep(progress, 'narration', (error as Error).message);
      throw error;
    }
  }

  private async generateMusicCues(
    shots: Shot[],
    modelConfigs: ModelConfig[],
    progress: PipelineProgress
  ): Promise<void> {
    const step = this.startStep(progress, 'music', modelConfigs);
    
    const shotsWithMusic = shots.filter(shot => shot.musicCue && shot.musicCue.trim());
    
    this.addLog(progress, {
      id: Date.now().toString(),
      timestamp: new Date(),
      step: 'music',
      level: 'info',
      message: `Generating music cues for ${shotsWithMusic.length} shots`
    });

    try {
      for (const shot of shotsWithMusic) {
        const prompt = `Shot: ${shot.description}
Music: ${shot.musicCue}
Duration: ${shot.duration}s
Shot #${shot.shotNumber}`;

        const response = await this.callAI(step.nodeId!, step.model!, SYSTEM_PROMPTS.music_director, prompt);
        shot.musicCue = this.cleanAIResponse(response);
      }
      
      this.completeStep(progress, 'music', `Generated music cues for ${shotsWithMusic.length} shots`);
    } catch (error) {
      this.failStep(progress, 'music', (error as Error).message);
      throw error;
    }
  }

  private async callAI(nodeId: string, model: string, systemPrompt: string, userPrompt: string): Promise<string> {
    const node = nodeDiscoveryService.getNode(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    if (node.type === 'ollama') {
      return this.callOllama(node, model, systemPrompt, userPrompt);
    } else if (node.type === 'openai') {
      return this.callOpenAI(model, systemPrompt, userPrompt);
    } else if (node.type === 'claude') {
      return this.callClaude(model, systemPrompt, userPrompt);
    }

    throw new Error(`Unsupported node type: ${node.type}`);
  }

  private async callOllama(node: OllamaNode, model: string, systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await fetch(`http://${node.host}:${node.port}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        system: systemPrompt,
        prompt: userPrompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  }

  private async callOpenAI(model: string, systemPrompt: string, userPrompt: string): Promise<string> {
    const apiKey = nodeDiscoveryService.getAPIKey('openai');
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  private async callClaude(model: string, systemPrompt: string, userPrompt: string): Promise<string> {
    const apiKey = nodeDiscoveryService.getAPIKey('claude');
    if (!apiKey) {
      throw new Error('Claude API key not configured');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  // Helper methods for parsing responses and managing progress
  private parseStoryResponse(response: string, queueItem: QueueItem): any {
    const cleanResponse = this.cleanAIResponse(response);
    const lines = cleanResponse.split('\n');
    
    let title = 'Untitled Story';
    let content = cleanResponse;
    
    // Extract title if present
    for (const line of lines) {
      if (line.toLowerCase().includes('title:')) {
        title = line.split(':', 1)[1].trim();
        break;
      }
    }
    
    return {
      id: `story_${Date.now()}`,
      title,
      content,
      genre: queueItem.config.genre,
      length: queueItem.config.length,
      createdAt: new Date()
    };
  }

  private parseShotListResponse(response: string, storyId: string): Shot[] {
    const cleanResponse = this.cleanJSONResponse(response);
    const data = JSON.parse(cleanResponse);
    
    return data.shots.map((shot: any, index: number) => ({
      id: `shot_${Date.now()}_${index}`,
      storyId,
      shotNumber: shot.shot_number,
      description: shot.description,
      duration: shot.duration,
      frames: shot.frames || Math.floor(shot.duration * 24),
      camera: shot.camera,
      narration: shot.narration || '',
      musicCue: shot.music_cue || null,
      renderStatus: 'pending' as const,
      visualPrompt: ''
    }));
  }

  private cleanAIResponse(response: string): string {
    // Remove <think> tags and other AI artifacts
    return response.replace(/<think>.*?<\/think>/gs, '').trim();
  }

  private cleanJSONResponse(response: string): string {
    const cleaned = this.cleanAIResponse(response);
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}') + 1;
    
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      return cleaned.slice(jsonStart, jsonEnd);
    }
    
    throw new Error('No valid JSON found in AI response');
  }

  private parseVisualPromptResponse(response: string): string {
    const cleaned = this.cleanAIResponse(response);
    
    // Extract positive prompt
    if (cleaned.includes('Positive:')) {
      const positive = cleaned.split('Positive:')[1].split('Negative:')[0].trim();
      return positive;
    }
    
    return cleaned.split('\n')[0].trim();
  }

  private findRelevantCharacters(shot: Shot, characters: StoryCharacter[]): StoryCharacter[] {
    const shotDesc = shot.description.toLowerCase();
    return characters.filter(char => 
      shotDesc.includes(char.name.toLowerCase()) ||
      shotDesc.includes(char.role.toLowerCase())
    );
  }

  private buildVisualPromptInput(shot: Shot, characters: StoryCharacter[]): string {
    let prompt = `Shot: ${shot.description}
Duration: ${shot.duration}s
Shot #${shot.shotNumber}`;

    if (characters.length > 0) {
      prompt += `\n\nCharacter Descriptions:`;
      characters.forEach(char => {
        prompt += `\n- ${char.name} (${char.role}): ${char.physical_description}, ${char.age_range}`;
      });
    }

    return prompt;
  }

  private startStep(progress: PipelineProgress, stepId: string, modelConfigs: ModelConfig[]): PipelineStep {
    const stepConfig = this.selectAvailableNodeForStep(stepId, modelConfigs);
    if (!stepConfig) {
      throw new Error(`No available configuration found for step: ${stepId}`);
    }

    const step = progress.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`Step not found: ${stepId}`);
    }

    step.status = 'running';
    step.nodeId = stepConfig.nodeId;
    step.model = stepConfig.model;
    step.startTime = new Date();

    progress.currentStep = stepId;
    this.notifyProgress(progress);

    return step;
  }

  private selectAvailableNodeForStep(stepId: string, modelConfigs: ModelConfig[]): ModelConfig | null {
    // Get all enabled configs for this step, sorted by priority
    const stepConfigs = modelConfigs
      .filter(config => config.step === stepId && config.enabled)
      .sort((a, b) => a.priority - b.priority);

    if (stepConfigs.length === 0) {
      return null;
    }

    // Check each config in priority order for availability
    for (const config of stepConfigs) {
      const node = nodeDiscoveryService.getNode(config.nodeId);
      if (!node) {
        console.warn(`Node '${config.nodeId}' not found for step '${stepId}'`);
        continue;
      }
      
      if (node.status !== 'online') {
        console.warn(`Node '${node.name}' is offline for step '${stepId}'`);
        continue;
      }
      
      if (!node.models.includes(config.model)) {
        console.warn(`Model '${config.model}' not available on node '${node.name}'`);
        continue;
      }

      // TODO: Add actual node usage tracking here
      // For now, we'll use the first available node
      // In the future, we can track which nodes are busy and queue intelligently
      console.log(`Selected node '${node.name}' with model '${config.model}' for step '${stepId}'`);
      return config;
    }

    return null;
  }

  private completeStep(progress: PipelineProgress, stepId: string, output?: string): void {
    const step = progress.steps.find(s => s.id === stepId);
    if (!step) return;

    step.status = 'completed';
    step.endTime = new Date();
    if (output) step.output = output;

    const completedSteps = progress.steps.filter(s => s.status === 'completed').length;
    progress.overallProgress = Math.floor((completedSteps / progress.steps.length) * 100);

    this.notifyProgress(progress);
  }

  private failStep(progress: PipelineProgress, stepId: string, error: string): void {
    const step = progress.steps.find(s => s.id === stepId);
    if (!step) return;

    step.status = 'failed';
    step.endTime = new Date();
    step.error = error;

    this.addLog(progress, {
      id: Date.now().toString(),
      timestamp: new Date(),
      step: stepId,
      level: 'error',
      message: error
    });

    this.notifyProgress(progress);
  }

  private handleError(progress: PipelineProgress, error: Error): void {
    this.addLog(progress, {
      id: Date.now().toString(),
      timestamp: new Date(),
      step: progress.currentStep,
      level: 'error',
      message: `Pipeline failed: ${error.message}`
    });

    this.notifyProgress(progress);
  }

  private addLog(progress: PipelineProgress, log: AILogEntry): void {
    // FIX BUG #2: Implement log rotation to prevent memory bloat
    const MAX_LOGS = 500;
    progress.logs.unshift(log); // Add to beginning for latest first

    // Trim logs if exceeding maximum
    if (progress.logs.length > MAX_LOGS) {
      progress.logs = progress.logs.slice(0, MAX_LOGS);
    }

    this.notifyProgress(progress);
  }

  private notifyProgress(progress: PipelineProgress): void {
    const callback = this.progressCallbacks.get(progress.queueItemId);
    if (callback) {
      callback({ ...progress });
    }
  }
}

export const aiPipelineService = new AIPipelineService();