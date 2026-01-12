/**
 * Manual Mode AI Service
 * Provides AI text generation and enhancement for manual story creation
 */

import { nodeDiscoveryService } from './nodeDiscovery';
import { useStore, ModelConfig } from '../store/useStore';
import { debugService } from './debugService';

export interface AIGenerationRequest {
  prompt: string;
  systemPrompt?: string;
  step?: string;  // story, characters, shots, prompts
  context?: Record<string, any>;  // Additional context for generation
}

export interface AIEnhanceRequest {
  existingText: string;
  instruction: string;
  systemPrompt?: string;
  step?: string;
}

export interface AIGenerationResult {
  success: boolean;
  text: string;
  error?: string;
  model?: string;
  node?: string;
}

// System prompts for different generation tasks
const MANUAL_MODE_PROMPTS = {
  // Story content generation
  generateStory: `You are a creative story writer for short-form video content. Write engaging, visual narratives that can be turned into videos. Focus on vivid descriptions and strong visual imagery.`,

  // Enhance/expand story content
  enhanceStory: `You are an expert story editor. Enhance and expand the given text while maintaining the original tone and intent. Make descriptions more vivid and add visual details.`,

  // Generate story title
  generateTitle: `Generate a compelling, concise title for a video story. The title should be engaging and hint at the narrative without giving too much away. Respond with just the title, nothing else.`,

  // Character generation
  generateCharacter: `You are a character designer. Create a detailed character description including:
- Physical appearance (age, build, distinctive features)
- Clothing style
- Personality traits
- Role in the story
Format as JSON with keys: name, physical_description, age_range, clothing, personality, role (protagonist/antagonist/supporting)`,

  // Enhance character description
  enhanceCharacter: `You are a character development expert. Enhance the character description with more vivid physical details and deeper personality traits. Maintain consistency with the original concept.`,

  // Location generation
  generateLocation: `You are a production designer. Create a detailed location description including:
- Setting type (interior/exterior)
- Visual atmosphere
- Lighting conditions
- Key visual elements
- Color palette
Format as JSON with keys: name, type, description, atmosphere, lighting, key_elements, time_of_day`,

  // Enhance location description
  enhanceLocation: `You are a visual design expert. Enhance the location description with richer atmospheric details and more specific visual elements. Maintain the original mood.`,

  // Shot description generation
  generateShot: `You are a cinematographer. Create a detailed shot description including:
- Camera angle and shot type
- Subject and action
- Visual composition
- Mood and atmosphere
Describe what the audience sees in vivid detail.`,

  // Visual prompt generation for a shot
  generateVisualPrompt: `You are an AI art prompt expert. Convert the shot description into a detailed visual prompt suitable for AI image/video generation. Include:
- Subject description
- Action/pose
- Camera angle
- Lighting
- Style keywords
- Mood/atmosphere`,

  // Generate ComfyUI-ready positive prompt
  generateComfyUIPrompt: `You are an AI video generation expert specializing in ComfyUI prompts. Create a detailed positive prompt that:
- Describes the scene in clear, descriptive terms
- Includes subject, action, camera angle, lighting
- Uses comma-separated descriptive tags
- Avoids negative concepts (put those in negative prompt)
- Optimized for video AI generation`,

  // Text expansion/enhancement
  expandText: `You are a creative writer. Take the brief idea or concept provided and expand it into a more detailed, vivid description. Maintain the core concept while adding rich detail.`,
};

class ManualModeAiService {
  private static instance: ManualModeAiService;

  static getInstance(): ManualModeAiService {
    if (!ManualModeAiService.instance) {
      ManualModeAiService.instance = new ManualModeAiService();
    }
    return ManualModeAiService.instance;
  }

