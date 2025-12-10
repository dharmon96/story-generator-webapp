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
   */
  private getNodeAndModel(step: string = 'story'): { node: any; model: string } | null {
    // Access store to get model configs
    const state = useStore.getState();
    const modelConfigs = state.settings?.modelConfigs || [];

    // Find an enabled config for this step
    const stepConfig = modelConfigs.find(
      (config: ModelConfig) => config.enabled && config.step === step
    );

    if (!stepConfig) {
      // Fall back to any enabled config
      const anyConfig = modelConfigs.find((config: ModelConfig) => config.enabled);
      if (!anyConfig) {
        debugService.error('manual-ai', 'No enabled model configurations found');
        return null;
      }

      const node = nodeDiscoveryService.getNode(anyConfig.nodeId);
      if (!node || node.status !== 'online') {
        debugService.error('manual-ai', `Node ${anyConfig.nodeId} is not available`);
        return null;
      }

      return { node, model: anyConfig.model };
    }

    const node = nodeDiscoveryService.getNode(stepConfig.nodeId);
    if (!node || node.status !== 'online') {
      debugService.error('manual-ai', `Node ${stepConfig.nodeId} is not available`);
      return null;
    }

    return { node, model: stepConfig.model };
  }

  /**
   * Call Ollama API directly
   */
  private async callOllama(
    node: any,
    model: string,
    systemPrompt: string,
    userPrompt: string
  ): Promise<string> {
    debugService.info('manual-ai', `Calling Ollama at ${node.host}:${node.port} with model ${model}`);

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
}

// Export singleton instance
export const manualModeAiService = ManualModeAiService.getInstance();
