# Video Render Queue & Enhanced Pipeline Plan

## Executive Summary

This plan addresses integrating ComfyUI video rendering into the AI pipeline with:
1. **Unified Node Pool** - Nodes can be both Ollama (AI) AND ComfyUI (rendering)
2. **Step Checkpoint/Resume** - Persist step progress for retry/resume capability
3. **Video Render Queue** - Pool of render jobs with status tracking
4. **Enhanced StoryDetail View** - Per-step retry controls and render status

---

## Current Architecture Analysis

### What Works Well
- Singleton queue processor with processing locks
- Progressive story saving with live UI updates
- Multi-queue system with different parallelism levels
- Node busy status tracking

### Current Limitations
1. **No Checkpoint Persistence** - Processing state lost on page reload
2. **Separate Queues** - AI generation and ComfyUI rendering are disconnected
3. **Node Type Isolation** - A node is either Ollama OR ComfyUI, not both
4. **No Granular Retry** - Must restart entire generation, not individual steps

---

## Proposed Architecture

### 1. Unified Node Model

**Problem:** A single machine can run both Ollama (port 11434) and ComfyUI (port 8188).

**Solution:** Extend node concept to support multiple capabilities:

```typescript
// Updated OllamaNode interface (nodeDiscovery.ts)
export interface OllamaNode {
  id: string;
  name: string;
  host: string;

  // Multiple capability ports
  ollamaPort?: number;        // 11434 if Ollama is running
  comfyUIPort?: number;       // 8188 if ComfyUI is running

  // Capabilities (detected on discovery)
  capabilities: {
    ollama: boolean;
    comfyui: boolean;
  };

  // Status per capability
  ollamaStatus: 'online' | 'offline' | 'busy';
  comfyuiStatus: 'online' | 'offline' | 'busy';

  // Existing fields...
  models: string[];           // Ollama models
  comfyUIData?: {...};        // ComfyUI checkpoints, VAEs, etc.
}
```

**Node Discovery Changes:**
- When scanning a host, check BOTH ports 11434 AND 8188
- Create a single node entry with capabilities for each
- Track busy status independently per capability

### 2. Step Checkpoint System

**Problem:** If generation fails at step 5 of 7, user must restart from step 1.

**Solution:** Persist step completion state:

```typescript
// New type: StepCheckpoint
export interface StepCheckpoint {
  storyId: string;
  queueItemId: string;
  completedSteps: string[];     // ['story', 'segments', 'characters']
  currentStep: string;          // 'shots'
  stepData: {
    [stepId: string]: {
      completedAt: Date;
      output: any;              // Step-specific data (shots array, etc.)
      assignedNode: string;
      model: string;
    }
  };
  lastUpdated: Date;
}

// Add to Store
interface StoreState {
  // ... existing
  stepCheckpoints: Record<string, StepCheckpoint>;  // queueItemId -> checkpoint

  saveStepCheckpoint: (checkpoint: StepCheckpoint) => void;
  getStepCheckpoint: (queueItemId: string) => StepCheckpoint | null;
  clearStepCheckpoint: (queueItemId: string) => void;
}
```

**Pipeline Changes:**
- After each step completes, save checkpoint to store (persisted via Zustand)
- On retry, check for existing checkpoint
- Resume from last completed step + 1
- Include step output in checkpoint for dependency resolution

### 3. Render Queue System

**New Type: RenderJob**

```typescript
export interface RenderJob {
  id: string;
  storyId: string;

  // What to render
  type: 'holocine_scene' | 'shot' | 'character_reference';
  targetId: string;           // sceneId or shotId
  targetNumber: number;       // For display ordering

  // Prompt data
  positivePrompt: string;
  negativePrompt: string;

  // Generation settings
  settings: {
    workflow: 'holocine' | 'wan22' | 'hunyuan15';
    numFrames: number;
    fps: number;
    resolution: string;
    steps?: number;
    cfg?: number;
    seed?: number;
  };

  // Status tracking
  status: 'queued' | 'assigned' | 'rendering' | 'completed' | 'failed';
  progress: number;           // 0-100
  assignedNode?: string;

  // Output
  outputUrl?: string;
  thumbnailUrl?: string;

  // Timing
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;

  // Error handling
  error?: string;
  attempts: number;
  maxAttempts: number;

  // Priority (lower = higher priority)
  priority: number;
}
```

