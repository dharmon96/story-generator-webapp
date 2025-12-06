# HoloCine Integration Plan

## Overview

HoloCine is a text-to-video model that generates **cinematic multi-shot videos** with consistent characters, objects, and style across shots within a scene. This plan outlines how to integrate HoloCine into the story generator webapp.

### Key HoloCine Concepts

1. **Scenes** - A coherent set of shots happening in one location/context (max ~15 seconds / 241 frames)
2. **Global Caption** - Describes the entire scene, characters, and setting
3. **Shot Captions** - Individual shot descriptions in sequential order
4. **Character References** - Use `[character1]`, `[character2]` notation for consistency
5. **Shot Cuts** - Frame positions where scene transitions occur

### HoloCine Prompt Format

```
[global caption] The scene takes place in a dimly lit office. [character1] is a middle-aged man with graying hair wearing a rumpled suit.
[per shot caption] Medium shot of [character1] sitting at a desk, staring at papers.
[shot cut] Close-up of [character1]'s face, showing concern.
[shot cut] Wide shot revealing the cluttered office.
```

---

## Architecture Changes

### 1. New Data Types (src/types/holocineTypes.ts)

```typescript
// HoloCine-specific types that map our story structure to HoloCine format

export interface HoloCineCharacterRef {
  id: string;                    // Our character ID
  holoCineRef: string;           // e.g., "[character1]"
  name: string;                  // Display name
  description: string;           // Physical description for global caption
}

export interface HoloCineScene {
  id: string;
  sceneNumber: number;
  title: string;

  // Core HoloCine fields
  globalCaption: string;         // Scene + character descriptions
  shotCaptions: string[];        // Per-shot descriptions using [characterX] refs
  shotCutFrames?: number[];      // Optional custom cut positions

  // Generation settings
  numFrames: 241 | 81;           // 15s or 5s video
  resolution: '832x480' | '480x832' | '832x832';  // Landscape, portrait, square

  // Metadata
  characters: HoloCineCharacterRef[];  // Characters appearing in this scene
  location: string;
  duration: number;              // Estimated duration in seconds

  // Linked to our shots
  shotIds: string[];             // Our shot IDs that comprise this scene
  partNumber?: number;           // Story part this scene belongs to

  // Generation status
  status: 'draft' | 'ready' | 'generating' | 'completed' | 'failed';
  videoUrl?: string;
  thumbnailUrl?: string;
}

export interface HoloCineExport {
  format: 'raw_string' | 'structured';
  scenes: HoloCineScene[];
  negativePrompt: string;        // Global negative prompt
  generationSettings: {
    attention: 'full' | 'sparse';
    basePrecision: 'fp16' | 'fp32';
    useLora?: string;
  };
}
```

### 2. Update Store (src/store/useStore.ts)

Add to `Story` interface:
```typescript
export interface Story {
  // ... existing fields ...

  // HoloCine scene organization
  holoCineScenes?: HoloCineScene[];
  holoCineCharacterMap?: Map<string, string>;  // characterId -> "[character1]" mapping
}
```

### 3. New Service: HoloCine Prompt Builder (src/services/holoCineService.ts)

```typescript
class HoloCineService {
  // Build character reference map - assigns [character1], [character2], etc.
  buildCharacterMap(characters: Character[]): Map<string, HoloCineCharacterRef>

  // Create scenes from story parts (1 part = 1 scene by default)
  createScenesFromParts(storyParts: StoryPart[], shots: Shot[], characters: Character[], locations: StoryLocation[]): HoloCineScene[]

  // Calculate total duration for a scene
  calculateSceneDuration(shots: Shot[]): number

  // Split a scene if it exceeds max duration (only when necessary)
  splitSceneByDuration(scene: HoloCineScene, maxDuration: number): HoloCineScene[]

  // Merge adjacent scenes that share location/characters (user-triggered)
  mergeScenes(scene1: HoloCineScene, scene2: HoloCineScene): HoloCineScene

  // Build global caption for a scene
  buildGlobalCaption(scene: HoloCineScene, characters: HoloCineCharacterRef[], location: StoryLocation): string

  // Convert shot description to HoloCine shot caption with [characterX] refs
  buildShotCaption(shot: Shot, characterMap: Map<string, HoloCineCharacterRef>): string

  // Export scene to HoloCine format
  exportScene(scene: HoloCineScene): { rawString: string; structured: object }

  // Export all scenes for batch processing
  exportAllScenes(story: Story): HoloCineExport
}
```

