# AI Pipeline Steps - Detailed Guide

## Overview

The story generator uses a **7-step sequential AI pipeline** to transform a story prompt into a complete video-ready package with shots, characters, visual prompts, narration, and music cues.

---

## Pipeline Flow Diagram

```
User Input (prompt, genre, length)
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Story Generation                                   │
│  📝 Writing Story                                           │
│  Dependencies: None                                         │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: Story Segmentation                                 │
│  📑 Segmenting Story                                        │
│  Dependencies: Story                                        │
└─────────────────────────────────────────────────────────────┘
         │
         ├──────────────────────┐
         ▼                      ▼
┌──────────────────────┐  ┌──────────────────────┐
│  STEP 3: Shots       │  │  STEP 4: Characters  │
│  🎬 Creating Shots   │  │  👥 Analyzing Chars  │
│  Deps: Story+Segments│  │  Dependencies: Story │
└──────────────────────┘  └──────────────────────┘
         │                      │
         └──────────┬───────────┘
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 5: Visual Prompts                                     │
│  🎨 Generating Prompts                                      │
│  Dependencies: Shots + Characters                           │
└─────────────────────────────────────────────────────────────┘
         │
         ├──────────────────────┐
         ▼                      ▼
┌──────────────────────┐  ┌──────────────────────┐
│  STEP 6: Narration   │  │  STEP 7: Music       │
│  🎙️ Adding Narration │  │  🎵 Adding Music     │
│  (Optional)          │  │  (Optional)          │
│  Dependencies: Shots │  │  Dependencies: Shots │
└──────────────────────┘  └──────────────────────┘
         │                      │
         └──────────┬───────────┘
                    ▼
              ✅ Complete
```

---

## Step Details

### Step 1: Story Generation
**ID:** `story`
**Display Name:** 📝 Writing Story
**Required:** Yes
**Dependencies:** None

#### What the AI Does:
1. Takes the user's prompt, genre, and length settings
2. Generates a complete narrative story with:
   - **Title** (3-5 words)
   - **Logline** (10-15 word summary)
   - **Duration** estimate
   - **Multiple Parts** with timestamps (e.g., PART 1 [0:00])
   - **Hooks** at the end of each part for suspense

#### AI Output Format:
```
Title: [Story Title]
Logline: [Brief summary]
Duration: [X minutes]

PART 1 [0:00]
[40-60 words of narrative]
HOOK: [Suspenseful ending]

PART 2 [1:00]
[40-60 words continuing story]
HOOK: [Next cliffhanger]
...
```

#### GUI Display:
- Progress bar shows 0-14% (first of 7 steps)
- Current step text: "📝 Writing Story"
- AI logs show: "Starting story generation for [prompt]..."
- On completion: "Generated: [Story Title]"

---

### Step 2: Story Segmentation
**ID:** `segments`
**Display Name:** 📑 Segmenting Story
**Required:** Yes
**Dependencies:** Story

#### What the AI Does:
1. Analyzes the complete story
2. Breaks it into logical narrative parts for video production
3. Identifies the purpose of each part (introduction, conflict, climax, resolution)
4. Estimates duration for each segment

#### AI Output Format (JSON):
```json
{
  "parts": [
    {
      "part_number": 1,
      "title": "Opening/Setup",
      "content": "The specific story content...",
      "duration_estimate": 15.0,
      "narrative_purpose": "introduction"
    }
  ]
}
```

#### GUI Display:
- Progress bar shows 14-28%
- Current step text: "📑 Segmenting Story"
- AI logs show: "Segmenting story into parts..."
- On completion: "Story segmented into X parts"

---

### Step 3: Shot Breakdown
**ID:** `shots`
**Display Name:** 🎬 Creating Shots
**Required:** Yes
**Dependencies:** Story + Segments

#### What the AI Does:
1. Analyzes each story segment
2. Creates detailed filmable shots with:
   - **Shot number** and **description** (detailed visual scene)
   - **Duration** (3-8 seconds typically)
   - **Camera type** (wide, medium, close-up, extreme close-up)
   - **Camera movement** (static, tracking, pan, tilt, zoom)
   - **Narration** (if characters speak)
   - **Music cue** (for emotional beats)

