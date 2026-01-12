/**
 * Standalone Shotlist Types
 *
 * Types for the independent shotlist manager that operates
 * without requiring a story. Supports:
 * - Individual shots with per-shot generation settings
 * - Grouping with nesting and color coding
 * - Both shot-based and scene-based workflow types
 * - Integration with render queue
 */

import { GenerationMethodId } from './generationMethods';

/**
 * Workflow type determines prompt structure:
 * - 'shot': Standard positive/negative prompts (Wan22, Hunyuan)
 * - 'scene': HoloCine format with global caption + per-cut prompts
 */
export type WorkflowType = 'shot' | 'scene';

/**
 * Shot render status within the shotlist
 */
export type ShotRenderStatus = 'pending' | 'queued' | 'rendering' | 'completed' | 'failed';

/**
 * Shot caption for scene-based workflows
 */
export interface ShotCaption {
  id: string;
  prompt: string;
  startFrame: number;
  endFrame: number;
}

/**
 * Individual shot/scene within a shotlist
 */
export interface ShotlistShot {
  id: string;
  shotlistId: string;

  // Position and grouping
  order: number;
  groupId?: string;  // Which group this belongs to (if any)

  // Basic info
  title: string;
  description?: string;

  // Workflow type determines prompt structure
  workflowType: WorkflowType;
  generationMethod: GenerationMethodId;

  // Standard prompts (for shot-based workflows)
  positivePrompt: string;
  negativePrompt: string;

  // HoloCine/Scene prompts (for scene-based workflows)
  globalCaption?: string;
  shotCaptions?: ShotCaption[];

  // Generation settings
  settings: {
    numFrames: number;
    fps: number;
    resolution: string;
    steps?: number;
    cfg?: number;
    seed?: number;
  };

  // Visual style
  visualStyle?: string;

  // Render tracking
  renderStatus: ShotRenderStatus;
  renderJobId?: string;
  outputUrl?: string;
  thumbnailUrl?: string;
  renderError?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Group of shots within a shotlist
 * Groups can be nested for hierarchical organization
 */
export interface ShotlistGroup {
  id: string;
  shotlistId: string;

  // Position and nesting
  order: number;
  parentGroupId?: string;  // For nested groups

  // Display
  name: string;
  color: string;  // Hex color for visual identification
  collapsed: boolean;  // UI state

  // Default settings for shots in this group
  defaultWorkflowType?: WorkflowType;
  defaultGenerationMethod?: GenerationMethodId;
  defaultSettings?: Partial<ShotlistShot['settings']>;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Standalone shotlist - independent of stories
 */
export interface Shotlist {
  id: string;

  // Basic info
  title: string;
  description?: string;

  // Default settings for new shots
  defaultWorkflowType: WorkflowType;
  defaultGenerationMethod: GenerationMethodId;
  defaultSettings: {
    numFrames: number;
    fps: number;
    resolution: string;
    steps: number;
    cfg: number;
  };
  defaultNegativePrompt: string;

  // Contents
  shots: ShotlistShot[];
  groups: ShotlistGroup[];

