# Story Generator Node Agent

A lightweight Python agent that runs on AI render nodes to enable automatic discovery and job tracking.

## Features

- **Automatic Registration**: Nodes automatically register with the central server via heartbeats
- **Service Detection**: Detects running Ollama and ComfyUI instances
- **System Monitoring**: Tracks CPU, memory, and GPU usage
- **Job Tracking**: Shows current jobs being processed
- **Simple Web UI**: Dashboard accessible at `http://localhost:8765`

## Installation

### Requirements
- Python 3.8+
- Ollama and/or ComfyUI running on the node

### Quick Start

```bash
# Install dependencies (auto-installed on first run)
pip install flask requests psutil

# Run the agent (standalone mode)
python agent.py

# Run with central server registration
python agent.py --server http://192.168.0.181:8001
```

### Command Line Options

```
--port PORT          Agent web UI port (default: 8765)
--server URL         Central server URL for heartbeats
--ollama-port PORT   Ollama port to monitor (default: 11434)
--comfyui-port PORT  ComfyUI port to monitor (default: 8188)
```

## Usage

### Standalone Mode
Run without `--server` to just have a local monitoring dashboard:
```bash
python agent.py
```
Access the dashboard at `http://localhost:8765`

### With Central Server
Register with the main Story Generator backend:
```bash
python agent.py --server http://YOUR_SERVER_IP:8001
```

The agent will:
1. Send heartbeats every 30 seconds
2. Report Ollama/ComfyUI status and available models
3. Track current jobs and completion stats
4. Report system resource usage

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Web dashboard |
| `/api/status` | GET | Full node status JSON |
| `/api/health` | GET | Simple health check |
| `/api/job/start` | POST | Register a new job |
| `/api/job/complete` | POST | Mark a job complete |
| `/api/jobs/history` | GET | Job history |

## Running as a Service

### Windows (Task Scheduler)
1. Create a batch file `start-agent.bat`:
   ```batch
   @echo off
   cd /d "C:\path\to\node-agent"
   python agent.py --server http://192.168.0.181:8001
   ```
2. Create a scheduled task to run at startup

### Linux (systemd)
Create `/etc/systemd/system/story-node-agent.service`:
```ini
[Unit]
Description=Story Generator Node Agent
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/node-agent
ExecStart=/usr/bin/python3 agent.py --server http://192.168.0.181:8001
Restart=always

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl enable story-node-agent
sudo systemctl start story-node-agent
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Central Server                        │
│                  (192.168.0.181:8001)                   │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Node Registry                       │   │
│  │  - Receives heartbeats from agents              │   │
│  │  - Tracks online/offline status                 │   │
│  │  - Provides /api/nodes endpoint                 │   │
│  └─────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────┘
                       │ Heartbeats (every 30s)
          ┌────────────┼────────────┐
          │            │            │
          ▼            ▼            ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│   Node A    │ │   Node B    │ │   Node C    │
│  (Agent)    │ │  (Agent)    │ │  (Agent)    │
│  :8765      │ │  :8765      │ │  :8765      │
│             │ │             │ │             │
│  - Ollama   │ │  - Ollama   │ │  - ComfyUI  │
│  - ComfyUI  │ │             │ │             │
└─────────────┘ └─────────────┘ └─────────────┘
```