---

## Pipeline Changes

### 4. Update System Prompts (src/services/systemPrompts.ts)

#### New Prompt: `holocine_scene_organizer`
```
You are a scene organizer for HoloCine video generation. Your task is to group shots into coherent scenes
that can be generated as single 15-second videos.

RULES:
- Each scene should have 3-6 shots maximum (to fit within 15 seconds)
- Shots within a scene should share the same primary location
- Characters must be consistent within a scene
- Create a global caption that describes the scene setting and all characters with their physical attributes
- Convert shot descriptions to use [character1], [character2] references

OUTPUT FORMAT (JSON):
{
  "scenes": [
    {
      "scene_number": 1,
      "title": "Office Confrontation",
      "location": "Corporate Office",
      "characters": ["Marcus", "Elena"],
      "shot_indices": [1, 2, 3, 4],
      "global_caption": "The scene takes place in a modern corporate office with floor-to-ceiling windows overlooking the city at dusk. [character1] is Marcus, a stern 50-year-old CEO with silver-streaked hair and an expensive charcoal suit. [character2] is Elena, a determined 35-year-old woman with sharp features and a professional red blazer.",
      "shot_captions": [
        "Wide shot establishing the luxurious office, [character1] standing by the window",
        "Medium shot of [character2] entering through the door, tension visible",
        "Close-up of [character1] turning around, his expression cold",
        "Two-shot of both characters facing each other across the desk"
      ]
    }
  ]
}
```

#### Update `shot_list_creator` prompt
Add HoloCine-aware fields:
```
Additional fields for each shot:
- "holocine_caption": "Short caption using [characterX] references for HoloCine generation"
- "can_combine_with_previous": true/false (whether this shot can be in same HoloCine scene)
- "requires_new_scene": true/false (major location or character change)
```

---

## GUI Changes

### 5. New Tab: Scenes Tab (src/components/story-tabs/ScenesTab.tsx)

A new tab showing HoloCine scenes organization:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Scenes (HoloCine)                                    [Auto-Group]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Scene 1: Office Confrontation                    [Edit] [Generate] │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Global Caption                                                  │ │
│  │ ┌──────────────────────────────────────────────────────────┐  │ │
│  │ │ The scene takes place in a modern corporate office...    │  │ │
│  │ └──────────────────────────────────────────────────────────┘  │ │
│  │                                                                │ │
│  │ Characters: [character1] Marcus  [character2] Elena          │ │
│  │ Location: Corporate Office    Duration: ~12s    Shots: 4     │ │
│  │                                                                │ │
│  │ Shot Captions:                                                │ │
│  │ 1. Wide shot establishing the office, [character1] by window │ │
│  │ 2. Medium shot of [character2] entering, tension visible     │ │
│  │ 3. Close-up of [character1] turning, expression cold         │ │
│  │ 4. Two-shot of both facing each other                        │ │
│  │                                                                │ │
│  │ [Preview] [Copy Raw] [Copy Structured] [Send to ComfyUI]     │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  Scene 2: Elevator Escape                         [Edit] [Generate] │
│  ...                                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

### 6. Update ShotlistTab
- Add "HoloCine Scene" indicator to each shot
- Add drag-drop to reorganize shots between scenes
- Show which shots will combine into scenes

### 7. Update StyleSheetTab
- Show character-to-`[characterX]` mapping
- Display how each character will appear in HoloCine prompts

### 8. New Export Dialog (src/components/HoloCineExportDialog.tsx)

Modal for exporting/copying HoloCine prompts:
- Raw string format (for direct pasting)
- Structured JSON (for ComfyUI nodes)
- Batch export all scenes
- Copy to clipboard buttons

---

## Processing Pipeline Changes

### 9. New Pipeline Step: Scene Organization

Add to `sequentialAiPipeline.ts`:
```typescript
const steps = [
  // ... existing steps ...
  { id: 'prompts', name: 'Visual Prompts', required: true, dependencies: ['shots', 'characters'] },

  // NEW: HoloCine scene organization step
  {
    id: 'holocine_scenes',
    name: 'HoloCine Scene Organization',
    required: true,
    dependencies: ['shots', 'characters', 'prompts']
  },

  { id: 'narration', name: 'Narration Generation', required: false, dependencies: ['shots'] },
  // ...
];
```

