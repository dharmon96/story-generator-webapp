# Story Generator Webapp - Refactoring Plan

## Overview

This document outlines a phased approach to refactoring, cleaning up, and debugging the application. Each phase can be completed independently and builds upon the previous work.

---

## Phase 1: Build Warnings & Dead Code Cleanup (Quick Wins)

**Status: COMPLETED** (2025-12-10)
**Estimated time: 2-4 hours**
**Priority: HIGH** - Reduces noise, improves build output

### 1.1 Fix Unused Variables & Imports (Build Warnings) - DONE

Reduced from 35+ warnings to 0. Fixed files:
- [x] `FloatingDebugConsole.tsx` - Removed unused `scrollTimeoutRef`
- [x] `GenerationMethodSelector.tsx` - Removed unused `getMethodIcon` and `GenerationMethod` import
- [x] `StoryDetail.tsx` - Removed unused `entry`, `isSceneBased`
- [x] `ShotGroup.tsx` - Removed unused `ColorLens`, `totalInGroup`
- [x] `ShotlistEditor.tsx` - Removed 8 unused items (Tooltip, Badge, QueueIcon, Shotlist, createNewShot, createNewGroup, reorderShots, rootGroups)
- [x] `ShotlistTab.tsx` - Removed unused `EnhanceIcon`, added useCallback import, fixed getRenderJobForShot dependency
- [x] `StoryTab.tsx` - Removed unused `AITextField`, fixed isEditing useEffect dependency
- [x] `StyleSheetTab.tsx` - Removed unused `EnhanceIcon`, `DeleteIcon`
- [x] `nodeDiscovery.ts` - Removed unused `localhostNode`
- [x] `renderQueueManager.ts` - Removed unused `store`, fixed `nodeIdKey`
- [x] `sequentialAiPipeline.ts` - Removed 6 unused `taskId` assignments, fixed `storyId` in loop, fixed function-in-loop closure
- [x] `PipelineStepsTab.tsx` - Wrapped skipSteps in useMemo, added story to dependency array
- [x] `comfyUIWorkflowBuilder.ts` - Fixed anonymous default export

### 1.2 Remove Deprecated Code - DONE

- [x] Removed `src/services/aiPipeline.ts` (732 lines, marked @deprecated)
- [x] Moved `PipelineProgress` and `PipelineStep` interfaces to `enhancedAiPipeline.ts`
- [ ] Remove deprecated `generateComfyUIPrompts` field from `StoryConfig` interface (unused but still defined)

---

## Phase 2: Type Safety Improvements

**Estimated time: 8-12 hours**
**Priority: HIGH** - Prevents runtime bugs

### 2.1 Replace `any` Types

| File | Line | Current | Fix |
|------|------|---------|-----|
| `StoryDetail.tsx:287` | `char: any` | Define Character interface properly |
| `StoryDetail.tsx:304` | `loc: any` | Define Location interface properly |
| `StepEditor.tsx:56` | `content: any` | Type based on step type |
| `AITextField.tsx:52` | `Record<string, any>` | Define context shape |
| `sequentialAiPipeline.ts` | Multiple instances | Define proper return types |

### 2.2 Create Missing Interfaces

```typescript
// src/types/storyTypes.ts (new file or extend existing)
interface CharacterReference {
  id: string;
  name: string;
  description: string;
  appearance?: string;
}

interface LocationReference {
  id: string;
  name: string;
  description: string;
  atmosphere?: string;
}

interface StepContent {
  type: 'story' | 'shots' | 'characters' | 'prompts' | 'narration' | 'music';
  data: unknown; // Union type based on step
}
```

---

## Phase 3: Service Architecture Refactoring

**Estimated time: 20-30 hours**
**Priority: CRITICAL** - Core maintainability

### 3.1 Split `sequentialAiPipeline.ts` (2,066 lines)

Split into modular services:

