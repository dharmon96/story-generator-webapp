# Story Generator Web Application - Complete System Analysis

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [AI Pipeline System](#3-ai-pipeline-system)
4. [Story Data Manager System](#4-story-data-manager-system)
5. [Queue Systems](#5-queue-systems)
6. [Node Discovery & Management System](#6-node-discovery--management-system)
7. [Database & Backend System](#7-database--backend-system)
8. [GUI Components](#8-gui-components)
9. [System Interactions & Data Flow](#9-system-interactions--data-flow)
10. [Simplification Analysis](#10-simplification-analysis)
11. [Bug Tracking & Missing Features](#11-bug-tracking--missing-features)
12. [Implementation Recommendations](#12-implementation-recommendations)

---

## 1. Executive Summary

The Story Generator Web Application is a comprehensive AI-powered video content creation system. It processes user story prompts through a multi-step AI pipeline to generate:
- Narrative stories with structured content
- Shot lists with cinematographic details
- Character and location descriptions for visual consistency
- AI-optimized prompts for video generation (ComfyUI)
- Optional narration and music cues

### Core Complexity Issues Identified

| Area | Issue | Impact |
|------|-------|--------|
| **Multiple Pipeline Services** | 3 parallel pipeline implementations | Code duplication, maintenance burden |
| **Queue Management** | Multiple queue systems with overlapping functionality | Confusion, potential conflicts |
| **State Management** | Zustand + localStorage + storyDataManager cache | Data synchronization issues |
| **Progress Callbacks** | Complex callback chain with ID mismatches | Real-time updates may fail |

---

## 2. System Architecture Overview

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React + TypeScript)                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │   Pages         │  │   Components    │  │   State Management          │ │
│  │ ───────────────│  │ ───────────────│  │ ─────────────────────────── │ │
│  │ • Dashboard     │  │ • StoryDetail   │  │ • Zustand Store (useStore)  │ │
│  │ • StoryGenerator│  │ • Layout        │  │ • Story Data Manager        │ │
│  │ • StoryQueue    │  │ • Story Tabs    │  │ • LocalStorage Persistence  │ │
│  │ • Settings      │  │ • Modals        │  │                             │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SERVICES LAYER                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      AI Pipeline Services                             │  │
│  │ ─────────────────────────────────────────────────────────────────── │  │
│  │ • queueProcessor.ts        (Singleton orchestrator)                   │  │
│  │ • sequentialAiPipeline.ts  (Main pipeline - dependency tracking)      │  │
│  │ • enhancedAiPipeline.ts    (Alternative - parallel execution)         │  │
│  │ • aiPipeline.ts            (Legacy - direct execution)                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      Support Services                                 │  │
│  │ ─────────────────────────────────────────────────────────────────── │  │
│  │ • nodeQueueManager.ts      (Task distribution & load balancing)       │  │
│  │ • nodeDiscovery.ts         (Node detection & API key management)      │  │
│  │ • validationService.ts     (Data validation at each step)             │  │
│  │ • storyDataManager.ts      (In-memory cache & store sync)             │  │
│  │ • debugService.ts          (Logging and monitoring)                   │  │
│  │ • apiClient.ts             (Backend API communication)                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
┌─────────────────────────┐  ┌─────────────┐  ┌─────────────────────────────┐
│      AI PROVIDERS       │  │   BACKEND   │  │        EXTERNAL             │
├─────────────────────────┤  ├─────────────┤  ├─────────────────────────────┤
│ • Ollama (local LLM)    │  │ Express.js  │  │ • ComfyUI (video gen)       │
│ • OpenAI API            │  │ SQLite DB   │  │ • ElevenLabs (TTS)          │
│ • Claude API            │  │ Port: 8000  │  │ • Suno (music)              │
└─────────────────────────┘  └─────────────┘  └─────────────────────────────┘
```

### 2.2 Technology Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React 19, TypeScript, Material-UI, Zustand, React Router |
| **Backend** | Node.js, Express.js, SQLite3 |
| **AI Providers** | Ollama, OpenAI, Claude, ComfyUI |
| **Audio Services** | ElevenLabs, Suno |
| **Deployment** | Docker Compose (multi-service) |

---

## 3. AI Pipeline System

### 3.1 Pipeline Services Comparison

The application has **THREE** pipeline service implementations, which is a significant source of complexity:

| Service | File | Purpose | Status |
|---------|------|---------|--------|
| `aiPipeline.ts` | Legacy | Direct execution, no queuing | Deprecated |
| `enhancedAiPipeline.ts` | Alternative | Parallel execution via nodeQueueManager | Unused |
| `sequentialAiPipeline.ts` | **Active** | Sequential with dependency tracking | Primary |

### 3.2 Pipeline Steps

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        STORY GENERATION PIPELINE                         │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Step 1: STORY GENERATION                                                │
│  ├── Input: User prompt, genre, length                                   │
│  ├── Output: Story {id, title, content, genre}                           │
│  ├── Dependencies: None                                                  │
│  └── Model: story config (usually larger model like llama3-70b)          │
│                                                                          │
│  Step 2: STORY SEGMENTATION                                              │
│  ├── Input: Story content                                                │
│  ├── Output: Parts[] {part_number, title, content, duration_estimate}    │
│  ├── Dependencies: [story]                                               │
│  └── Model: segment config                                               │
│                                                                          │
│  Step 3: SHOT BREAKDOWN                                                  │
│  ├── Input: Story parts                                                  │
│  ├── Output: Shots[] {shot_number, description, duration, camera}        │
│  ├── Dependencies: [story, segments]                                     │
│  └── Model: shots config                                                 │
│                                                                          │
│  Step 4: CHARACTER ANALYSIS                                              │
│  ├── Input: Story content                                                │
│  ├── Output: Characters[] {name, role, physical_description, age_range}  │
│  ├── Dependencies: [story]                                               │
│  └── Model: character config                                             │
│                                                                          │
│  Step 5: VISUAL PROMPT GENERATION (ComfyUI Prompts)                      │
│  ├── Input: Shots + Characters                                           │
│  ├── Output: Per shot: {visualPrompt, comfyUIPositivePrompt, negative}   │
│  ├── Dependencies: [shots, characters]                                   │
│  └── Model: prompts config (can be parallel per shot)                    │
│                                                                          │
│  Step 6: NARRATION (Optional)                                            │
│  ├── Input: Shots                                                        │
│  ├── Output: Per shot: {narration, timing}                               │
│  ├── Dependencies: [shots]                                               │
│  └── Model: narration config                                             │
│                                                                          │
│  Step 7: MUSIC CUES (Optional)                                           │
│  ├── Input: Shots                                                        │
│  ├── Output: MusicCue[] {name, mood, tempo, instruments, duration}       │
│  ├── Dependencies: [shots]                                               │
│  └── Model: music config                                                 │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Sequential Pipeline Implementation

**File:** `src/services/sequentialAiPipeline.ts`

**Key Features:**
- Strict dependency validation before each step
- Node assignment and release tracking
- AbortController support for cancellation
- Exponential backoff retry (max 10 retries)
- Global node busy status to prevent overload

**State Tracking:**
```typescript
interface SequentialProgress {
  storyId: string;
  currentStep: string;
  currentStepName: string;
  overallProgress: number;
  stepProgress: number;
  status: 'idle' | 'processing' | 'completed' | 'failed';
  logs: AILogEntry[];
  assignedNode?: string;
  currentModel?: string;
}
```

**Critical Issue - Callback Registration:**
```typescript
// Registration uses queueItem.id
this.progressCallbacks.set(queueItem.id, onProgress);

// But lookup uses progress.storyId - MISMATCH!
const callback = this.progressCallbacks.get(progress.storyId);
```

### 3.4 How Pipeline SHOULD Work

```
User clicks "Generate Story"
        │
        ▼
StoryGenerator.tsx creates QueueItem with priority=10
        │
        ▼
Item added to Zustand store queue[]
        │
        ▼
QueueProcessor.startProcessing() called
        │
        ▼
For each pending item by priority:
    │
    ├── queueProcessor.processItem()
    │       │
    │       ▼
    │   sequentialAiPipeline.processQueueItem(item, modelConfigs, progressCallback)
    │       │
    │       ├── Step 1: executeStoryStep()
    │       │       ├── nodeQueueManager.addTask('story', ...)
    │       │       ├── AI generates story
    │       │       ├── Parse response, validate
    │       │       ├── updateProgress() → progressCallback()
    │       │       └── storyDataManager.updateStory()
    │       │
    │       ├── Step 2-7: Similar pattern
    │       │
    │       └── Return completed EnhancedStory
    │
    └── Convert to store format, save to Zustand
```

---

## 4. Story Data Manager System

### 4.1 Purpose

**File:** `src/services/storyDataManager.ts`

The Story Data Manager serves as an in-memory cache with thread-safe updates and store synchronization. It exists to:
1. Prevent data loss during concurrent updates
2. Provide reactive updates via subscriptions
3. Bridge between pipeline (EnhancedStory format) and store (Story format)

### 4.2 Data Structures

```typescript
// Cache Structure
interface StoryDataCache {
  [storyId: string]: {
    story: EnhancedStory;
    lastUpdated: Date;
    generationProgress: {
      currentStep: string;
      overallProgress: number;
      logs: AILogEntry[];
    };
  };
}

// Enhanced Format (used internally)
interface EnhancedStory {
  id: string;
  title: string;
  content: string;
  genre: string;
  shots: EnhancedShot[];
  characters: EnhancedCharacter[];
  locations: Location[];
  musicCues: MusicCue[];
  status: 'draft' | 'processing' | 'completed' | 'failed';
  aiLogs: AILogEntry[];
  createdAt: Date;
  updatedAt: Date;
}
```

### 4.3 Key Operations

| Method | Purpose | Thread Safety |
|--------|---------|---------------|
| `initializeStory()` | Create new cache entry | No lock needed |
| `updateStory()` | Update story fields | Uses lock + pending queue |
| `updateShot()` | Update individual shot | Max 10 retries with backoff |
| `syncToStore()` | Save to Zustand | Converts format |
| `subscribe()` | Observer pattern | Callback management |

### 4.4 How It SHOULD Work

```
Pipeline generates data
        │
        ▼
storyDataManager.updateStory(storyId, { shots: [...] })
        │
        ├── Acquire lock (or queue if locked)
        │
        ├── Deep merge with existing data
        │       ├── Preserve existing fields
        │       └── Update only changed fields
        │
        ├── Update cache
        │
        ├── Notify subscribers
        │
        └── Release lock, process pending updates

        │
        ▼ (on completion)

syncToStore(storyId)
        │
        ├── Convert EnhancedStory → Story format
        │       ├── Normalize field names (snake_case ↔ camelCase)
        │       └── Flatten nested structures
        │
        └── Call store.upsertStory(story)
```

### 4.5 Issues Identified

1. **Dual State Source**: Both Zustand store and storyDataManager cache can hold story data
2. **Sync Timing**: Cache may be out of sync with store during updates
3. **Memory Growth**: Cache doesn't auto-clear completed stories

---

## 5. Queue Systems

### 5.1 Queue Architecture

The application has **multiple overlapping queue systems**:

```
┌───────────────────────────────────────────────────────────────────────────┐
│                         QUEUE SYSTEMS OVERVIEW                            │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  1. ZUSTAND STORE QUEUE (Primary User-Facing Queue)                       │
│     ├── Location: useStore.ts → queue: QueueItem[]                        │
│     ├── Purpose: User-visible queue management                            │
│     ├── Operations: addToQueue, removeFromQueue, updateQueueItem          │
│     └── Persistence: localStorage via Zustand persist middleware          │
│                                                                           │
│  2. QUEUE PROCESSOR (Processing Orchestrator)                             │
│     ├── Location: queueProcessor.ts (Singleton)                           │
│     ├── Purpose: Coordinate pipeline execution                            │
│     ├── State: processingLock, isRunning, currentItemId                   │
│     └── Note: Reads from Zustand queue, calls pipeline                    │
│                                                                           │
│  3. NODE QUEUE MANAGER (Task Distribution Queue)                          │
│     ├── Location: nodeQueueManager.ts                                     │
│     ├── Purpose: Distribute tasks to AI nodes                             │
│     ├── Queues:                                                           │
│     │   ├── story (1 concurrent)                                          │
│     │   ├── shots (4 concurrent)                                          │
│     │   ├── analysis (2 concurrent)                                       │
│     │   ├── prompts (8 concurrent)                                        │
│     │   ├── comfyui_prompts (6 concurrent)                                │
│     │   └── audio (2 concurrent)                                          │
│     └── Note: Auto-processing DISABLED to prevent double execution        │
│                                                                           │
│  4. BACKEND QUEUE (Database Queue)                                        │
│     ├── Location: backend/server.js → story_queue table                   │
│     ├── Purpose: Persistent backup queue                                  │
│     └── Note: Not actively used during processing                         │
│                                                                           │
│  5. SEQUENTIAL PIPELINE INTERNAL QUEUE                                    │
│     ├── Location: sequentialAiPipeline.ts                                 │
│     ├── Purpose: Track active processes                                   │
│     └── State: activeProcesses Map, nodeAssignments Map                   │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

### 5.2 QueueItem Structure

```typescript
interface QueueItem {
  id: string;                    // Unique identifier
  config: StoryConfig;           // Generation configuration
  priority: number;              // 1-10 (10 = immediate)
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;              // 0-100
  currentStep: string;           // Current pipeline step
  error?: string;                // Error message if failed
  logs: AILogEntry[];            // Processing logs
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  storyId?: string;              // Link to generated story
}

interface StoryConfig {
  prompt: string;
  genre: string;
  length: string;
  visualStyle: string;
  aspectRatio: string;
  fps: string;
  autoPrompt: boolean;
  priority: number;
  characterConsistency: boolean;
  musicGeneration: boolean;
  narrationGeneration: boolean;
}
```

### 5.3 Queue Processing Flow

```
START PROCESSING
        │
        ▼
queueProcessor.startProcessing()
        │
        ├── validateSetup() - Check models and nodes
        │
        ├── isRunning = true
        │
        └── processQueueItems() loop
                │
                ▼
        ┌───────────────────────────────────────┐
        │  For each item (sorted by priority):  │
        │                                       │
        │  1. Skip if status !== 'queued'       │
        │  2. Skip if in processingLock set     │
        │  3. Add to processingLock             │
        │  4. Update status to 'processing'     │
        │  5. Call processItem(item)            │
        │  6. On success: status='completed'    │
        │  7. On error: status='failed'         │
        │  8. Remove from processingLock        │
        │                                       │
        └───────────────────────────────────────┘
                │
                ▼
        Check for more queued items
                │
        ├── Yes → Continue loop
        └── No → isRunning = false, exit
```

### 5.4 Issues Identified

1. **Queue Redundancy**: 5 different queue concepts with overlapping responsibilities
2. **Sync Issues**: Backend queue rarely synced with frontend queue
3. **Priority Confusion**: High priority items auto-start, but queue order may not reflect this
4. **Lock Leakage**: If processing fails unexpectedly, items may stay locked

---

## 6. Node Discovery & Management System

### 6.1 Node Types

```typescript
interface OllamaNode {
  id: string;                    // host:port or api_type
  name: string;                  // Human-readable name
  host: string;
  port: number;
  status: 'online' | 'offline' | 'checking';
  models: string[];              // Available models
  version?: string;
  lastChecked: Date;
  type: 'ollama' | 'openai' | 'claude' | 'elevenlabs' | 'suno' | 'comfyui';
  category: 'local' | 'online';
}
```

### 6.2 Supported Services

| Type | Category | Models Available |
|------|----------|-----------------|
| **Ollama** | Local | Dynamic (scanned from node) |
| **OpenAI** | Online | gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-4, gpt-3.5-turbo |
| **Claude** | Online | claude-3-5-sonnet, claude-3-5-haiku, claude-3-opus |
| **ElevenLabs** | Online | eleven_multilingual_v2, eleven_turbo_v2 |
| **Suno** | Online | chirp-v3-5, chirp-v3-0 |
| **ComfyUI** | Local | flux-schnell, flux-dev, sdxl-turbo, sdxl-base, sd-v1.5 |

### 6.3 Network Scanning Logic

**File:** `src/services/nodeDiscovery.ts`

```
scanLocalNetwork()
        │
        ├── Scan common hosts:
        │   ├── localhost, 127.0.0.1
        │   └── ollama.local, ai.local, gpu.local, server.local
        │
        ├── Scan common ports:
        │   └── 11434, 11435, 11436, 8080, 8000, 3000, 7860, 8188
        │
        ├── Scan IP ranges:
        │   ├── 192.168.1.x (1-30, 100, 101, 150, 160-165, 200, 254)
        │   ├── 192.168.0.x (same)
        │   ├── 10.0.0.x (same)
        │   └── 10.0.1.x (same)
        │
        ├── Batch processing: 50 nodes at a time
        │
        └── For each potential node:
            │
            ├── checkNode(host, port)
            │   ├── HTTP GET /api/tags (1s timeout)
            │   ├── If success → node online, get models
            │   └── If fail → skip
            │
            └── Deduplicate (localhost vs 127.0.0.1)
```

### 6.4 Model Configuration

```typescript
interface ModelConfig {
  id: string;           // Unique instance ID
  step: string;         // Pipeline step name
  nodeId: string;       // Which node to use
  model: string;        // Which model on that node
  enabled: boolean;     // Is this config active
  priority: number;     // Order preference
}
```

**Step-to-Model Mapping (Settings Page):**
- story → Configured model for story generation
- segment → (uses story model or separate)
- shots → Configured model for shot breakdown
- characters → Configured model for character analysis
- prompts → Configured model for visual prompts
- narration → Configured model for narration
- music → Configured model for music cues

### 6.5 How It SHOULD Work

```
Application Start
        │
        ▼
App.tsx calls nodeDiscoveryService.scanLocalNetwork()
        │
        ▼
Nodes discovered and stored in service
        │
        ▼
User opens Settings page
        │
        ├── Sees available nodes
        ├── Configures which node/model for each step
        └── Saves to Zustand store.settings.modelConfigs

        │
        ▼ (During Processing)

Pipeline needs node for 'story' step
        │
        ├── Get modelConfigs where step='story' and enabled=true
        ├── Find matching nodes (online, has model)
        ├── Select node with lowest current task count
        └── Assign task to node
```

### 6.6 Issues Identified

1. **No Auto-Refresh**: Nodes scanned only on app start
2. **API Key Validation**: Can consume credits on validation
3. **No Health Monitoring**: No periodic health checks during processing
4. **CORS Issues**: Browser restrictions may block local node checks

---

## 7. Database & Backend System

### 7.1 Database Schema

**Location:** `backend/film_generator.db` (SQLite)

```sql
-- Stories Table
CREATE TABLE stories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  characters TEXT,      -- JSON array
  shots TEXT,           -- JSON array
  metadata TEXT,        -- JSON object
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Queue Table
CREATE TABLE story_queue (
  id TEXT PRIMARY KEY,
  config TEXT NOT NULL,  -- JSON
  priority INTEGER DEFAULT 5,
  status TEXT DEFAULT 'queued',
  progress INTEGER DEFAULT 0,
  error TEXT,            -- JSON
  result TEXT,           -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Generation Logs Table
CREATE TABLE generation_logs (
  id TEXT PRIMARY KEY,
  story_id TEXT,
  step TEXT NOT NULL,
  result TEXT,           -- JSON
  metadata TEXT,         -- JSON
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 7.2 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/health` | Health check |
| GET | `/api/stories` | List all stories |
| POST | `/api/stories` | Create story |
| GET | `/api/stories/:id` | Get single story |
| PUT | `/api/stories/:id` | Update story |
| DELETE | `/api/stories/:id` | Delete story |
| GET | `/api/queue` | List queue items |
| POST | `/api/queue` | Add to queue |
| PUT | `/api/queue/:id` | Update queue item |
| DELETE | `/api/queue/:id` | Remove from queue |
| DELETE | `/api/queue?status=completed` | Clear completed |
| POST | `/api/generations` | Save generation log |
| GET | `/api/generations/:storyId` | Get logs for story |

### 7.3 How Backend SHOULD Work

```
Frontend creates story
        │
        ├── Zustand store.addStory(story)
        │       └── Persisted to localStorage
        │
        └── apiClient.createStory(story)
                └── POST /api/stories
                        └── Saved to SQLite

        │
        ▼ (On page load)

Frontend loads data
        │
        ├── First: Load from localStorage (fast)
        │
        └── Then: apiClient.getStories()
                └── GET /api/stories
                        └── Sync with backend
```

### 7.4 Issues Identified

1. **Dual Persistence**: Both localStorage and backend store same data
2. **No Sync Strategy**: No conflict resolution when data differs
3. **Backend Underutilized**: Most operations happen in localStorage only
4. **Missing Indexes**: No database indexes for performance
5. **No Foreign Keys**: No referential integrity enforced

---

## 8. GUI Components

### 8.1 Page Structure

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         APPLICATION LAYOUT                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐  ┌──────────────────────────────────────────────────┐ │
│  │   SIDEBAR   │  │                    MAIN CONTENT                  │ │
│  │ ─────────── │  │                                                  │ │
│  │ • Dashboard │  │  Route-based page rendering                      │ │
│  │ • Generator │  │                                                  │ │
│  │ • Queue     │  │  ┌──────────────────────────────────────────┐   │ │
│  │ • Research  │  │  │           DASHBOARD                      │   │ │
│  │ • Metrics   │  │  │  • Metrics cards                         │   │ │
│  │ • Settings  │  │  │  • Trend charts                          │   │ │
│  │             │  │  │  • Active nodes                          │   │ │
│  │             │  │  └──────────────────────────────────────────┘   │ │
│  │             │  │                                                  │ │
│  │             │  │  ┌──────────────────────────────────────────┐   │ │
│  │             │  │  │        STORY GENERATOR                   │   │ │
│  │             │  │  │  • Prompt input                          │   │ │
│  │             │  │  │  • Configuration options                 │   │ │
│  │             │  │  │  • Generate / Add to Queue buttons       │   │ │
│  │             │  │  └──────────────────────────────────────────┘   │ │
│  │             │  │                                                  │ │
│  │             │  │  ┌──────────────────────────────────────────┐   │ │
│  │             │  │  │           STORY QUEUE                    │   │ │
│  │             │  │  │  • Queue table with progress             │   │ │
│  │             │  │  │  • Start/Stop processing                 │   │ │
│  │             │  │  │  • Queue statistics                      │   │ │
│  │             │  │  └──────────────────────────────────────────┘   │ │
│  │             │  │                                                  │ │
│  └─────────────┘  └──────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Story Detail View

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         STORY DETAIL VIEW                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  HEADER                                                          │   │
│  │  [← Back]  Story Title  [Status Badge]  [Live Updates Indicator] │   │
│  │  Progress: ████████████░░░░░░░░ 65%  Current Step: Creating Shots│   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  TABS                                                            │   │
│  │  [Story] [Shotlist] [Style Sheet] [AI Chat] [Settings]           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  TAB CONTENT:                                                          │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  STORY TAB                                                       │   │
│  │  • Title and content display                                     │   │
│  │  • Story statistics (shots, characters, locations)               │   │
│  │  • Characters accordion                                          │   │
│  │  • Locations accordion                                           │   │
│  │  • Music cues accordion                                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  SHOTLIST TAB                                                    │   │
│  │  • Overview card (shot count, rendering progress)                │   │
│  │  • Individual shot cards with:                                   │   │
│  │    - Shot number, duration, camera                               │   │
│  │    - Description                                                 │   │
│  │    - Expandable: Technical details, prompts, audio               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  STYLE SHEET TAB                                                 │   │
│  │  • Characters section (appearance, visual prompts)               │   │
│  │  • Locations section (description, color palette)                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  AI CHAT TAB                                                     │   │
│  │  • Log entries with timestamps                                   │   │
│  │  • Filter and search                                             │   │
│  │  • Auto-scroll to new entries                                    │   │
│  │  • Expandable details (prompts, responses)                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  SETTINGS TAB                                                    │   │
│  │  • Pipeline execution overview                                   │   │
│  │  • Original request configuration                                │   │
│  │  • Per-step details (node, model, duration, tokens)              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.3 AI Pipeline Steps Display

**StoryQueue Step Mapping:**
```typescript
const stepNames = {
  'story': '📝 Writing Story',
  'shots': '🎬 Creating Shots',
  'characters': '👥 Analyzing Characters',
  'prompts': '🎨 Generating Prompts',
  'comfyui_prompts': '🖼️ ComfyUI Prompts',
  'narration': '🎙️ Adding Narration',
  'music': '🎵 Adding Music',
  'completed': '✅ Finalizing'
};
```

### 8.4 Issues Identified

1. **Step Name Inconsistency**: Pipeline may send display names, UI expects IDs
2. **Progress Not Updating**: Callback chain may break (ID mismatch)
3. **Logs Empty**: sequentialAiPipeline may not populate logs array
4. **No Error Details**: Failed steps don't show detailed error info

---

## 9. System Interactions & Data Flow

### 9.1 Complete Generation Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE STORY GENERATION FLOW                       │
└─────────────────────────────────────────────────────────────────────────┘

USER ACTION: Click "Generate Story"
        │
        ▼
┌───────────────────────────────────────────────────────────────────────┐
│ FRONTEND (StoryGenerator.tsx)                                         │
│                                                                       │
│ 1. Create QueueItem with priority=10                                  │
│ 2. Call store.addToQueue(item)                                        │
│ 3. Navigate to /queue                                                 │
└───────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────────┐
│ ZUSTAND STORE (useStore.ts)                                           │
│                                                                       │
│ 1. Add item to queue[]                                                │
│ 2. Persist to localStorage                                            │
│ 3. Trigger React re-render                                            │
└───────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────────┐
│ FRONTEND (StoryQueue.tsx)                                             │
│                                                                       │
│ 1. Detect high-priority item (priority >= 10)                         │
│ 2. Auto-call queueProcessor.startProcessing()                         │
│ 3. Subscribe to status changes                                        │
└───────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────────┐
│ QUEUE PROCESSOR (queueProcessor.ts)                                   │
│                                                                       │
│ 1. Validate setup (models configured, nodes online)                   │
│ 2. Set isRunning = true                                               │
│ 3. Get queued items, sort by priority                                 │
│ 4. For each item:                                                     │
│    a. Add to processingLock                                           │
│    b. Update status to 'processing'                                   │
│    c. Create progressCallback                                         │
│    d. Call sequentialAiPipeline.processQueueItem()                    │
└───────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────────┐
│ SEQUENTIAL AI PIPELINE (sequentialAiPipeline.ts)                      │
│                                                                       │
│ 1. Register progressCallback with queueItem.id as key                 │
│ 2. Initialize progress tracking                                       │
│                                                                       │
│ STEP 1: STORY GENERATION                                              │
│ ├── Get model config for 'story' step                                 │
│ ├── nodeQueueManager.addTask('story', {...})                          │
│ │   └── Calls AI via Ollama/OpenAI/Claude                             │
│ ├── Parse response to extract title/content                           │
│ ├── Validate with validationService                                   │
│ ├── Save partial story to storyDataManager                            │
│ └── updateProgress() → progressCallback()                             │
│                                                                       │
│ STEP 2: SEGMENTATION                                                  │
│ ├── (Similar pattern)                                                 │
│ └── Output: Story parts array                                         │
│                                                                       │
│ STEP 3: SHOT BREAKDOWN                                                │
│ ├── (Similar pattern)                                                 │
│ └── Output: Shots array                                               │
│                                                                       │
│ STEP 4: CHARACTER ANALYSIS                                            │
│ ├── (Similar pattern)                                                 │
│ └── Output: Characters array                                          │
│                                                                       │
│ STEP 5: VISUAL PROMPTS                                                │
│ ├── For each shot (can be parallel)                                   │
│ ├── Generate ComfyUI positive/negative prompts                        │
│ └── Update shots with prompts                                         │
│                                                                       │
│ STEP 6: NARRATION (Optional)                                          │
│ STEP 7: MUSIC (Optional)                                              │
│                                                                       │
│ COMPLETION:                                                           │
│ ├── Sync to Zustand store                                             │
│ └── Return EnhancedStory                                              │
└───────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────────┐
│ PROGRESS UPDATE FLOW                                                  │
│                                                                       │
│ sequentialAiPipeline.updateProgress()                                 │
│        │                                                              │
│        ▼                                                              │
│ progressCallbacks.get(progress.storyId)() ← POTENTIAL MISMATCH!       │
│        │                                                              │
│        ▼                                                              │
│ queueProcessor.progressCallback()                                     │
│        │                                                              │
│        ▼                                                              │
│ store.updateQueueItem(id, {progress, currentStep, logs})              │
│        │                                                              │
│        ▼                                                              │
│ React re-renders StoryQueue                                           │
│        │                                                              │
│        ▼                                                              │
│ UI shows updated progress bar and step name                           │
└───────────────────────────────────────────────────────────────────────┘
```

### 9.2 Data Format Transformations

```
USER INPUT                    PIPELINE FORMAT               STORE FORMAT
─────────────────────────────────────────────────────────────────────────

{                             EnhancedStory {               Story {
  prompt: "...",                id: "story_123",              id: "story_123",
  genre: "Drama",               title: "...",                 title: "...",
  length: "Medium",             content: "...",               content: "...",
  ...                           genre: "Drama",               genre: "Drama",
}                               shots: EnhancedShot[],        shots: Shot[],
        │                       characters: EnhancedChar[],   characters: Char[],
        │                       locations: Location[],        status: "completed",
        │                       musicCues: MusicCue[],        generationData: {...}
        ▼                       aiLogs: AILogEntry[],       }
                                status: "completed",
  QueueItem {                   ...
    id: "queue_123",          }
    config: {...},
    priority: 10,                      │
    status: "processing",              │ storyDataManager
    progress: 45,                      │ .syncToStore()
    currentStep: "shots",              ▼
    logs: [],
    storyId: "story_123"      ┌─────────────────────┐
  }                           │ Field Normalization │
                              │                     │
                              │ snake_case ↔ camelCase
                              │ physical_description ↔ physicalDescription
                              │ shot_number ↔ shotNumber
                              └─────────────────────┘
```

---

## 10. Simplification Analysis

### 10.1 Current Complexity Assessment

| Area | Current State | Complexity Score |
|------|--------------|------------------|
| Pipeline Services | 3 implementations | HIGH ❌ |
| Queue Systems | 5 overlapping queues | HIGH ❌ |
| State Management | 3 sources of truth | MEDIUM ⚠️ |
| Data Formats | Multiple transformations | MEDIUM ⚠️ |
| Node Management | Single service | LOW ✅ |
| Backend | Simple REST API | LOW ✅ |

### 10.2 Recommended Simplifications

#### A. Consolidate Pipeline Services

**Current:** 3 pipeline implementations
**Recommended:** 1 pipeline service

```
KEEP: sequentialAiPipeline.ts (primary, has dependency tracking)
DELETE: aiPipeline.ts (legacy, no longer used)
DELETE: enhancedAiPipeline.ts (parallel execution not needed)
```

**Rationale:**
- Sequential pipeline is most reliable
- Parallel execution adds complexity without significant benefit
- Dependency tracking ensures correct order

#### B. Simplify Queue Architecture

**Current:** 5 queue systems
**Recommended:** 2 queue systems

```
KEEP: Zustand store queue (user-facing)
KEEP: nodeQueueManager (task distribution within pipeline)
ELIMINATE: Backend queue (use only for backup/sync)
ELIMINATE: Sequential pipeline internal tracking (use queueProcessor)
```

**New Architecture:**
```
User → Zustand Queue → QueueProcessor → Sequential Pipeline → nodeQueueManager → AI
```

#### C. Unified State Management

**Current:** Zustand + localStorage + storyDataManager cache
**Recommended:** Zustand as single source of truth

```
CHANGES:
1. Remove storyDataManager in-memory cache
2. Update Zustand store directly from pipeline
3. Use localStorage only for persistence (via Zustand middleware)
4. Backend becomes backup/sync only
```

#### D. Standardize Data Formats

**Current:** Multiple formats with transformations
**Recommended:** Single format throughout

```typescript
// Use EnhancedStory format everywhere
// Remove field name transformations
// Store EnhancedStory directly in Zustand
```

### 10.3 Simplified Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      SIMPLIFIED ARCHITECTURE                            │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│      UI         │────▶│   ZUSTAND       │────▶│    BACKEND      │
│  Components     │◀────│   STORE         │◀────│   (SQLite)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │ QUEUE PROCESSOR │
                        │  (Singleton)    │
                        └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │  SEQUENTIAL     │
                        │  PIPELINE       │
                        └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │ NODE QUEUE MGR  │────▶ AI Providers
                        │ (Task Distrib)  │
                        └─────────────────┘
```

---

## 11. Bug Tracking & Missing Features

### 11.1 Critical Bugs

| ID | Description | Location | Status | Priority |
|----|-------------|----------|--------|----------|
| BUG-001 | Progress callback ID mismatch | sequentialAiPipeline.ts:421 | **FIXED** | HIGH |
| BUG-002 | Logs array not populated | sequentialAiPipeline.ts | **FIXED** | HIGH |
| BUG-003 | Step ID vs display name confusion | Multiple files | **FIXED** | MEDIUM |
| BUG-004 | storyDataManager lock deadlock potential | storyDataManager.ts | PARTIAL FIX | MEDIUM |
| BUG-005 | Backend queue not synced | queueProcessor.ts | OPEN | LOW |
| BUG-006 | Live updates not reaching StoryDetail | sequentialAiPipeline.ts | **FIXED** | HIGH |
| BUG-007 | White-on-white text in dark mode | AIChatTab.tsx | **FIXED** | MEDIUM |

### 11.1.1 Fixes Applied (December 2024)

**BUG-001 & BUG-003 Fix:** Updated `queueProcessor.ts` to pass step ID instead of step name:
```typescript
// Now uses step ID for proper UI mapping
currentStep: progress.currentStep || 'processing',
```

**BUG-006 Fix:** Updated `sequentialAiPipeline.ts` to sync to Zustand store after each step:
```typescript
// The storyDataManager wrapper now calls store.upsertStory()
// after each savePartialStory() to enable live UI updates
```

**BUG-007 Fix:** Updated `AIChatTab.tsx` with dark mode aware styling:
```typescript
backgroundColor: theme => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
color: theme => theme.palette.mode === 'dark' ? 'primary.light' : 'primary.dark'
```

### 11.2 Bug Details

#### BUG-001: Progress Callback ID Mismatch

**Problem:**
```typescript
// Registration uses queueItem.id
this.progressCallbacks.set(queueItem.id, onProgress);

// Lookup uses progress.storyId (may differ!)
const callback = this.progressCallbacks.get(progress.storyId);
```

**Fix:**
```typescript
// Ensure consistency in updateProgress:
private updateProgress(progress: SequentialProgress, stepId: string, ...) {
  // Use the same ID that was used for registration
  const callback = this.progressCallbacks.get(progress.storyId);
  // OR ensure progress.storyId is set to queueItem.id on initialization
}
```

#### BUG-002: Logs Not Populated

**Problem:** Sequential pipeline initializes `logs: []` but never adds entries.

**Fix:** Add log entries in each execute*Step method:
```typescript
private async executeStoryStep(progress: SequentialProgress, ...) {
  this.addLog(progress, 'info', 'story', 'Starting story generation...');
  // ... execution ...
  this.addLog(progress, 'success', 'story', 'Story generated successfully');
}

private addLog(progress: SequentialProgress, level: string, step: string, message: string) {
  progress.logs.unshift({
    id: Date.now().toString(),
    timestamp: new Date(),
    step,
    level,
    message
  });
  // Rotate if > MAX_LOGS
  if (progress.logs.length > 500) {
    progress.logs = progress.logs.slice(0, 500);
  }
}
```

#### BUG-003: Step ID vs Display Name

**Problem:** Pipeline sends human-readable names, UI maps IDs to names.

**Fix:** Always use step IDs in pipeline, let UI handle display:
```typescript
// Pipeline sends:
this.updateProgress(progress, 'story', 'Story Generation', 20);
// But currentStep should be the ID 'story', not 'Story Generation'

// Ensure updateProgress uses stepId, not stepName for currentStep:
progress.currentStep = stepId;  // 'story'
progress.currentStepName = stepName;  // 'Story Generation' (for display)
```

### 11.3 Missing Features

| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| FEAT-001 | Node health monitoring | Periodic checks during processing | HIGH |
| FEAT-002 | Retry with backoff UI | Show retry attempts in UI | MEDIUM |
| FEAT-003 | Queue reordering | Drag-and-drop queue management | MEDIUM |
| FEAT-004 | Batch processing | Generate multiple stories in sequence | LOW |
| FEAT-005 | Export formats | Export to various video formats | LOW |
| FEAT-006 | Template system | Save/load generation configurations | LOW |

### 11.4 Technical Debt

| ID | Description | Location | Effort |
|----|-------------|----------|--------|
| DEBT-001 | Remove aiPipeline.ts (legacy) | src/services/ | LOW |
| DEBT-002 | Remove enhancedAiPipeline.ts | src/services/ | LOW |
| DEBT-003 | Add database indexes | backend/server.js | LOW |
| DEBT-004 | Consolidate queue systems | Multiple files | HIGH |
| DEBT-005 | Standardize data formats | Multiple files | HIGH |
| DEBT-006 | Add TypeScript strict mode | tsconfig.json | MEDIUM |

---

## 12. Implementation Recommendations

### 12.1 Immediate Fixes (Do Now)

1. **Fix Progress Callback ID Mismatch** (BUG-001)
   - Ensure `progress.storyId` matches the key used in `progressCallbacks.set()`
   - Or use a consistent identifier throughout

2. **Add Log Population** (BUG-002)
   - Implement `addLog()` method in sequentialAiPipeline.ts
   - Call at start/end of each step

3. **Fix Step ID/Name Handling** (BUG-003)
   - Always send step IDs to store
   - Let UI components handle display name mapping

### 12.2 Short-term Improvements (This Sprint)

1. **Remove Legacy Pipeline Services**
   - Delete `aiPipeline.ts`
   - Delete `enhancedAiPipeline.ts`
   - Update any imports

2. **Add Node Health Monitoring**
   - Periodic health checks (every 30s during processing)
   - Auto-failover to backup node if primary goes offline

3. **Simplify State Flow**
   - Update Zustand store directly from pipeline
   - Remove intermediate caching in storyDataManager

### 12.3 Long-term Refactoring (Next Quarter)

1. **Unified Data Format**
   - Use EnhancedStory format everywhere
   - Remove field name transformations
   - Update all components to use new format

2. **Queue System Consolidation**
   - Single queue in Zustand
   - nodeQueueManager for task distribution only
   - Backend for backup/sync only

3. **Backend Enhancement**
   - Add database indexes
   - Implement proper sync strategy
   - Add foreign key constraints

### 12.4 Testing Strategy

| Test Type | Coverage Area | Priority |
|-----------|---------------|----------|
| Unit Tests | Validation service | HIGH |
| Unit Tests | Data transformations | HIGH |
| Integration Tests | Pipeline execution | HIGH |
| E2E Tests | Full generation flow | MEDIUM |
| Load Tests | Multiple concurrent generations | LOW |

---

## Appendix A: File Reference

| File | Purpose | Status |
|------|---------|--------|
| `src/services/aiPipeline.ts` | Legacy pipeline | DEPRECATED |
| `src/services/enhancedAiPipeline.ts` | Parallel pipeline | UNUSED |
| `src/services/sequentialAiPipeline.ts` | Main pipeline | ACTIVE |
| `src/services/queueProcessor.ts` | Queue orchestrator | ACTIVE |
| `src/services/nodeQueueManager.ts` | Task distribution | ACTIVE |
| `src/services/nodeDiscovery.ts` | Node detection | ACTIVE |
| `src/services/validationService.ts` | Data validation | ACTIVE |
| `src/services/storyDataManager.ts` | Data caching | ACTIVE (consider removal) |
| `src/services/apiClient.ts` | Backend API | ACTIVE |
| `src/store/useStore.ts` | State management | ACTIVE |
| `backend/server.js` | Backend server | ACTIVE |

---

## Appendix B: Data Type Reference

See `src/types/storyTypes.ts` for complete type definitions:
- `EnhancedStory`
- `EnhancedShot`
- `EnhancedCharacter`
- `Location`
- `MusicCue`
- `AILogEntry`

See `src/store/useStore.ts` for store types:
- `QueueItem`
- `StoryConfig`
- `Story`
- `Shot`
- `Character`
- `Settings`
- `ModelConfig`

---

*Document generated: December 2024*
*Version: 1.0*