#### AI Output Format (JSON):
```json
{
  "shots": [
    {
      "shot_number": 1,
      "description": "Maya, a worried 30-year-old woman in casual clothes, approaches the weathered wooden front door...",
      "duration": 4.0,
      "frames": 96,
      "camera": "medium shot tracking",
      "narration": "dialogue if any",
      "music_cue": "dramatic tense"
    }
  ],
  "total_duration": 60.0
}
```

#### GUI Display:
- Progress bar shows 28-42%
- Current step text: "🎬 Creating Shots"
- AI logs show: "Creating shot breakdown for part X..."
- On completion: "Generated X shots"

---

### Step 4: Character Analysis
**ID:** `characters`
**Display Name:** 👥 Analyzing Characters
**Required:** Yes
**Dependencies:** Story (can run parallel with shots in theory)

#### What the AI Does:
1. Extracts all characters from the story
2. Creates detailed visual descriptions for AI art consistency:
   - **Name** and **role** (protagonist, antagonist, supporting)
   - **Physical description** (detailed for AI generation)
   - **Age range** (young adult, middle-aged, elderly)
   - **Clothing style**
   - **Personality traits** affecting appearance
   - **Importance level** (1-5 scale)

#### AI Output Format (JSON):
```json
{
  "characters": [
    {
      "name": "Maya",
      "role": "protagonist",
      "physical_description": "30-year-old woman, dark wavy hair, expressive brown eyes, fair skin",
      "age_range": "young adult",
      "clothing_style": "casual modern - jeans and sweater",
      "personality_traits": "anxious but determined",
      "importance_level": 5
    }
  ],
  "locations": [
    {
      "name": "Victorian House",
      "description": "Old weathered Victorian home with peeling paint...",
      "environment_type": "indoor/outdoor",
      "time_of_day": "evening",
      "lighting_style": "dramatic",
      "importance_level": 4
    }
  ]
}
```

#### GUI Display:
- Progress bar shows 42-56%
- Current step text: "👥 Analyzing Characters"
- AI logs show: "Analyzing characters and locations..."
- On completion: "Analyzed X characters"

---

### Step 5: Visual Prompts (ComfyUI Prompts)
**ID:** `prompts`
**Display Name:** 🎨 Generating Prompts
**Required:** Yes
**Dependencies:** Shots + Characters

#### What the AI Does:
1. For each shot, generates AI image/video generation prompts
2. Incorporates character descriptions for consistency
3. Creates both **positive** and **negative** prompts optimized for:
   - ComfyUI / Stable Diffusion
   - Cinematic quality
   - Character consistency

#### AI Output Format (JSON):
```json
{
  "positive": "Maya, 30-year-old woman with dark wavy hair and brown eyes, wearing casual jeans and sweater, approaching weathered Victorian door, medium shot tracking, dramatic evening lighting, cinematic, photorealistic, masterpiece, best quality, highly detailed, 8k",
  "negative": "blurry, low quality, distorted, deformed, bad anatomy, extra limbs, bad hands, watermark, text, logo, signature, jpeg artifacts, pixelated, cropped, out of frame"
}
```

#### GUI Display:
- Progress bar shows 56-70%
- Current step text: "🎨 Generating Prompts"
- AI logs show: "Generated ComfyUI prompts for shot X"
- Progress updates per shot: "Generated visual prompt for shot X/Y (Z%)"
- On completion: "Generated visual prompts for X shots"

---

### Step 6: Narration Generation (Optional)
**ID:** `narration`
**Display Name:** 🎙️ Adding Narration
**Required:** No (only if `narrationGeneration` is enabled)
**Dependencies:** Shots

#### What the AI Does:
1. Creates voice-over narration with precise timestamps
2. Ensures timing matches shot durations
3. Writes natural spoken dialogue (2-3 words per second)

#### AI Output Format:
```
[0:00] "The old house stood silent."
[0:04] "Maya hesitated... then stepped forward."
[0:08] "Something was wrong."
```