  // Stats (computed)
  totalShots: number;
  renderedShots: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Group colors for visual organization
 */
export const GROUP_COLORS = [
  { id: 'red', name: 'Red', color: '#f44336' },
  { id: 'pink', name: 'Pink', color: '#e91e63' },
  { id: 'purple', name: 'Purple', color: '#9c27b0' },
  { id: 'deepPurple', name: 'Deep Purple', color: '#673ab7' },
  { id: 'indigo', name: 'Indigo', color: '#3f51b5' },
  { id: 'blue', name: 'Blue', color: '#2196f3' },
  { id: 'cyan', name: 'Cyan', color: '#00bcd4' },
  { id: 'teal', name: 'Teal', color: '#009688' },
  { id: 'green', name: 'Green', color: '#4caf50' },
  { id: 'lime', name: 'Lime', color: '#cddc39' },
  { id: 'yellow', name: 'Yellow', color: '#ffeb3b' },
  { id: 'orange', name: 'Orange', color: '#ff9800' },
  { id: 'deepOrange', name: 'Deep Orange', color: '#ff5722' },
  { id: 'brown', name: 'Brown', color: '#795548' },
  { id: 'grey', name: 'Grey', color: '#9e9e9e' },
];

/**
 * Default settings for new shotlists
 * Note: These are fallbacks - actual defaults should come from getWorkflowDefaults()
 */
export const DEFAULT_SHOTLIST_SETTINGS = {
  defaultWorkflowType: 'shot' as WorkflowType,
  defaultGenerationMethod: 'wan22' as GenerationMethodId,
  defaultSettings: {
    numFrames: 81,
    fps: 16,
    resolution: '640x640',
    steps: 4,
    cfg: 1,
  },
  // Chinese negative from Wan 2.2 workflow
  defaultNegativePrompt: '色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走，裸露，NSFW',
};

/**
 * Default settings for new shots
 * Note: These are fallbacks - actual defaults should come from getWorkflowDefaults()
 */
export const DEFAULT_SHOT_SETTINGS = {
  workflowType: 'shot' as WorkflowType,
  generationMethod: 'wan22' as GenerationMethodId,
  settings: {
    numFrames: 81,
    fps: 16,
    resolution: '640x640',
    steps: 4,
    cfg: 1,
  },
};

/**
 * Create a new empty shotlist
 */
export function createNewShotlist(title: string = 'New Shotlist'): Shotlist {
  const now = new Date();
  return {
    id: `shotlist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    title,
    description: '',
    ...DEFAULT_SHOTLIST_SETTINGS,
    shots: [],
    groups: [],
    totalShots: 0,
    renderedShots: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Create a new shot with default settings
 */
export function createNewShot(
  shotlistId: string,
  order: number,
  overrides?: Partial<ShotlistShot>
): ShotlistShot {
  const now = new Date();
  return {
    id: `shot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    shotlistId,
    order,
    title: `Shot ${order + 1}`,
    description: '',
    workflowType: 'shot',
    generationMethod: 'wan22',
    positivePrompt: '',
    negativePrompt: DEFAULT_SHOTLIST_SETTINGS.defaultNegativePrompt,
    settings: { ...DEFAULT_SHOT_SETTINGS.settings },
    renderStatus: 'pending',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create a new group
 */
export function createNewGroup(
  shotlistId: string,
  order: number,
  name: string = 'New Group',
  color: string = GROUP_COLORS[0].color
): ShotlistGroup {
  const now = new Date();
  return {
    id: `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    shotlistId,
    order,
    name,
    color,
    collapsed: false,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get shots in a specific group (including ungrouped if groupId is undefined)
 */
export function getShotsInGroup(shots: ShotlistShot[], groupId?: string): ShotlistShot[] {
  return shots
    .filter(shot => shot.groupId === groupId)
    .sort((a, b) => a.order - b.order);
}

/**
 * Get child groups of a parent group
 */
export function getChildGroups(groups: ShotlistGroup[], parentGroupId?: string): ShotlistGroup[] {
  return groups
    .filter(group => group.parentGroupId === parentGroupId)
    .sort((a, b) => a.order - b.order);
}

/**
 * Calculate render stats for a shotlist
 */
export function calculateShotlistStats(shots: ShotlistShot[]): {
  total: number;
  pending: number;
  queued: number;
  rendering: number;
  completed: number;
  failed: number;
} {
  return {
    total: shots.length,
    pending: shots.filter(s => s.renderStatus === 'pending').length,
    queued: shots.filter(s => s.renderStatus === 'queued').length,
    rendering: shots.filter(s => s.renderStatus === 'rendering').length,
    completed: shots.filter(s => s.renderStatus === 'completed').length,
    failed: shots.filter(s => s.renderStatus === 'failed').length,
  };
}