**Render Queue Manager (new service)**

```typescript
// src/services/renderQueueManager.ts

class RenderQueueManager {
  private jobs: Map<string, RenderJob> = new Map();
  private processing: Set<string> = new Set();  // Job IDs currently rendering

  // Queue management
  addJob(job: Omit<RenderJob, 'id' | 'createdAt'>): RenderJob;
  addBatchJobs(jobs: Omit<RenderJob, 'id' | 'createdAt'>[]): RenderJob[];
  removeJob(jobId: string): void;

  // Queue a scene or shot for rendering
  queueHoloCineScene(scene: HoloCineScene, storyId: string, priority?: number): RenderJob;
  queueShot(shot: Shot, storyId: string, workflow: string, priority?: number): RenderJob;

  // Processing
  startProcessing(): void;
  stopProcessing(): void;
  processNextJob(): Promise<void>;

  // Node management (respects Ollama busy status)
  findAvailableComfyUINode(): OllamaNode | null;
  isNodeAvailable(nodeId: string): boolean;

  // Status
  getJobsByStory(storyId: string): RenderJob[];
  getJobsByStatus(status: RenderJob['status']): RenderJob[];
  getQueueStats(): { queued: number; rendering: number; completed: number; failed: number };

  // Retry failed
  retryJob(jobId: string): void;
  retryAllFailed(storyId: string): void;
}
```

### 4. Updated Pipeline Steps

**Current Pipeline:**
```
Story → Segments → Characters → [Shots|Scenes] → Prompts → Narration → Music
```

**Enhanced Pipeline:**
```
Story → Segments → Characters → [Shots|Scenes] → Prompts → [CharacterRefs] → Narration → Music → RenderQueue
                                                              ↑
                                                    (Optional: generate reference
                                                     images for character consistency)
```

**New Steps:**

1. **Character Reference Generation** (optional, for Wan/Kling pipeline)
   - Generate a reference image for each main character
   - Uses ComfyUI with SDXL/Flux for still image
   - Provides visual anchor for video consistency

2. **Render Queue Population**
   - After prompts are generated, automatically create render jobs
   - For HoloCine: one job per scene
   - For Wan/Kling: one job per shot
   - Jobs go to render queue, NOT immediate processing

### 5. Node Pool Management

**Key Insight:** A node running on 192.168.0.141 might have:
- Ollama on port 11434 (for AI steps)
- ComfyUI on port 8188 (for rendering)

**Pool Rules:**
1. **Independent Busy Status**: A node's Ollama can be busy while ComfyUI is free
2. **Same-Story Preference**: Try to use same node for all steps of a story (cache warm)
3. **Load Balancing**: Distribute across nodes when possible
4. **Capability Matching**: Only assign tasks to nodes with required capability

```typescript
// Node availability check
function isNodeAvailableFor(node: OllamaNode, taskType: 'ollama' | 'comfyui'): boolean {
  if (taskType === 'ollama') {
    return node.capabilities.ollama && node.ollamaStatus === 'online';
  } else {
    return node.capabilities.comfyui && node.comfyuiStatus === 'online';
  }
}

// When assigning a task, mark only the relevant capability as busy
function markNodeBusy(nodeId: string, capability: 'ollama' | 'comfyui'): void {
  if (capability === 'ollama') {
    node.ollamaStatus = 'busy';
  } else {
    node.comfyuiStatus = 'busy';
  }
}
```

---

## UI Changes

### 6. Video Render Queue Tab

