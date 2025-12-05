# AI Pipeline Bug Tracking Document

## Overview
This document tracks bugs and logical errors found in the AI processing pipeline, visualizations, and real-time update system. Created during comprehensive QA review on December 4, 2025.

---

## Critical Issues

### BUG #1: Result Wrapping Inconsistency Between Pipelines
**Severity:** HIGH
**Status:** ✅ FIXED (2025-12-04)
**Files Affected:**
- `src/services/enhancedAiPipeline.ts` (lines 238-251, 337-342, 418-423)
- `src/services/sequentialAiPipeline.ts` (lines 570-596)
- `src/services/nodeQueueManager.ts` (lines 559-565)

**Problem:**
The `nodeQueueManager.executeTask()` wraps results with metadata, but callbacks in enhancedAiPipeline were not properly unwrapping them.

**Fix Applied:**
Updated all callbacks in `enhancedAiPipeline.ts` to use consistent unwrapping pattern:
```typescript
const result = wrappedResult?.result || wrappedResult;
```

---

### BUG #2: Logs Array Unbounded Growth (Memory Leak)
**Severity:** MEDIUM-HIGH
**Status:** ✅ FIXED (2025-12-04)
**Files Affected:**
- `src/services/storyDataManager.ts` (line 207)
- `src/services/enhancedAiPipeline.ts` (line 814)
- `src/services/aiPipeline.ts` (line 939) - FIXED in second pass

**Problem:**
Logs were continuously added but never trimmed, causing memory bloat.

**Fix Applied:**
Implemented log rotation with MAX_LOGS = 500 entries in all pipeline files:
```typescript
if (progress.logs.length > MAX_LOGS) {
  progress.logs = progress.logs.slice(0, MAX_LOGS);
}
```

---

### BUG #3: Character Field Name Mismatch (Data Integrity)
**Severity:** MEDIUM
**Status:** ✅ FIXED (2025-12-04)
**Files Affected:**
- `src/services/storyDataManager.ts` (line 310)
- `src/services/queueProcessor.ts` (lines 290-295)

**Problem:**
Character data uses inconsistent field names (snake_case vs camelCase) between layers.

**Fix Applied:**
Updated both files to check for both naming conventions when converting character data:
```typescript
physical_description: char.physicalDescription || (char as any).physical_description || '',
age_range: char.age || (char as any).age_range || '',
importance_level: char.importanceLevel || (char as any).importance_level || 3
```

---

### BUG #4: Timestamp Not Being Converted to Date Object in AIChatTab
**Severity:** MEDIUM
**Status:** ✅ FIXED (2025-12-04)
**Files Affected:**
- `src/components/story-tabs/AIChatTab.tsx` (line 128-135)

**Problem:**
The `formatTimestamp` function expected a Date object, but logs may contain string timestamps.

**Fix Applied:**
Updated function to handle both Date objects and strings:
```typescript
const formatTimestamp = (timestamp: Date | string) => {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString(...);
};
```

---

### BUG #5: Update Lock Potential Deadlock in storyDataManager
**Severity:** MEDIUM
**Status:** ✅ FIXED (2025-12-04)
**Files Affected:**
- `src/services/storyDataManager.ts` (lines 124-145)

**Problem:**
If an update failed during lock, the retry mechanism had no timeout and could retry infinitely.

**Fix Applied:**
Added maximum retry count (10) with exponential backoff:
```typescript
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 50;
if (retryCount >= MAX_RETRIES) {
  console.error(`Shot update exceeded max retries, skipping`);
  return;
}
const delay = RETRY_DELAY_MS * Math.pow(1.5, retryCount);
```

---

### BUG #6: Visual Prompts Result Not Properly Unwrapped
**Severity:** MEDIUM
**Status:** ✅ FIXED (2025-12-04)
**Files Affected:**
- `src/services/enhancedAiPipeline.ts` (lines 499-510)

**Problem:**
Visual prompts handling accessed `result.result.positivePrompt` which could fail with unwrapped results.

**Fix Applied:**
Updated to properly unwrap and extract prompts with fallbacks:
```typescript
const result = wrappedResult?.result || wrappedResult;
const positivePrompt = result?.positivePrompt || '';
const negativePrompt = result?.negativePrompt || '';
```

---

## Minor Issues (Not Yet Fixed)

### BUG #7: Segment Task Type Missing from getQueueForTaskType
**Severity:** LOW
**Status:** NOT FIXED (Low Priority)
**Files Affected:**
- `src/services/nodeQueueManager.ts` (lines 253-272)

**Problem:**
The `segment` task type is handled in `executeTaskByType` but not explicitly in `getQueueForTaskType`.