  /**
   * Get the best available node and model for a specific step
   * Priority order:
   * 1. ui_ai step config (for all manual mode/UI AI operations)
   * 2. Specific step config (if provided)
   * 3. Any enabled config (fallback)
   * 4. Direct node discovery (for agents that are online with models)
   */
  private getNodeAndModel(step: string = 'story'): { node: any; model: string } | null {
    // Access store to get model configs
    const state = useStore.getState();

    // Try new pipeline assignments system first (preferred)
    const newModelConfigs = state.getModelConfigsFromAssignments ? state.getModelConfigsFromAssignments() : [];

    // Fall back to legacy model configs
    const legacyModelConfigs = state.settings?.modelConfigs || [];

    // Use new system if available, otherwise fall back to legacy
    const modelConfigs = newModelConfigs.length > 0 ? newModelConfigs : legacyModelConfigs;

    debugService.info('manual-ai', `Looking for model config. New configs: ${newModelConfigs.length}, Legacy: ${legacyModelConfigs.length}, Using: ${modelConfigs.length}`);

    // First priority: Check for ui_ai step config (dedicated UI AI model)
    const uiAiConfig = modelConfigs.find(
      (config: ModelConfig) => config.enabled && config.step === 'ui_ai' && config.model
    );

    if (uiAiConfig) {
      const node = nodeDiscoveryService.getNode(uiAiConfig.nodeId);
      if (node && node.status === 'online') {
        debugService.info('manual-ai', `Using UI AI model: ${uiAiConfig.model} on ${node.name}`);
        return { node, model: uiAiConfig.model };
      }
    }

    // Second priority: Find an enabled config for the specific step
    const stepConfig = modelConfigs.find(
      (config: ModelConfig) => config.enabled && config.step === step && config.model
    );

    if (stepConfig) {
      const node = nodeDiscoveryService.getNode(stepConfig.nodeId);
      if (node && node.status === 'online') {
        debugService.info('manual-ai', `Using step config: ${stepConfig.model} on node ${stepConfig.nodeId}`);
        return { node, model: stepConfig.model };
      }
    }

    // Third priority: Any enabled config with a model
    const anyConfig = modelConfigs.find(
      (config: ModelConfig) => config.enabled && config.model
    );

    if (anyConfig) {
      const node = nodeDiscoveryService.getNode(anyConfig.nodeId);
      if (node && node.status === 'online') {
        debugService.info('manual-ai', `Using fallback config: ${anyConfig.model} on ${node.name}`);
        return { node, model: anyConfig.model };
      }
    }

    // Fourth priority: Direct node discovery - find any online node with models
    const allNodes = nodeDiscoveryService.getNodes();
    const onlineNode = allNodes.find(n => n.status === 'online' && n.models && n.models.length > 0);

    if (onlineNode) {
      const firstModel = onlineNode.models[0];
      debugService.info('manual-ai', `Using discovered node: ${firstModel} on ${onlineNode.name}`);
      return { node: onlineNode, model: firstModel };
    }

    debugService.error('manual-ai', `No enabled model configurations found and no online nodes with models. Configs checked: ${modelConfigs.length}, Online nodes: ${allNodes.filter(n => n.status === 'online').length}`);
    return null;
  }