```
src/services/pipeline/
├── index.ts                    # Re-exports
├── pipelineOrchestrator.ts     # Main orchestration logic (~300 lines)
├── storyGenerator.ts           # Story generation step (~250 lines)
├── shotlistGenerator.ts        # Shot breakdown logic (~300 lines)
├── characterAnalyzer.ts        # Character extraction (~200 lines)
├── promptBuilder.ts            # Visual prompt generation (~250 lines)
├── holocineSceneBuilder.ts     # HoloCine specific logic (~300 lines)
├── narrationGenerator.ts       # Narration step (~150 lines)
├── musicDirector.ts            # Music cues (~150 lines)
└── types.ts                    # Pipeline-specific types
```

### 3.2 Split `nodeDiscovery.ts` (2,208 lines)

```
src/services/nodes/
├── index.ts
├── nodeDiscovery.ts            # Core discovery logic (~400 lines)
├── ollamaNodeManager.ts        # Ollama-specific (~300 lines)
├── comfyUINodeManager.ts       # ComfyUI-specific (~300 lines)
├── networkScanner.ts           # Network detection (~250 lines)
├── apiKeyManager.ts            # API key storage/validation (~200 lines)
├── nodeHealthChecker.ts        # Health monitoring (~200 lines)
└── types.ts                    # Node types
```

### 3.3 Consolidate Queue Management

```
src/services/queue/
├── index.ts
├── queueManager.ts             # Generic queue operations
├── storyQueueProcessor.ts      # Story-specific queue logic
├── renderQueueProcessor.ts     # Render-specific queue logic
└── types.ts
```

---

## Phase 4: Component Refactoring

**Estimated time: 15-20 hours**
**Priority: HIGH**

### 4.1 Split `ShotlistTab.tsx` (1,636 lines)

```
src/components/story-tabs/shotlist/
├── index.tsx                   # Main ShotlistTab (~200 lines)
├── ShotlistHeader.tsx          # Header with actions (~150 lines)
├── ShotlistGrid.tsx            # Grid/list view (~200 lines)
├── ShotlistFilters.tsx         # Filter controls (~100 lines)
├── ShotlistBulkActions.tsx     # Bulk operations (~150 lines)
├── useShotlistState.ts         # Custom hook for state (~200 lines)
├── useShotlistActions.ts       # Custom hook for actions (~200 lines)
└── types.ts
```

### 4.2 Extract Custom Hooks

Create reusable hooks from repeated patterns:

```typescript
// src/hooks/useStoryData.ts
export function useStoryData(storyId: string) {
  // Centralize story fetching, updates, subscriptions
}

// src/hooks/useRenderQueue.ts
export function useRenderQueue(storyId?: string) {
  // Queue operations, status polling
}

// src/hooks/useNodeStatus.ts
export function useNodeStatus() {
  // Node discovery, health checks
}
```

### 4.3 Split `Settings.tsx` (1,995 lines)

```
src/pages/settings/
├── index.tsx                   # Main Settings page (~100 lines)
├── GeneralSettings.tsx         # General app settings (~200 lines)
├── ModelSettings.tsx           # Ollama model config (~300 lines)
├── ComfyUISettings.tsx         # ComfyUI node config (~400 lines)
├── APIProviderSettings.tsx     # External API config (~300 lines)
├── PipelineSettings.tsx        # Pipeline configuration (~300 lines)
└── AdvancedSettings.tsx        # Debug, experimental (~200 lines)
```

---

## Phase 5: Fix Known Bugs (TODO/FIXME)

**Status: IN PROGRESS** (2025-12-10)
**Estimated time: 10-15 hours**
**Priority: HIGH**

### 5.1 Critical Bugs to Fix

| Location | Issue | Fix | Status |
|----------|-------|-----|--------|
| `sequentialAiPipeline.ts:273` | Step-skipping not implemented | Implement checkpoint-based skipping | ✅ DONE |
| `sequentialAiPipeline.ts:2032` | Step regeneration incomplete | Implement regeneration logic | Pending |
| `storyDataManager.ts:127` | No retry limit (infinite loop risk) | Add max retry counter | ✅ Already fixed |
| `enhancedAiPipeline.ts:243,346,432,514` | Duplicated bug fix code | Extract to utility function | ✅ Utility created |

### 5.2 Extract Result Unwrapping Utility - DONE