#### GUI Display:
- Progress bar shows 70-85%
- Current step text: "🎙️ Adding Narration"
- AI logs show: "Generating narration for shots..."
- On completion: "Processed narration for X shots"

---

### Step 7: Music Cue Generation (Optional)
**ID:** `music`
**Display Name:** 🎵 Adding Music
**Required:** No (only if `musicGeneration` is enabled)
**Dependencies:** Shots

#### What the AI Does:
1. Identifies key emotional moments in the story
2. Creates music cues with:
   - Timestamp
   - Music style (ambient, electronic, orchestral, etc.)
   - Emotion (mysterious, tense, triumphant, etc.)
   - Volume level (1-10)
   - Duration

#### AI Output Format:
```
[0:00] ambient mysterious 3 15s
[0:45] electronic tense 7 30s
[2:30] orchestral triumphant 9 20s
```

#### GUI Display:
- Progress bar shows 85-100%
- Current step text: "🎵 Adding Music"
- AI logs show: "Generating music cues for X shots"
- On completion: "Generated music cues for X shots"

---

## GUI Components

### StoryQueue Page
Shows the queue of stories being processed with:

| Column | Description |
|--------|-------------|
| Position | Queue order (1, 2, 3...) |
| Story | First 30 chars of prompt |
| Genre | Drama, Comedy, Thriller, etc. |
| Priority | "Immediate" (red) or "Normal" (blue) |
| Status | Chip with icon: queued, processing, completed, failed |
| Progress | Progress bar with percentage and current step name |
| Actions | View, Cancel/Retry, Move Up/Down, Delete |

### Progress Display
```
┌─────────────────────────────────────────────────────┐
│  [████████████████░░░░░░░░░░░░░░░░░░░░░░] 42%       │
│  🎬 Creating Shots                                  │
└─────────────────────────────────────────────────────┘
```

### Processing Settings Panel
Shows:
- Processing status (active/paused)
- Current item being processed
- Current step name
- Configured models count
- Queue statistics

---

## AI Logs in AIChatTab

Each log entry shows:
- **Step icon/name** (with colored avatar)
- **Log level** (info, success, warning, error)
- **Timestamp** (HH:MM:SS format)
- **Message** describing what happened
- **Expandable details** (system prompt, user prompt, AI response)

### Log Entry Types:
1. **Request logs** - "🤖 AI Request to [node] ([model]) - [Step Name]"
2. **Response logs** - "✅ Response received: X characters"
3. **Progress logs** - "Generated visual prompt for shot X/Y"
4. **Error logs** - "❌ Failed to generate [step]: [error]"

---

## Model Configuration

Each step requires a configured AI model in Settings:

| Step | Config Key | Recommended Model Size |
|------|------------|----------------------|
| Story | `story` | Large (creative writing) |
| Segments | `story` | Same as story |
| Shots | `shots` | Medium-Large (structured output) |
| Characters | `characters` | Medium (analysis) |
| Prompts | `prompts` | Medium (prompt engineering) |
| Narration | `narration` | Small-Medium (simple text) |
| Music | `music` | Small-Medium (simple text) |

---

## Error Handling

Each step has:
- **Max retries**: 3 attempts (2 for prompts)
- **Error callbacks**: Log failure and notify UI
- **Partial saves**: Story data is saved after each major step
- **Abort support**: User can cancel processing at any time

---

## Data Flow Summary

```
Input: { prompt, genre, length, options }
                    │
Step 1 ────────────►│ Story { title, content, parts[] }
                    │
Step 2 ────────────►│ Segments { parts[] with content }
                    │
Step 3 ────────────►│ Shots[] { description, duration, camera, etc. }
                    │
Step 4 ────────────►│ Characters[] { name, description, role, etc. }
                    │
Step 5 ────────────►│ Shots[] += { visualPrompt, comfyUIPositivePrompt, comfyUINegativePrompt }
                    │
Step 6 ────────────►│ Shots[] += { narration (enhanced) }
                    │
Step 7 ────────────►│ Shots[] += { musicCue (enhanced) }
                    │
                    ▼
Output: Complete Story with all data for video generation
```