**New Tab in StoryDetail:** Shows render job pool for the story.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Video Render Queue                           [Start All] [Pause] [Clear]│
├─────────────────────────────────────────────────────────────────────────┤
│ Queue: 12 jobs  •  Rendering: 2  •  Completed: 5  •  Failed: 1          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ ┌─ Rendering ──────────────────────────────────────────────────────────┐│
│ │ Scene 3: Rooftop Chase     [████████░░░░] 67%    Node: GPU-01        ││
│ │ Scene 4: Elevator Escape   [██░░░░░░░░░░] 15%    Node: GPU-02        ││
│ └──────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│ ┌─ Queued (10) ────────────────────────────────────────────────────────┐│
│ │ Scene 5: Lobby Confrontation    Workflow: HoloCine   [↑] [↓] [❌]    ││
│ │ Scene 6: Street Chase           Workflow: HoloCine   [↑] [↓] [❌]    ││
│ │ Scene 7: Warehouse Finale       Workflow: HoloCine   [↑] [↓] [❌]    ││
│ │ ...                                                                   ││
│ └──────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│ ┌─ Completed (5) ──────────────────────────────────────────────────────┐│
│ │ ✅ Scene 1: Office Meeting      3.2MB  15.1s  [▶ Preview] [↓ Download]││
│ │ ✅ Scene 2: Parking Garage      2.8MB  14.8s  [▶ Preview] [↓ Download]││
│ │ ...                                                                   ││
│ └──────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│ ┌─ Failed (1) ─────────────────────────────────────────────────────────┐│
│ │ ❌ Scene 8: Error: CUDA OOM     Attempts: 2/3    [🔄 Retry]          ││
│ └──────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

**Features:**
- Real-time progress via WebSocket from ComfyUI
- Priority reordering (drag or up/down buttons)
- Retry failed jobs
- Preview completed videos
- Download individual or batch

### 7. Enhanced StoryDetail View