Created `src/utils/resultUtils.ts` with:
- `unwrapPipelineResult<T>()` - Generic result unwrapper
- `unwrapArrayResult<T>()` - Array-specific unwrapper
- `unwrapPromptResult()` - Prompt result unwrapper

```typescript
// src/utils/resultUtils.ts
export function unwrapPipelineResult<T>(result: unknown): T | null {
  if (result && typeof result === 'object' && 'result' in result) {
    return (result as { result: T }).result;
  }
  return result as T | null;
}
```

---

## Phase 6: Store Refactoring

**Estimated time: 8-12 hours**
**Priority: MEDIUM**

### 6.1 Split `useStore.ts` (1,095 lines)

```
src/store/
├── index.ts                    # Combined store export
├── useStoryStore.ts            # Story CRUD operations
├── useQueueStore.ts            # Queue management
├── useSettingsStore.ts         # App settings
├── useRenderStore.ts           # Render queue
├── useShotlistStore.ts         # Shotlist management
├── useCheckpointStore.ts       # Pipeline checkpoints
└── types.ts                    # Store types
```

Use Zustand slices pattern:
```typescript
// src/store/index.ts
import { create } from 'zustand';
import { createStorySlice } from './slices/storySlice';
import { createQueueSlice } from './slices/queueSlice';
// ...

export const useStore = create<StoreState>()((...a) => ({
  ...createStorySlice(...a),
  ...createQueueSlice(...a),
  // ...
}));
```

---

## Phase 7: Code Duplication Removal

**Estimated time: 6-8 hours**
**Priority: MEDIUM**

### 7.1 Extract Common Patterns

1. **API Response Handling**
   ```typescript
   // src/utils/apiUtils.ts
   export async function handleApiResponse<T>(response: Response): Promise<T> {
     if (!response.ok) {
       const error = await response.json().catch(() => ({}));
       throw new Error(error.message || `API error: ${response.status}`);
     }
     return response.json();
   }
   ```

2. **Story/Shot Transformations**
   ```typescript
   // src/utils/storyTransformers.ts
   export function transformStoryForExport(story: Story): ExportFormat { }
   export function transformShotForRender(shot: Shot): RenderFormat { }
   ```

3. **Node Status Checking**
   ```typescript
   // src/utils/nodeUtils.ts
   export async function checkNodeHealth(url: string): Promise<NodeStatus> { }
   ```

---

## Phase 8: Testing & Documentation

**Estimated time: 15-20 hours**
**Priority: MEDIUM**

### 8.1 Add Unit Tests

Focus areas:
- [ ] Pipeline step execution
- [ ] Queue management
- [ ] Store actions
- [ ] Utility functions
- [ ] API providers

### 8.2 Add Integration Tests

- [ ] Full pipeline execution
- [ ] ComfyUI workflow generation
- [ ] Render queue processing

### 8.3 Update Documentation

- [ ] Update CLAUDE.md with new architecture
- [ ] Add JSDoc to all public functions
- [ ] Create architecture diagram

---

## Implementation Order

### Week 1: Foundation
1. Phase 1 (Build warnings) - Day 1-2
2. Phase 2.1-2.2 (Type safety) - Day 3-5

### Week 2: Services
3. Phase 3.1 (Split sequentialAiPipeline) - Day 1-3
4. Phase 3.2 (Split nodeDiscovery) - Day 4-5

### Week 3: Components & Bugs
5. Phase 4.1-4.2 (Component refactoring) - Day 1-3
6. Phase 5 (Bug fixes) - Day 4-5

### Week 4: Polish
7. Phase 6 (Store refactoring) - Day 1-2
8. Phase 7 (Duplication removal) - Day 3
9. Phase 8 (Testing) - Day 4-5

---

## Success Metrics

- [ ] Build with 0 warnings
- [ ] No files over 500 lines (except generated)
- [ ] 0 uses of `any` type
- [ ] All TODO/FIXME resolved or documented
- [ ] Test coverage > 60% for services
- [ ] All deprecated code removed

---

## Notes

- Each phase should be a separate PR for easier review
- Run full test suite after each phase
- Update imports across codebase as files are moved
- Keep backward compatibility during transition
- Document breaking changes in CHANGELOG.md
