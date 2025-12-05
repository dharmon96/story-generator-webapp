/**
 * Comprehensive Data Validation Service
 * Validates story data at each pipeline step to prevent data loss and corruption
 */

import { debugService } from './debugService';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface Shot {
  id: string;
  shotNumber: number;
  description: string;
  duration: number;
  cameraMovement?: string;
  visualPrompt?: string;
  comfyUIPositivePrompt?: string;
  comfyUINegativePrompt?: string;
  narration?: string;
  musicCue?: string;
  renderStatus?: string;
  characters?: any[];
  locations?: any[];
}

export interface Character {
  name: string;
  role: string;
  // Store character fields
  physical_description?: string;
  age_range?: string;
  importance_level?: number;
  // Enhanced story character fields (optional for compatibility)
  id?: string;
  physicalDescription?: string;
  age?: string;
  gender?: string;
}

export interface Story {
  id: string;
  title: string;
  content: string;
  genre: string;
  shots?: any[];
  characters?: any[];
  status?: string;
}

class ValidationService {
  /**
   * Validate story content after story generation
   */
  validateStory(story: any, stepName: string): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    debugService.info('validation', `🔍 Validating story at step: ${stepName}`);

    // Check story exists
    if (!story) {
      result.errors.push('Story is null or undefined');
      result.isValid = false;
      return result;
    }

    // Validate required fields
    if (!story.id || typeof story.id !== 'string') {
      result.errors.push('Story ID is missing or invalid');
      result.isValid = false;
    }

    if (!story.title || typeof story.title !== 'string' || story.title.trim().length === 0) {
      result.errors.push('Story title is missing or empty');
      result.isValid = false;
    }

    if (!story.content || typeof story.content !== 'string' || story.content.trim().length === 0) {
      result.errors.push('Story content is missing or empty');
      result.isValid = false;
    }

    // Check content length
    if (story.content && story.content.length < 100) {
      result.warnings.push(`Story content is quite short (${story.content.length} chars)`);
    }

    if (story.content && story.content.length > 10000) {
      result.warnings.push(`Story content is very long (${story.content.length} chars)`);
    }