  /**
   * Call Ollama API - routes through agent proxy if available for job tracking
   */
  private async callOllama(
    node: any,
    model: string,
    systemPrompt: string,
    userPrompt: string
  ): Promise<string> {
    // Use agent proxy if available for job tracking, otherwise call Ollama directly
    const ollamaPort = node.ollamaPort || node.port;
    const useAgentProxy = !!node.agentPort;
    const endpoint = useAgentProxy
      ? `http://${node.host}:${node.agentPort}/proxy/ollama/api/generate`
      : `http://${node.host}:${ollamaPort}/api/generate`;

    debugService.info('manual-ai', `Calling Ollama at ${endpoint} with model ${model}${useAgentProxy ? ' (via agent proxy)' : ''}`);

    const response = await fetch(endpoint, {
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
          temperature: 0.8,
          top_p: 0.9,
          num_predict: 2048,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama request failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return result.response || '';
  }

  /**
   * Generate text from a prompt
   */
  async generateText(request: AIGenerationRequest): Promise<AIGenerationResult> {
    try {
      const nodeAndModel = this.getNodeAndModel(request.step || 'story');
      if (!nodeAndModel) {
        return {
          success: false,
          text: '',
          error: 'No AI model available. Please configure models in Settings.',
        };
      }

      const { node, model } = nodeAndModel;
      const systemPrompt = request.systemPrompt || MANUAL_MODE_PROMPTS.expandText;

      const response = await this.callOllama(node, model, systemPrompt, request.prompt);

      return {
        success: true,
        text: response.trim(),
        model: model,
        node: node.name,
      };
    } catch (error: any) {
      debugService.error('manual-ai', `Generation failed: ${error.message}`);
      return {
        success: false,
        text: '',
        error: error.message,
      };
    }
  }

  /**
   * Enhance/expand existing text
   */
  async enhanceText(request: AIEnhanceRequest): Promise<AIGenerationResult> {
    try {
      const nodeAndModel = this.getNodeAndModel(request.step || 'story');
      if (!nodeAndModel) {
        return {
          success: false,
          text: '',
          error: 'No AI model available. Please configure models in Settings.',
        };
      }

      const { node, model } = nodeAndModel;
      const systemPrompt = request.systemPrompt || MANUAL_MODE_PROMPTS.enhanceStory;

      const prompt = `${request.instruction}\n\nOriginal text:\n${request.existingText}`;

      const response = await this.callOllama(node, model, systemPrompt, prompt);

      return {
        success: true,
        text: response.trim(),
        model: model,
        node: node.name,
      };
    } catch (error: any) {
      debugService.error('manual-ai', `Enhancement failed: ${error.message}`);
      return {
        success: false,
        text: '',
        error: error.message,
      };
    }
  }

  // Convenience methods for specific generation tasks

  /**
   * Generate a story from a prompt
   */
  async generateStory(prompt: string, genre?: string): Promise<AIGenerationResult> {
    const fullPrompt = genre
      ? `Genre: ${genre}\n\nStory prompt: ${prompt}\n\nWrite a short, engaging story with vivid visual descriptions.`
      : `Story prompt: ${prompt}\n\nWrite a short, engaging story with vivid visual descriptions.`;

    return this.generateText({
      prompt: fullPrompt,
      systemPrompt: MANUAL_MODE_PROMPTS.generateStory,
      step: 'story',
    });
  }

  /**
   * Generate a story title
   */
  async generateTitle(storyContent: string): Promise<AIGenerationResult> {
    return this.generateText({
      prompt: `Story content:\n${storyContent.slice(0, 500)}...\n\nGenerate a title for this story.`,
      systemPrompt: MANUAL_MODE_PROMPTS.generateTitle,
      step: 'story',
    });
  }

  /**
   * Enhance/expand story content
   */
  async enhanceStory(content: string, instruction?: string): Promise<AIGenerationResult> {
    return this.enhanceText({
      existingText: content,
      instruction: instruction || 'Enhance this story with more vivid descriptions and visual details.',
      systemPrompt: MANUAL_MODE_PROMPTS.enhanceStory,
      step: 'story',
    });
  }

  /**
   * Generate a character description
   */
  async generateCharacter(description: string, storyContext?: string): Promise<AIGenerationResult> {
    const prompt = storyContext
      ? `Story context: ${storyContext}\n\nCharacter concept: ${description}\n\nCreate a detailed character.`
      : `Character concept: ${description}\n\nCreate a detailed character.`;

    return this.generateText({
      prompt,
      systemPrompt: MANUAL_MODE_PROMPTS.generateCharacter,
      step: 'characters',
    });
  }

  /**
   * Enhance a character description
   */
  async enhanceCharacter(characterDesc: string): Promise<AIGenerationResult> {
    return this.enhanceText({
      existingText: characterDesc,
      instruction: 'Enhance this character description with more vivid physical details and deeper personality traits.',
      systemPrompt: MANUAL_MODE_PROMPTS.enhanceCharacter,
      step: 'characters',
    });
  }

  /**
   * Generate a location description
   */
  async generateLocation(description: string, storyContext?: string): Promise<AIGenerationResult> {
    const prompt = storyContext
      ? `Story context: ${storyContext}\n\nLocation concept: ${description}\n\nCreate a detailed location.`
      : `Location concept: ${description}\n\nCreate a detailed location.`;

    return this.generateText({
      prompt,
      systemPrompt: MANUAL_MODE_PROMPTS.generateLocation,
      step: 'characters',  // Uses same config as characters
    });
  }

  /**
   * Generate a shot description
   */
  async generateShot(sceneDescription: string, context?: { characters?: string[]; locations?: string[] }): Promise<AIGenerationResult> {
    let prompt = `Scene: ${sceneDescription}`;
    if (context?.characters?.length) {
      prompt += `\nCharacters present: ${context.characters.join(', ')}`;
    }
    if (context?.locations?.length) {
      prompt += `\nLocation: ${context.locations.join(', ')}`;
    }
    prompt += '\n\nDescribe this as a detailed camera shot.';

    return this.generateText({
      prompt,
      systemPrompt: MANUAL_MODE_PROMPTS.generateShot,
      step: 'shots',
    });
  }

  /**
   * Generate visual prompt from a shot description
   */
  async generateVisualPrompt(shotDescription: string, style?: string): Promise<AIGenerationResult> {
    const prompt = style
      ? `Shot description: ${shotDescription}\nVisual style: ${style}\n\nCreate a detailed visual prompt.`
      : `Shot description: ${shotDescription}\n\nCreate a detailed visual prompt for AI generation.`;

    return this.generateText({
      prompt,
      systemPrompt: MANUAL_MODE_PROMPTS.generateVisualPrompt,
      step: 'prompts',
    });
  }

  /**
   * Generate ComfyUI-ready positive prompt
   */
  async generateComfyUIPrompt(shotDescription: string, characters?: string[], style?: string): Promise<AIGenerationResult> {
    let prompt = `Shot description: ${shotDescription}`;
    if (characters?.length) {
      prompt += `\nCharacters: ${characters.join(', ')}`;
    }
    if (style) {
      prompt += `\nVisual style: ${style}`;
    }
    prompt += '\n\nCreate a ComfyUI-ready positive prompt for video generation.';

    return this.generateText({
      prompt,
      systemPrompt: MANUAL_MODE_PROMPTS.generateComfyUIPrompt,
      step: 'prompts',
    });
  }

  /**
   * Expand a brief prompt/idea into full text
   */
  async expandPrompt(briefIdea: string, fieldType: string): Promise<AIGenerationResult> {
    const systemPromptMap: Record<string, string> = {
      story: MANUAL_MODE_PROMPTS.expandText,
      title: MANUAL_MODE_PROMPTS.generateTitle,
      character: MANUAL_MODE_PROMPTS.generateCharacter,
      location: MANUAL_MODE_PROMPTS.generateLocation,
      shot: MANUAL_MODE_PROMPTS.generateShot,
      visualPrompt: MANUAL_MODE_PROMPTS.generateVisualPrompt,
      comfyui: MANUAL_MODE_PROMPTS.generateComfyUIPrompt,
    };

    return this.generateText({
      prompt: `Expand this concept: ${briefIdea}`,
      systemPrompt: systemPromptMap[fieldType] || MANUAL_MODE_PROMPTS.expandText,
      step: fieldType === 'comfyui' || fieldType === 'visualPrompt' ? 'prompts' :
            fieldType === 'shot' ? 'shots' :
            fieldType === 'character' || fieldType === 'location' ? 'characters' : 'story',
    });
  }

  /**
   * Get available system prompts
   */
  getSystemPrompts(): Record<string, string> {
    return { ...MANUAL_MODE_PROMPTS };
  }

  /**
   * Enhance any text field with AI - robust and dynamic
   * Automatically determines the best enhancement strategy based on field type and content
   */
  async enhanceField(
    currentValue: string,
    fieldType: 'positivePrompt' | 'negativePrompt' | 'globalCaption' | 'shotCaption' | 'description' | 'visualStyle' | 'title' | 'story' | 'character' | 'location',
    context?: {
      workflowType?: 'shot' | 'scene';
      generationMethod?: string;
      storyContent?: string;
      characters?: string[];
      style?: string;
      existingPrompts?: string[];
    }
  ): Promise<AIGenerationResult> {
    // Build dynamic system prompt based on field type
    const systemPrompts: Record<string, string> = {
      positivePrompt: `You are an expert video prompt engineer. Enhance the given prompt to be more detailed, cinematic, and effective for AI video generation.

IMPORTANT GUIDELINES:
- Maintain the core subject and action from the original
- Add vivid visual details: lighting, atmosphere, camera angle, color palette
- Use comma-separated descriptive tags/keywords
- Keep it focused and coherent - don't add unrelated elements
- Optimize for video AI generation (motion, dynamics, temporal consistency)
- Output only the enhanced prompt, no explanations`,

      negativePrompt: `You are an expert at crafting negative prompts for AI video generation. Enhance the given negative prompt to better exclude unwanted elements.

IMPORTANT GUIDELINES:
- Keep existing exclusions that make sense
- Add common quality issues: blur, artifacts, distortion
- Add common composition issues: watermark, text, borders
- Add anatomical issues if characters are involved: bad hands, extra limbs
- Keep it concise - too many negatives can hurt generation
- Output only the enhanced negative prompt, no explanations`,

      globalCaption: `You are an expert in multi-shot video prompting (HoloCine format). Enhance the global caption to better describe the overall scene.

IMPORTANT GUIDELINES:
- The global caption describes what's consistent across all shots in the scene
- Include: setting, atmosphere, lighting, time of day, main subjects
- Reference characters using [character1], [character2] format if present
- Be descriptive but not overly long - this sets the scene
- Output only the enhanced global caption, no explanations`,

      shotCaption: `You are an expert in multi-shot video prompting. Enhance this individual shot caption within a scene.

IMPORTANT GUIDELINES:
- Focus on what happens in THIS specific shot/cut
- Include: action, camera angle, composition, movement
- Be concise but descriptive
- Keep character references consistent
- Output only the enhanced shot caption, no explanations`,

      description: `You are a creative writer. Enhance this description with more vivid, visual details.

IMPORTANT GUIDELINES:
- Maintain the core meaning and intent
- Add sensory details: visual, atmospheric
- Make it more engaging and cinematic
- Keep the same general length/style
- Output only the enhanced description, no explanations`,

      visualStyle: `You are a visual art director. Enhance this visual style description to be more specific and implementable.

IMPORTANT GUIDELINES:
- Specify art style, color palette, mood
- Include lighting and atmosphere preferences
- Reference specific visual techniques or aesthetics
- Make it actionable for AI generation
- Output only the enhanced style description, no explanations`,

      title: MANUAL_MODE_PROMPTS.generateTitle,
      story: MANUAL_MODE_PROMPTS.enhanceStory,
      character: MANUAL_MODE_PROMPTS.enhanceCharacter,
      location: MANUAL_MODE_PROMPTS.enhanceLocation,
    };

    const systemPrompt = systemPrompts[fieldType] || systemPrompts.description;

    // Build user prompt with context
    let userPrompt = `Enhance this ${fieldType.replace(/([A-Z])/g, ' $1').toLowerCase()}:\n\n"${currentValue}"`;

    if (context?.storyContent) {
      userPrompt += `\n\nStory context (for reference):\n${context.storyContent.slice(0, 500)}...`;
    }

    if (context?.characters?.length) {
      userPrompt += `\n\nCharacters in scene: ${context.characters.join(', ')}`;
    }

    if (context?.style) {
      userPrompt += `\n\nVisual style: ${context.style}`;
    }

    if (context?.generationMethod) {
      userPrompt += `\n\nTarget generation method: ${context.generationMethod}`;
    }

    return this.generateText({
      prompt: userPrompt,
      systemPrompt,
      step: fieldType === 'positivePrompt' || fieldType === 'negativePrompt' || fieldType === 'globalCaption' || fieldType === 'shotCaption'
        ? 'prompts'
        : fieldType === 'character' || fieldType === 'location'
        ? 'characters'
        : 'story',
    });
  }

  /**
   * Generate a prompt from scratch based on field type and context
   */
  async generateField(
    fieldType: 'positivePrompt' | 'negativePrompt' | 'globalCaption' | 'shotCaption' | 'description' | 'visualStyle' | 'title',
    context?: {
      workflowType?: 'shot' | 'scene';
      generationMethod?: string;
      storyContent?: string;
      characters?: string[];
      style?: string;
      shotDescription?: string;
      placeholder?: string;
    }
  ): Promise<AIGenerationResult> {
    const systemPrompts: Record<string, string> = {
      positivePrompt: `You are an expert video prompt engineer. Generate a detailed, cinematic prompt for AI video generation.

IMPORTANT GUIDELINES:
- Create vivid, visual descriptions
- Include: subject, action, setting, lighting, atmosphere, camera angle
- Use comma-separated descriptive tags/keywords
- Optimize for video AI generation
- Output only the prompt, no explanations`,

      negativePrompt: `You are an expert at crafting negative prompts for AI video generation. Generate an effective negative prompt.

COMMON ELEMENTS TO INCLUDE:
- Quality issues: blurry, low quality, jpeg artifacts, pixelated
- Technical issues: watermark, text, logo, borders, frame
- Style issues: cartoon, anime (if going for realism), or vice versa
- Common errors: bad anatomy, extra limbs, deformed
Output only the negative prompt, no explanations`,

      globalCaption: `You are an expert in multi-shot video prompting (HoloCine format). Generate a global caption for a scene.

INCLUDE:
- Setting and environment
- Time of day and lighting
- Atmosphere and mood
- Main subjects/characters
Use [character1], [character2] for character references.
Output only the global caption, no explanations`,

      shotCaption: `You are an expert in multi-shot video prompting. Generate a shot caption for a specific cut within a scene.

INCLUDE:
- Specific action happening in this shot
- Camera angle and composition
- Movement and dynamics
Keep it focused on this specific moment.
Output only the shot caption, no explanations`,

      description: `You are a creative writer. Generate a vivid, visual description.
Output only the description, no explanations`,

      visualStyle: `You are a visual art director. Generate a visual style guide.
Include: art style, color palette, mood, lighting, atmosphere
Output only the style description, no explanations`,

      title: MANUAL_MODE_PROMPTS.generateTitle,
    };

    const systemPrompt = systemPrompts[fieldType] || systemPrompts.description;

    // Build user prompt with context
    let userPrompt = `Generate a ${fieldType.replace(/([A-Z])/g, ' $1').toLowerCase()}`;

    if (context?.placeholder) {
      userPrompt += ` based on: "${context.placeholder}"`;
    }

    if (context?.shotDescription) {
      userPrompt += `\n\nShot/Scene description: ${context.shotDescription}`;
    }

    if (context?.storyContent) {
      userPrompt += `\n\nStory context:\n${context.storyContent.slice(0, 500)}...`;
    }

    if (context?.characters?.length) {
      userPrompt += `\n\nCharacters: ${context.characters.join(', ')}`;
    }

    if (context?.style) {
      userPrompt += `\n\nVisual style: ${context.style}`;
    }

    if (context?.generationMethod) {
      userPrompt += `\n\nTarget generation method: ${context.generationMethod}`;
    }

    return this.generateText({
      prompt: userPrompt,
      systemPrompt,
      step: 'prompts',
    });
  }
}

// Export singleton instance
export const manualModeAiService = ManualModeAiService.getInstance();