**Step Progress Section:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Generation Progress                                      [Resume] [Stop]│
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ ✅ Story Generation          14.2s   Node: 192.168.0.141  [View Log]    │
│ ✅ Story Segmentation        3.1s    Node: 192.168.0.141  [View Log]    │
│ ✅ Character Development     8.4s    Node: 192.168.0.142  [View Log]    │
│ ✅ HoloCine Scene Creation   21.3s   Node: 192.168.0.141  [View Log]    │
│ 🔄 Visual Prompts            [████████░░░░] 67%  5/8 scenes              │
│ ⏸️ Narration                 Waiting for prompts...                      │
│ ⏸️ Music Cues                Waiting for prompts...                      │
│ ⏸️ Video Rendering           0/8 jobs queued                             │
│                                                                          │
│ [Retry Failed Steps] [Re-run From: ▼ Character Development]             │
└─────────────────────────────────────────────────────────────────────────┘
```

**Features:**
- Per-step timing and node assignment
- Expandable logs per step
- Retry individual failed steps
- Re-run from any completed step
- Resume from last checkpoint after page reload

### 8. Render Settings in Queue Dialog

When adding to render queue, show settings:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Render Settings                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ Workflow:     [HoloCine Native ▼]                                       │
│                                                                          │
│ Resolution:   [832x480 (Landscape) ▼]                                   │
│               ○ 832x480 (16:9 Landscape)                                │
│               ○ 480x832 (9:16 Portrait)                                 │
│               ○ 832x832 (1:1 Square)                                    │
│                                                                          │
│ Duration:     [15 seconds (241 frames) ▼]                               │
│               ○ 5 seconds (81 frames)                                   │
│               ○ 10 seconds (161 frames)                                 │
│               ○ 15 seconds (241 frames)                                 │
│                                                                          │
│ FPS:          [16 ▼]  (16, 24, 30)                                      │
│                                                                          │
│ Steps:        [30 ▼]  (inference steps, higher = quality)               │
│ CFG Scale:    [7.5]                                                     │
│ Seed:         [Random ▼]  or specific: [________]                       │
│                                                                          │
│ Style LoRA:   [None ▼]                                                  │
│               ○ None                                                     │
│               ○ Cinematic Film                                          │
│               ○ Anime Style                                             │
│               ○ Realistic                                               │
│                                                                          │
│                                            [Cancel]  [Add to Queue]     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Order

### Phase 1: Node Capability Extension (Foundation)
**Files to modify:**
- `src/services/nodeDiscovery.ts` - Dual capability detection
- `src/store/useStore.ts` - Update OllamaNode type
- `src/pages/Settings.tsx` - Show both capabilities per node

### Phase 2: Step Checkpoint System
**Files to modify:**
- `src/store/useStore.ts` - Add checkpoint storage
- `src/services/sequentialAiPipeline.ts` - Save checkpoints after each step
- `src/services/queueProcessor.ts` - Check for existing checkpoint on start

### Phase 3: Render Queue Manager
**New files:**
- `src/services/renderQueueManager.ts` - Core render queue logic
- `src/types/renderTypes.ts` - RenderJob and related types

**Files to modify:**
- `src/services/comfyUIRenderService.ts` - Integrate with new queue
- `src/services/sequentialAiPipeline.ts` - Auto-queue renders after prompts

### Phase 4: Video Render Queue Tab
**New files:**
- `src/components/story-tabs/RenderQueueTab.tsx` - Main UI component
- `src/components/RenderJobCard.tsx` - Individual job display
- `src/components/RenderSettingsDialog.tsx` - Settings modal

**Files to modify:**
- `src/components/StoryDetail.tsx` - Add new tab

### Phase 5: Enhanced StoryDetail with Resume
**Files to modify:**
- `src/components/StoryDetail.tsx` - Add step progress section
- `src/components/StepProgressCard.tsx` - Per-step status
- Add retry/resume controls

### Phase 6: Integration & Polish
- End-to-end testing
- WebSocket progress updates
- Error handling refinement
- Performance optimization

---

## Key Design Decisions

### 1. Separate AI Queue vs Render Queue
**Decision:** Keep them separate but coordinated.

**Rationale:**
- AI generation is fast (seconds per step)
- Video rendering is slow (minutes per scene)
- Different parallelism needs
- User may want to run AI on all stories, then batch render overnight

### 2. Checkpoint Storage Location
**Decision:** Store in Zustand with localStorage persistence.

**Rationale:**
- Survives page reload
- Fast access
- No backend dependency
- Can clear when story completes

### 3. Node Capability Detection
**Decision:** Probe both ports on each host during discovery.

**Rationale:**
- Automatic detection, no manual config
- Supports heterogeneous setups
- Easy to add more capabilities later

### 4. Render Job Priority
**Decision:** FIFO within story, but allow manual reordering.

**Rationale:**
- Predictable default behavior
- Power users can optimize
- Story scenes render in narrative order

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Complex node state management | High | Clear status enum, careful locking |
| WebSocket disconnection | Medium | Reconnect logic, poll fallback |
| Large checkpoint storage | Low | Prune completed checkpoints |
| ComfyUI version compatibility | Medium | Version detection, workflow abstraction |

---

## Questions for User

1. **Render Queue Processing:**
   - Auto-start rendering as soon as prompts are ready?
   - Or manual "Start Rendering" button?

2. **Priority System:**
   - Simple FIFO?
   - Story-level priority (all scenes of story 1 before story 2)?
   - Scene-level priority within story?

3. **Concurrent Renders:**
   - One render per ComfyUI node at a time?
   - Or allow 2 concurrent on high-VRAM nodes?

4. **Checkpoint Retention:**
   - Keep checkpoints after completion (for debugging)?
   - Auto-clear after successful completion?

---

## Alternative Approaches Considered

### Alternative 1: Single Unified Queue
All tasks (AI + render) in one queue with priority.

**Pros:** Simpler architecture
**Cons:** Different timing characteristics, harder to batch renders

**Decision:** Rejected - separate queues are more flexible

### Alternative 2: Backend Queue Server
Node.js backend manages all queuing and state.

**Pros:** More robust, survives browser close
**Cons:** Requires backend changes, more complex deployment

**Decision:** Deferred - can add later if needed

### Alternative 3: IndexedDB for Checkpoints
Use IndexedDB instead of localStorage.

**Pros:** Larger storage, structured queries
**Cons:** More complex, Zustand works well for our size

**Decision:** Rejected for now - localStorage sufficient

---

## Success Criteria

1. ✓ Can retry a failed step without re-running successful steps
2. ✓ Page reload preserves generation progress
3. ✓ Same node can serve both AI and render requests
4. ✓ Render queue shows real-time progress
5. ✓ Can adjust render settings (fps, resolution) before rendering
6. ✓ Can reorder render queue priority
7. ✓ Failed renders can be retried individually