    this.logValidationResult(result, 'Story', stepName);
    return result;
  }

  /**
   * Validate shots array after shot generation
   */
  validateShots(shots: Shot[], stepName: string, expectedMinCount: number = 1): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    debugService.info('validation', `🔍 Validating ${shots?.length || 0} shots at step: ${stepName}`);

    // Check shots array exists
    if (!Array.isArray(shots)) {
      result.errors.push('Shots is not an array');
      result.isValid = false;
      return result;
    }

    // Check minimum shot count
    if (shots.length < expectedMinCount) {
      result.errors.push(`Expected at least ${expectedMinCount} shots, got ${shots.length}`);
      result.isValid = false;
    }

    // Validate each shot
    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const shotErrors = this.validateSingleShot(shot, i + 1);
      result.errors.push(...shotErrors);
      
      if (shotErrors.length > 0) {
        result.isValid = false;
      }
    }

    // Check for duplicate shot numbers
    const shotNumbers = shots.map(s => s.shotNumber).filter(n => typeof n === 'number');
    const uniqueNumbers = new Set(shotNumbers);
    if (shotNumbers.length !== uniqueNumbers.size) {
      result.warnings.push('Duplicate shot numbers detected');
    }

    // Check shot number sequence
    const sortedNumbers = [...shotNumbers].sort((a, b) => a - b);
    for (let i = 1; i < sortedNumbers.length; i++) {
      if (sortedNumbers[i] !== sortedNumbers[i-1] + 1) {
        result.warnings.push('Shot numbers are not sequential');
        break;
      }
    }

    this.logValidationResult(result, 'Shots', stepName);
    return result;
  }

  /**
   * Validate characters array after character analysis
   */
  validateCharacters(characters: any[], stepName: string): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    debugService.info('validation', `🔍 Validating ${characters?.length || 0} characters at step: ${stepName}`);

    // Check characters array exists
    if (!Array.isArray(characters)) {
      result.errors.push('Characters is not an array');
      result.isValid = false;
      return result;
    }

    // Characters can be empty for some stories
    if (characters.length === 0) {
      result.warnings.push('No characters found - this may be intentional for some story types');
    }

    // Validate each character
    for (let i = 0; i < characters.length; i++) {
      const character = characters[i];
      const charErrors = this.validateSingleCharacter(character, i + 1);
      result.errors.push(...charErrors);
      
      if (charErrors.length > 0) {
        result.isValid = false;
      }
    }

    // Check for duplicate character names
    const names = characters.map(c => c.name).filter(n => typeof n === 'string' && n.length > 0);
    const uniqueNames = new Set(names.map(n => n.toLowerCase()));
    if (names.length !== uniqueNames.size) {
      result.warnings.push('Duplicate character names detected');
    }

    this.logValidationResult(result, 'Characters', stepName);
    return result;
  }

  /**
   * Validate visual prompts on shots
   */
  validateVisualPrompts(shots: Shot[], stepName: string): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    debugService.info('validation', `🔍 Validating visual prompts for ${shots?.length || 0} shots at step: ${stepName}`);

    if (!Array.isArray(shots)) {
      result.errors.push('Shots array is invalid');
      result.isValid = false;
      return result;
    }

    let shotsWithPrompts = 0;
    let shotsWithComfyUI = 0;

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      
      // Check for visual prompt
      if (shot.visualPrompt && typeof shot.visualPrompt === 'string' && shot.visualPrompt.trim().length > 0) {
        shotsWithPrompts++;
      }
      
      // Check for ComfyUI prompts
      if (shot.comfyUIPositivePrompt && typeof shot.comfyUIPositivePrompt === 'string' && shot.comfyUIPositivePrompt.trim().length > 0) {
        shotsWithComfyUI++;
      }

      // Validate prompt quality
      if (shot.visualPrompt && shot.visualPrompt.length < 10) {
        result.warnings.push(`Shot ${shot.shotNumber}: Visual prompt is very short (${shot.visualPrompt.length} chars)`);
      }

      if (shot.comfyUIPositivePrompt && shot.comfyUIPositivePrompt.length < 20) {
        result.warnings.push(`Shot ${shot.shotNumber}: ComfyUI prompt is very short (${shot.comfyUIPositivePrompt.length} chars)`);
      }
    }

    // Check coverage
    if (shotsWithPrompts === 0) {
      result.errors.push('No shots have visual prompts');
      result.isValid = false;
    } else if (shotsWithPrompts < shots.length) {
      result.warnings.push(`Only ${shotsWithPrompts}/${shots.length} shots have visual prompts`);
    }

    if (shotsWithComfyUI === 0) {
      result.warnings.push('No shots have ComfyUI prompts - video generation may fail');
    } else if (shotsWithComfyUI < shots.length) {
      result.warnings.push(`Only ${shotsWithComfyUI}/${shots.length} shots have ComfyUI prompts`);
    }

    this.logValidationResult(result, 'Visual Prompts', stepName);
    return result;
  }

  /**
   * Validate complete story before final save
   */
  validateCompleteStory(story: Story, stepName: string): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    debugService.info('validation', `🔍 Validating complete story at step: ${stepName}`);

    // Validate story basics
    const storyValidation = this.validateStory(story, stepName);
    result.errors.push(...storyValidation.errors);
    result.warnings.push(...storyValidation.warnings);
    if (!storyValidation.isValid) result.isValid = false;

    // Validate shots
    if (story.shots) {
      const shotsValidation = this.validateShots(story.shots, stepName, 1);
      result.errors.push(...shotsValidation.errors);
      result.warnings.push(...shotsValidation.warnings);
      if (!shotsValidation.isValid) result.isValid = false;

      // Validate prompts
      const promptsValidation = this.validateVisualPrompts(story.shots, stepName);
      result.errors.push(...promptsValidation.errors);
      result.warnings.push(...promptsValidation.warnings);
      if (!promptsValidation.isValid) result.isValid = false;
    }

    // Validate characters
    if (story.characters) {
      const charactersValidation = this.validateCharacters(story.characters, stepName);
      result.errors.push(...charactersValidation.errors);
      result.warnings.push(...charactersValidation.warnings);
      if (!charactersValidation.isValid) result.isValid = false;
    }

    // Overall coherence checks
    if (story.shots && story.characters) {
      const totalDuration = story.shots.reduce((sum, shot) => sum + (shot.duration || 0), 0);
      if (totalDuration < 5) {
        result.warnings.push(`Total story duration is very short (${totalDuration}s)`);
      }
      if (totalDuration > 300) {
        result.warnings.push(`Total story duration is very long (${totalDuration}s)`);
      }
    }

    this.logValidationResult(result, 'Complete Story', stepName);
    return result;
  }

  /**
   * Validate single shot object
   */
  private validateSingleShot(shot: any, shotIndex: number): string[] {
    const errors: string[] = [];

    if (!shot || typeof shot !== 'object') {
      errors.push(`Shot ${shotIndex} is not an object`);
      return errors;
    }

    if (!shot.id || typeof shot.id !== 'string') {
      errors.push(`Shot ${shotIndex}: Missing or invalid ID`);
    }

    if (typeof shot.shotNumber !== 'number' || shot.shotNumber < 1) {
      errors.push(`Shot ${shotIndex}: Invalid shot number (${shot.shotNumber})`);
    }

    if (!shot.description || typeof shot.description !== 'string' || shot.description.trim().length === 0) {
      errors.push(`Shot ${shotIndex}: Missing or empty description`);
    }

    if (typeof shot.duration !== 'number' || shot.duration <= 0) {
      errors.push(`Shot ${shotIndex}: Invalid duration (${shot.duration})`);
    }

    return errors;
  }

  /**
   * Validate single character object
   */
  private validateSingleCharacter(character: any, charIndex: number): string[] {
    const errors: string[] = [];

    if (!character || typeof character !== 'object') {
      errors.push(`Character ${charIndex} is not an object`);
      return errors;
    }

    // ID is optional for store characters, required for enhanced characters
    if (character.id !== undefined && (typeof character.id !== 'string' || character.id.length === 0)) {
      errors.push(`Character ${charIndex}: Invalid ID`);
    }

    if (!character.name || typeof character.name !== 'string' || character.name.trim().length === 0) {
      errors.push(`Character ${charIndex}: Missing or empty name`);
    }

    if (!character.role || typeof character.role !== 'string') {
      errors.push(`Character ${charIndex}: Missing or invalid role`);
    }

    return errors;
  }

  /**
   * Log validation results
   */
  private logValidationResult(result: ValidationResult, dataType: string, stepName: string): void {
    if (result.isValid) {
      debugService.success('validation', `✅ ${dataType} validation passed at ${stepName}`);
    } else {
      debugService.error('validation', `❌ ${dataType} validation failed at ${stepName}:`, {
        errors: result.errors,
        warnings: result.warnings
      });
    }

    if (result.warnings.length > 0) {
      debugService.warn('validation', `⚠️ ${dataType} validation warnings at ${stepName}:`, {
        warnings: result.warnings
      });
    }
  }

  /**
   * Throw error if validation fails
   */
  validateOrThrow(result: ValidationResult, dataType: string, stepName: string): void {
    if (!result.isValid) {
      const errorMessage = `${dataType} validation failed at ${stepName}: ${result.errors.join(', ')}`;
      debugService.error('validation', errorMessage);
      throw new Error(errorMessage);
    }
  }
}

// Export singleton instance
export const validationService = new ValidationService();