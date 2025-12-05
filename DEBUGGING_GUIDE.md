# Story Generator - Comprehensive Debugging & Tracking Guide

## Table of Contents

1. [System Health Checks](#1-system-health-checks)
2. [Debugging Checkpoints](#2-debugging-checkpoints)
3. [System-by-System Debugging](#3-system-by-system-debugging)
4. [Common Issues & Solutions](#4-common-issues--solutions)
5. [Performance Monitoring](#5-performance-monitoring)
6. [Feature Implementation Tracking](#6-feature-implementation-tracking)

---

## 1. System Health Checks

### 1.1 Quick Health Check Script

Run these checks in browser console to verify system state:

```javascript
// Check 1: Zustand Store State
const store = window.__ZUSTAND_STORE__;
console.log('Queue Items:', store?.getState?.()?.queue?.length || 'Store not accessible');
console.log('Stories:', store?.getState?.()?.stories?.length || 'Store not accessible');

// Check 2: Node Discovery Status
// Import in React component or check via Settings page
import { nodeDiscoveryService } from './services/nodeDiscovery';
console.log('Online Nodes:', nodeDiscoveryService.getOnlineNodes());

// Check 3: Queue Processor Status
import { queueProcessor } from './services/queueProcessor';
console.log('Processing Status:', queueProcessor.getStatus());
```

### 1.2 Backend Health Check

```bash
# Check backend is running
curl http://localhost:8000/api/health

# Expected response:
# {"status":"ok","timestamp":"...","message":"Story Generator API is running"}
```

### 1.3 Ollama Node Check

```bash
# Check Ollama is running and has models
curl http://localhost:11434/api/tags

# Expected response:
# {"models":[{"name":"llama3:8b",...},{"name":"mistral:7b",...}]}
```

---

## 2. Debugging Checkpoints

### 2.1 Progress Update Chain

Add these console logs to trace progress updates:

#### Checkpoint 1: Pipeline sends update

**File:** `src/services/sequentialAiPipeline.ts`

```typescript
// In updateProgress method, add at the beginning:
private updateProgress(progress: SequentialProgress, stepId: string, stepName: string, overallProgress: number) {
  console.log('📍 CHECKPOINT 1 - Pipeline updateProgress:', {
    storyId: progress.storyId,
    stepId,
    stepName,
    overallProgress,
    hasCallback: this.progressCallbacks.has(progress.storyId),
    registeredIds: Array.from(this.progressCallbacks.keys())
  });
  // ... rest of method
}
```

#### Checkpoint 2: QueueProcessor receives update

**File:** `src/services/queueProcessor.ts`

```typescript
// In processItem method, update progressCallback:
const progressCallback = (progress: any) => {
  console.log('📍 CHECKPOINT 2 - QueueProcessor receives:', {
    itemId: item.id,
    receivedProgress: progress.overallProgress,
    receivedStep: progress.currentStep,
    receivedStepName: progress.currentStepName,
    logsCount: progress.logs?.length || 0
  });
  // ... rest of callback
};
```

#### Checkpoint 3: Store is updated

**File:** `src/store/useStore.ts`

```typescript
// In updateQueueItem method:
updateQueueItem: (id, updates) => {
  console.log('📍 CHECKPOINT 3 - Store updateQueueItem:', {
    id,
    updates,
    existingItem: get().queue.find(i => i.id === id)
  });
  // ... rest of method
}
```

#### Checkpoint 4: UI renders

**File:** `src/pages/StoryQueue.tsx`

```typescript
// In the queue.map render:
{queue.map((item, index) => {
  console.log('📍 CHECKPOINT 4 - UI renders item:', {
    itemId: item.id,
    progress: item.progress,
    currentStep: item.currentStep,
    status: item.status
  });
  // ... rest of render
})}
```

### 2.2 Expected Output Pattern

When working correctly, you should see:

```
📍 CHECKPOINT 1 - Pipeline: {storyId: "queue_123", stepId: "story", overallProgress: 20, hasCallback: true}
📍 CHECKPOINT 2 - QueueProcessor: {itemId: "queue_123", receivedProgress: 20, receivedStep: "story"}
📍 CHECKPOINT 3 - Store: {id: "queue_123", updates: {progress: 20, currentStep: "story"}}
📍 CHECKPOINT 4 - UI: {itemId: "queue_123", progress: 20, currentStep: "story"}
```

### 2.3 Identifying Breaks in the Chain

| Missing Checkpoint | Likely Issue |
|-------------------|--------------|
| Checkpoint 1 not firing | Pipeline step not completing or updateProgress not called |
| Checkpoint 2 not firing | Callback ID mismatch (see BUG-001) |
| Checkpoint 3 not firing | progressCallback not calling updateQueueItem |
| Checkpoint 4 not firing | Zustand not triggering re-render |

---

## 3. System-by-System Debugging

### 3.1 AI Pipeline Debugging

#### Verify Pipeline Starts

```typescript
// Add to sequentialAiPipeline.processQueueItem:
async processQueueItem(queueItem: QueueItem, modelConfigs: ModelConfig[], onProgress?: Function) {
  console.log('🔧 PIPELINE START:', {
    itemId: queueItem.id,
    hasProgressCallback: !!onProgress,
    modelConfigsCount: modelConfigs.length,
    enabledConfigs: modelConfigs.filter(c => c.enabled).map(c => `${c.step}:${c.nodeId}:${c.model}`)
  });
  // ... rest of method
}
```

#### Verify Step Execution

```typescript
// Add to each execute*Step method:
private async executeStoryStep(progress: SequentialProgress, config: any, abortSignal?: AbortSignal) {
  console.log('🔧 STEP EXECUTE: story', {
    storyId: progress.storyId,
    nodeId: config?.nodeId,
    model: config?.model
  });
  // ... rest of method

  console.log('🔧 STEP COMPLETE: story', {
    success: !!result,
    contentLength: result?.content?.length
  });
}
```

#### Verify AI Response

```typescript
// Add to nodeQueueManager.callAI:
private async callAI(nodeId: string, model: string, prompt: string, systemPrompt?: string) {
  console.log('🔧 AI CALL:', {
    nodeId,
    model,
    promptLength: prompt.length,
    hasSystemPrompt: !!systemPrompt
  });

  // ... API call ...

  console.log('🔧 AI RESPONSE:', {
    nodeId,
    success: !!response,
    responseLength: response?.length
  });
}
```

### 3.2 Queue System Debugging

#### Verify Queue State

```typescript
// Add utility function to queueProcessor.ts:
debugQueueState() {
  const store = useStore.getState();
  console.log('🔧 QUEUE STATE:', {
    totalItems: store.queue.length,
    byStatus: {
      queued: store.queue.filter(i => i.status === 'queued').length,
      processing: store.queue.filter(i => i.status === 'processing').length,
      completed: store.queue.filter(i => i.status === 'completed').length,
      failed: store.queue.filter(i => i.status === 'failed').length
    },
    processingLock: Array.from(this.processingLock),
    isRunning: this.isRunning,
    currentItemId: this.currentItemId
  });
}
```

#### Verify Item Transitions

```typescript
// Add to queueProcessor.processItem:
private async processItem(item: QueueItem) {
  console.log('🔧 ITEM TRANSITION: queued → processing', { itemId: item.id });

  // ... processing ...

  console.log('🔧 ITEM TRANSITION: processing → ' + (error ? 'failed' : 'completed'), {
    itemId: item.id,
    error: error?.message
  });
}
```

### 3.3 Node Discovery Debugging

#### Verify Scan Results

```typescript
// Add to nodeDiscovery.scanLocalNetwork:
async scanLocalNetwork() {
  console.log('🔧 NODE SCAN START');

  // ... scanning ...

  console.log('🔧 NODE SCAN COMPLETE:', {
    nodesFound: this.nodes.size,
    onlineNodes: Array.from(this.nodes.values()).filter(n => n.status === 'online').map(n => ({
      id: n.id,
      type: n.type,
      models: n.models
    }))
  });
}
```

#### Verify Model Config Resolution

```typescript
// Add to nodeQueueManager.findBestNodeForTask:
findBestNodeForTask(task: QueueTask) {
  console.log('🔧 FIND NODE FOR TASK:', {
    taskType: task.type,
    taskId: task.id
  });

  // ... resolution logic ...

  console.log('🔧 NODE SELECTED:', {
    nodeId: selectedNode?.nodeId,
    model: selectedNode?.model,
    alternativesCount: availableNodes.length
  });
}
```

### 3.4 Data Manager Debugging

#### Verify Cache Operations

```typescript
// Add to storyDataManager methods:
updateStory(storyId: string, updates: Partial<EnhancedStory>) {
  console.log('🔧 DATA MANAGER UPDATE:', {
    storyId,
    updateFields: Object.keys(updates),
    hasExisting: !!this.cache[storyId],
    isLocked: this.updateLocks.get(storyId)
  });
  // ... rest of method
}
```

#### Verify Store Sync

```typescript
// Add to storyDataManager.syncToStore:
syncToStore(storyId: string) {
  console.log('🔧 SYNC TO STORE:', {
    storyId,
    cacheExists: !!this.cache[storyId],
    shotsCount: this.cache[storyId]?.story?.shots?.length,
    charactersCount: this.cache[storyId]?.story?.characters?.length
  });
  // ... rest of method
}
```

### 3.5 GUI Debugging

#### Verify Component Receives Data

```typescript
// Add to StoryDetail.tsx:
const StoryDetail = () => {
  const { story, queueItem } = /* ... */;

  useEffect(() => {
    console.log('🔧 STORY DETAIL DATA:', {
      hasStory: !!story,
      storyId: story?.id,
      hasQueueItem: !!queueItem,
      queueProgress: queueItem?.progress,
      queueStep: queueItem?.currentStep
    });
  }, [story, queueItem]);

  // ... rest of component
};
```

#### Verify Tab Data

```typescript
// Add to each tab component:
const ShotlistTab = ({ story }: { story: EnhancedStory }) => {
  console.log('🔧 SHOTLIST TAB:', {
    storyId: story.id,
    shotsCount: story.shots?.length,
    shotsWithPrompts: story.shots?.filter(s => s.comfyUIPositivePrompt).length
  });
  // ... rest of component
};
```

---

## 4. Common Issues & Solutions

### 4.1 Progress Not Updating

**Symptoms:**
- Progress bar stuck at 0%
- Step name not changing
- "Processing" text but no movement

**Debug Steps:**
1. Check Checkpoint 1 is firing
2. Verify callback ID matches (storyId vs queueItem.id)
3. Check Checkpoint 2 receives correct data
4. Verify Zustand store is updating

**Quick Fix:**
```typescript
// In sequentialAiPipeline.ts, ensure progress.storyId matches registration:
this.progressCallbacks.set(queueItem.id, onProgress);
// Later in updateProgress:
progress.storyId = queueItem.id; // Ensure this is set!
```

### 4.2 Logs Not Appearing

**Symptoms:**
- AIChatTab shows "No AI Logs Yet"
- Logs array is empty

**Debug Steps:**
1. Check if `progress.logs` is being populated
2. Verify logs are passed through progressCallback
3. Check AIChatTab is receiving logs prop

**Quick Fix:**
```typescript
// Add log entries in pipeline steps:
progress.logs.unshift({
  id: Date.now().toString(),
  timestamp: new Date(),
  step: 'story',
  level: 'info',
  message: 'Starting story generation...'
});
```

### 4.3 Node Not Found

**Symptoms:**
- "No configured model for step" error
- Tasks fail with "No available node"

**Debug Steps:**
1. Check Settings page - are nodes online?
2. Check model configs - is step configured?
3. Check node has the configured model

**Quick Fix:**
```bash
# Verify Ollama has the model
curl http://localhost:11434/api/tags

# Pull model if missing
ollama pull llama3:8b
```

### 4.4 Story Not Saving

**Symptoms:**
- Story generates but disappears
- Store doesn't update

**Debug Steps:**
1. Check storyDataManager.syncToStore is called
2. Verify conversion to store format
3. Check Zustand store.addStory/upsertStory

**Quick Fix:**
```typescript
// Force sync after completion:
await storyDataManager.syncToStore(storyId);
```

### 4.5 Backend Connection Failed

**Symptoms:**
- "Failed to fetch" errors
- Backend not responding

**Debug Steps:**
1. Is backend running? (`cd backend && npm start`)
2. Is port 8000 available?
3. CORS configured correctly?

**Quick Fix:**
```bash
# Check if port in use
netstat -an | findstr 8000

# Kill process if needed and restart
cd backend && npm start
```

---

## 5. Performance Monitoring

### 5.1 Memory Monitoring

```javascript
// Add to App.tsx or debug component:
useEffect(() => {
  const interval = setInterval(() => {
    if (window.performance && performance.memory) {
      console.log('📊 MEMORY:', {
        usedJSHeapSize: Math.round(performance.memory.usedJSHeapSize / 1048576) + 'MB',
        totalJSHeapSize: Math.round(performance.memory.totalJSHeapSize / 1048576) + 'MB'
      });
    }
  }, 30000); // Every 30 seconds

  return () => clearInterval(interval);
}, []);
```

### 5.2 Processing Time Tracking

```typescript
// Add to queueProcessor.ts:
private async processItem(item: QueueItem) {
  const startTime = Date.now();

  // ... processing ...

  const duration = Date.now() - startTime;
  console.log('📊 PROCESSING TIME:', {
    itemId: item.id,
    durationMs: duration,
    durationMinutes: (duration / 60000).toFixed(2)
  });
}
```

### 5.3 Store Size Monitoring

```typescript
// Add utility function:
function monitorStoreSize() {
  const state = useStore.getState();
  const serialized = JSON.stringify(state);
  console.log('📊 STORE SIZE:', {
    totalBytes: serialized.length,
    totalKB: (serialized.length / 1024).toFixed(2),
    queueItems: state.queue.length,
    stories: state.stories.length
  });
}
```

---

## 6. Feature Implementation Tracking

### 6.1 Core Features

| Feature | Status | Notes |
|---------|--------|-------|
| Story Generation | ✅ Working | Uses sequentialAiPipeline |
| Segmentation | ✅ Working | Divides story into parts |
| Shot Breakdown | ✅ Working | Creates shot list |
| Character Analysis | ✅ Working | Extracts characters |
| Visual Prompts | ✅ Working | ComfyUI positive/negative |
| Narration | ⚠️ Optional | Depends on config |
| Music Cues | ⚠️ Optional | Depends on config |

### 6.2 UI Features

| Feature | Status | Notes |
|---------|--------|-------|
| Queue Display | ✅ Working | Shows items with progress |
| Progress Bar | ⚠️ Partial | May not update (BUG-001) |
| AI Logs | ⚠️ Partial | May be empty (BUG-002) |
| Story Detail View | ✅ Working | All tabs functional |
| Shotlist Tab | ✅ Working | Shows all shots |
| Style Sheet Tab | ✅ Working | Characters/locations |

### 6.3 Missing Features

| Feature | Priority | Effort | Notes |
|---------|----------|--------|-------|
| Node health monitoring | HIGH | MEDIUM | Add periodic checks |
| Progress ID fix | HIGH | LOW | Fix callback mismatch |
| Log population | HIGH | LOW | Add log entries |
| Queue reordering | MEDIUM | MEDIUM | Drag-and-drop |
| Batch processing | LOW | HIGH | Multiple stories |
| Export formats | LOW | HIGH | Video export |

### 6.4 Technical Debt

| Item | Priority | Notes |
|------|----------|-------|
| Remove aiPipeline.ts | HIGH | Legacy, unused |
| Remove enhancedAiPipeline.ts | HIGH | Unused alternative |
| Add database indexes | MEDIUM | Performance |
| Consolidate queue systems | HIGH | Too many queues |
| Standardize data formats | MEDIUM | Multiple transformations |

---

## Appendix: Debug Flag System

Add a debug flag system for easy toggling:

```typescript
// src/config/debug.ts
export const DEBUG_FLAGS = {
  PIPELINE: true,
  QUEUE: true,
  NODE_DISCOVERY: false,
  DATA_MANAGER: true,
  UI_RENDERS: false,
  MEMORY: false
};

// Usage in any file:
import { DEBUG_FLAGS } from './config/debug';

if (DEBUG_FLAGS.PIPELINE) {
  console.log('🔧 PIPELINE:', data);
}
```

---

*Guide Version: 1.0*
*Last Updated: December 2024*