### 10. Scene Organization Logic

```typescript
async executeHoloCineSceneStep(shots: Shot[], characters: Character[], locations: StoryLocation[]): Promise<HoloCineScene[]> {
  // 1. Use AI to intelligently group shots into scenes
  // 2. Build character reference map ([character1], [character2], etc.)
  // 3. Generate global captions for each scene
  // 4. Convert shot descriptions to HoloCine format
  // 5. Calculate shot cut frames
  // 6. Return organized scenes
}
```

---

## ComfyUI Integration

### 11. ComfyUI Workflow Support

For users with ComfyUI-WanVideoWrapper-Multishot installed:

```typescript
interface ComfyUIHoloCinePayload {
  global_caption: string;
  shot_captions: string[];
  num_frames: number;
  shot_cut_frames: number[];
  negative_prompt: string;
  // Additional node settings
  global_token_ratio: number;
  base_precision: 'fp16' | 'fp32';
}
```

API endpoint for sending to ComfyUI:
```typescript
async sendToComfyUI(scene: HoloCineScene): Promise<void> {
  const payload = this.buildComfyUIPayload(scene);
  await this.comfyUIClient.queuePrompt(payload);
}
```

---

## Implementation Order

### Phase 1: Data Types & Service (1-2 days)
1. Create `src/types/holocineTypes.ts`
2. Create `src/services/holoCineService.ts`
3. Update `useStore.ts` with HoloCine fields

### Phase 2: AI Prompts & Pipeline (1-2 days)
4. Add `holocine_scene_organizer` prompt
5. Update `shot_list_creator` for HoloCine awareness
6. Add scene organization step to pipeline
7. Update `nodeQueueManager.ts` for new task type

### Phase 3: GUI - Scenes Tab (1-2 days)
8. Create `ScenesTab.tsx` component
9. Add scene visualization and editing
10. Add export/copy functionality

### Phase 4: Integration & Polish (1 day)
11. Update ShotlistTab with scene indicators
12. Add ComfyUI export dialog
13. Add batch generation support
14. Testing and refinement

---

## Key Design Decisions

### Scene Grouping Strategy
- **Story Part = Scene**: By default, each story part maps to one HoloCine scene
- **Flexible batching**: Scenes can contain many shots (10+) as long as total duration fits
- **Duration-based splitting**: Only split if scene exceeds 15 seconds
- **Manual override**: Users can merge/split scenes as needed
- **No arbitrary shot limits**: A scene with 12 quick 1-second shots is valid (12s total)

### Character Consistency
- Build character map at story level: `{characterId: "[character1]"}`
- Include full physical description in global caption ONCE
- Reference by `[characterX]` in all shot captions
- Maintain mapping across all scenes

### Duration Calculation
- Each shot has estimated duration (from shot breakdown)
- Sum shots in scene, target max 15 seconds (241 frames)
- If scene exceeds 15s, offer to split OR generate as longer sequence
- Support for 81-frame (5s) scenes for shorter clips
- **Batching strategy**:
  - Prefer keeping story parts together as single scenes
  - Only split when absolutely necessary (>20s)
  - Allow merging adjacent parts if they share location/characters

### Prompt Token Management
- HoloCine has 512 token limit
- Global caption: ~150-200 tokens
- Per-shot captions: ~30-50 tokens each
- Monitor and warn if exceeding limits

---

## Benefits

1. **Better Video Quality**: HoloCine generates coherent multi-shot sequences
2. **Character Consistency**: `[characterX]` references ensure consistent appearance
3. **Efficient Generation**: One generation per scene vs. one per shot
4. **Scene-Based Workflow**: More natural for filmmakers
5. **Easy Export**: Copy prompts directly to ComfyUI

---

## Questions for User Consideration

1. Should scene organization be automatic, manual, or AI-assisted with manual override?
2. Preferred default resolution: landscape (832x480), portrait (480x832), or configurable?
3. Should we support both 15s (241 frames) and 5s (81 frames) scenes?
4. Priority: Raw string export or structured JSON for ComfyUI nodes?
