# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Frontend (React)**
- `npm start` - Starts development server on http://localhost:3000
- `npm test` - Runs test suite in interactive watch mode
- `npm run build` - Creates optimized production build

**Backend (Node.js)**
- `cd backend && npm start` - Starts backend server on http://localhost:8000
- Backend uses Express.js with SQLite database

**Docker Deployment**
- `docker-compose up` - Full stack deployment with all services
- Includes frontend, backend, Redis, Ollama, ComfyUI, and Nginx

## Architecture Overview

This is a **story generator web application** that creates AI-powered short-form video content. The system generates stories, creates shot lists, and produces video content through an AI pipeline.

### Frontend Architecture (React + TypeScript)
- **State Management**: Zustand store (`src/store/`) for global state
- **Routing**: React Router with main routes in `src/pages/`
- **UI Framework**: Material-UI (MUI) components with custom theme
- **Key Pages**:
  - Dashboard: Main overview and metrics
  - StoryGenerator: Story creation interface  
  - StoryQueue: Queue management for generation tasks
  - Settings: Model configuration and API settings
  - Research: Analysis tools
  - Metrics: Performance tracking

### Backend Architecture (Node.js + Express)
- **Database**: SQLite with tables for stories, queue, and metrics
- **API**: RESTful endpoints for story CRUD operations and queue management
- **AI Integration**: Interfaces with Ollama for local LLM processing

### AI Pipeline System
The application features a sophisticated AI pipeline (`src/services/`) for story generation:
- **Sequential Pipeline**: Step-by-step story generation process
- **Node Discovery**: Automatic detection of available Ollama instances
- **Queue Management**: Distributed processing across multiple AI nodes
- **Debug Service**: Comprehensive logging and monitoring

### Key Services
- `aiPipeline.ts` - Core AI generation logic
- `nodeDiscovery.ts` - Network discovery for AI nodes
- `storyDataManager.ts` - Story data persistence
- `debugService.ts` - Application logging and debugging

### Configuration System
The Python `config.py` file contains:
- Comprehensive story prompts for different genres (Drama, Comedy, Thriller, Sci-Fi, Romance, Horror, Mystery, Fantasy)
- AI system prompts for story writing, shot list creation, and video generation
- Model configurations for different LLM sizes
- Visual style guides for video generation
- Render settings and aspect ratios

### Story Generation Process
1. **Story Writing**: AI creates structured narrative with parts and hooks
2. **Shot List Creation**: Converts story into filmable shots with camera directions
3. **Character Analysis**: Extracts character descriptions for visual consistency
4. **Prompt Engineering**: Creates detailed prompts for video AI generation
5. **Narration**: Generates voice-over scripts with timing
6. **Music Direction**: Adds musical cues and atmosphere
7. **Queue Processing**: Manages video generation queue

## Key Technologies
- **Frontend**: React 19, TypeScript, Material-UI, Zustand, React Hook Form
- **Backend**: Node.js, Express, SQLite3, WebSocket support
- **AI Integration**: Ollama for local LLMs, ComfyUI for video generation
- **Testing**: Jest, React Testing Library
- **Deployment**: Docker Compose with multi-service architecture

## Development Notes
- The app supports both local development and containerized deployment
- Debug console available in development for real-time monitoring
- Multi-node AI processing for scalable story generation
- Comprehensive error handling and logging throughout the pipeline
- Settings persist in localStorage with backup to backend database