**Impact:** Segment tasks go to 'story' queue by default (which is acceptable since they use the same model config).

---

### BUG #8: WebSocket Code is Dead/Unused
**Severity:** LOW
**Status:** INFORMATIONAL
**Files Affected:**
- `src/hooks/useWebSocket.ts`
- `src/hooks/useStoryGeneration.ts`

**Problem:**
WebSocket infrastructure exists but is not connected to the sequential pipeline.

**Recommendation:** Consider removing unused WebSocket code or documenting why it exists for future use.

---

## Data Flow Issues

### ISSUE #9: Progress Callback Not Guaranteed to Fire
**Severity:** LOW
**Status:** INFORMATIONAL
**Files Affected:**
- `src/services/sequentialAiPipeline.ts` (lines 420-424)

**Problem:**
Progress callbacks fail silently if not registered.

**Recommendation:** Add debug logging when callback is missing to aid troubleshooting.

---

## ESLint Warnings (Pre-existing, Not Bugs)

The following ESLint warnings exist in `nodeQueueManager.ts` but are not functional bugs:

1. **Lines 789, 867, 903, 967** - `'taskId' is assigned a value but never used`
   - These are unused variable warnings, not functional issues

2. **Lines 966, 1015** - `Function declared in a loop contains unsafe references to variable(s) 'currentShotNumber'`
   - This is a code style warning about closure variables in loops, not a runtime bug

---

## Testing Checklist

After implementing fixes:
- [x] TypeScript compiles without errors
- [x] Production build succeeds
- [ ] Story generation completes without errors
- [ ] All 7 pipeline steps execute in order
- [ ] Progress updates display in real-time in UI
- [ ] AI logs show correctly in AIChatTab with timestamps
- [ ] Character data persists correctly through all conversions
- [ ] Visual prompts assigned to all shots
- [ ] Memory usage remains stable during long operations
- [ ] No deadlocks occur with concurrent updates

---

## Change Log

| Date | Bug ID | Status | Description |
|------|--------|--------|-------------|
| 2025-12-04 | ALL | IDENTIFIED | Initial QA review completed |
| 2025-12-04 | #1 | FIXED | Standardized result unwrapping in enhancedAiPipeline callbacks |
| 2025-12-04 | #2 | FIXED | Implemented log rotation (MAX_LOGS=500) in enhancedAiPipeline, storyDataManager |
| 2025-12-04 | #3 | FIXED | Added dual field name support for character data |
| 2025-12-04 | #4 | FIXED | Added timestamp string-to-Date conversion |
| 2025-12-04 | #5 | FIXED | Added retry limit and exponential backoff to shot updates |
| 2025-12-04 | #6 | FIXED | Fixed visual prompts result unwrapping |
| 2025-12-04 | #2 | FIXED | Second pass: Added log rotation to aiPipeline.ts (legacy) |

---

## Files Modified

1. **src/services/enhancedAiPipeline.ts**
   - Fixed story, shots, characters callback result unwrapping (Bug #1)
   - Fixed visual prompts callback result unwrapping (Bug #6)
   - Added log rotation (Bug #2)

2. **src/services/storyDataManager.ts**
   - Added log rotation in updateProgress (Bug #2)
   - Fixed character field name handling (Bug #3)
   - Added retry limit and exponential backoff to updateShot (Bug #5)

3. **src/services/queueProcessor.ts**
   - Fixed character field name handling (Bug #3)

4. **src/components/story-tabs/AIChatTab.tsx**
   - Fixed timestamp formatting to handle strings (Bug #4)

5. **src/services/aiPipeline.ts** (Legacy)
   - Added log rotation (Bug #2) - Second pass fix

---

## Architecture Notes

### Real-Time Update Flow
```
QueueProcessor.startProcessing()
  ├→ sequentialAiPipelineService.processQueueItem(progressCallback)
  │     ├→ Updates progress on each step
  │     └→ Calls progressCallback with SequentialProgress
  │
  ├→ progressCallback updates Zustand store via updateQueueItem()
  │
  └→ React components re-render with new state
      ├→ StoryQueue shows progress bar and current step
      └→ AIChatTab displays logs in real-time
```

### Data Transformation Flow
```
AI Response (raw)
  ↓
nodeQueueManager.executeTask() wraps with { taskId, type, result, timestamp }
  ↓
Pipeline callbacks unwrap: result = wrappedResult?.result || wrappedResult
  ↓
Data validated via validationService
  ↓
Character fields normalized (camelCase ↔ snake_case)
  ↓
Story saved to Zustand store
```

