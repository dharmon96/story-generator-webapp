#!/usr/bin/env python3
"""
Story Generator Node Agent
--------------------------
A lightweight agent that runs on each AI node to:
1. Report node status and capabilities to the central server
2. Track current processing jobs
3. Provide a simple local web UI for monitoring
4. Enable automatic discovery by the main application

Usage:
    python agent.py [--port 8765] [--server http://192.168.0.181:8001]

Requirements:
    pip install flask requests psutil
"""

import argparse
import json
import os
import platform
import socket
import subprocess
import sys
import threading
import time
from datetime import datetime
from typing import Dict, List, Optional

try:
    from flask import Flask, jsonify, render_template_string, request
    import requests
    import psutil
except ImportError:
    print("Installing required packages...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "flask", "requests", "psutil"])
    from flask import Flask, jsonify, render_template_string, request
    import requests
    import psutil


# Configuration
DEFAULT_PORT = 8765
DEFAULT_OLLAMA_PORT = 11434
DEFAULT_COMFYUI_PORT = 8188
HEARTBEAT_INTERVAL = 30  # seconds

app = Flask(__name__)

# Global state
node_state = {
    "node_id": None,
    "hostname": socket.gethostname(),
    "ip_addresses": [],
    "started_at": datetime.now().isoformat(),
    "ollama": {
        "available": False,
        "port": DEFAULT_OLLAMA_PORT,
        "models": [],
        "current_job": None,
        "jobs_completed": 0
    },
    "comfyui": {
        "available": False,
        "port": DEFAULT_COMFYUI_PORT,
        "models": [],
        "current_job": None,
        "jobs_completed": 0
    },
    "system": {
        "platform": platform.system(),
        "cpu_percent": 0,
        "memory_percent": 0,
        "gpu_info": None
    },
    "jobs_history": [],  # Last 50 jobs
    "central_server": None,
    "last_heartbeat": None
}


def get_local_ips() -> List[str]:
    """Get all local IP addresses"""
    ips = []
    try:
        # Get hostname-based IP
        hostname = socket.gethostname()
        ips.append(socket.gethostbyname(hostname))
    except:
        pass

    try:
        # Get all network interfaces
        for interface, addrs in psutil.net_if_addrs().items():
            for addr in addrs:
                if addr.family == socket.AF_INET and not addr.address.startswith('127.'):
                    if addr.address not in ips:
                        ips.append(addr.address)
    except:
        pass

    return ips


def check_ollama() -> Dict:
    """Check if Ollama is running and get models"""
    try:
        response = requests.get(
            f"http://localhost:{node_state['ollama']['port']}/api/tags",
            timeout=5
        )
        if response.ok:
            data = response.json()
            models = [m['name'] for m in data.get('models', [])]
            return {"available": True, "models": models}
    except:
        pass
    return {"available": False, "models": []}


def check_comfyui() -> Dict:
    """Check if ComfyUI is running"""
    port = node_state['comfyui']['port']
    endpoints = ['/system_stats', '/api/system_stats', '/queue', '/api/queue']

    for endpoint in endpoints:
        try:
            response = requests.get(f"http://localhost:{port}{endpoint}", timeout=3)
            if response.ok:
                return {"available": True, "port": port}
        except:
            pass

    return {"available": False, "port": port}


def get_gpu_info() -> Optional[Dict]:
    """Get GPU information if nvidia-smi is available"""
    try:
        result = subprocess.run(
            ['nvidia-smi', '--query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu',
             '--format=csv,noheader,nounits'],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            lines = result.stdout.strip().split('\n')
            gpus = []
            for line in lines:
                parts = [p.strip() for p in line.split(',')]
                if len(parts) >= 5:
                    gpus.append({
                        "name": parts[0],
                        "memory_total_mb": int(parts[1]),
                        "memory_used_mb": int(parts[2]),
                        "memory_free_mb": int(parts[3]),
                        "utilization_percent": int(parts[4])
                    })
            return {"gpus": gpus, "count": len(gpus)}
    except:
        pass
    return None


def update_system_stats():
    """Update system statistics"""
    node_state['system']['cpu_percent'] = psutil.cpu_percent(interval=0.1)
    node_state['system']['memory_percent'] = psutil.virtual_memory().percent
    node_state['system']['gpu_info'] = get_gpu_info()


def update_services():
    """Update Ollama and ComfyUI status"""
    ollama_status = check_ollama()
    node_state['ollama']['available'] = ollama_status['available']
    node_state['ollama']['models'] = ollama_status['models']

    comfyui_status = check_comfyui()
    node_state['comfyui']['available'] = comfyui_status['available']


def send_heartbeat():
    """Send heartbeat to central server"""
    if not node_state['central_server']:
        return

    try:
        payload = {
            "node_id": node_state['node_id'],
            "hostname": node_state['hostname'],
            "ip_addresses": node_state['ip_addresses'],
            "agent_port": node_state.get('agent_port', DEFAULT_PORT),
            "ollama": {
                "available": node_state['ollama']['available'],
                "port": node_state['ollama']['port'],
                "models": node_state['ollama']['models'],
                "current_job": node_state['ollama']['current_job'],
                "jobs_completed": node_state['ollama']['jobs_completed']
            },
            "comfyui": {
                "available": node_state['comfyui']['available'],
                "port": node_state['comfyui']['port'],
                "current_job": node_state['comfyui']['current_job'],
                "jobs_completed": node_state['comfyui']['jobs_completed']
            },
            "system": node_state['system'],
            "timestamp": datetime.now().isoformat()
        }

        response = requests.post(
            f"{node_state['central_server']}/api/nodes/heartbeat",
            json=payload,
            timeout=10
        )

        if response.ok:
            node_state['last_heartbeat'] = datetime.now().isoformat()
            print(f"[Heartbeat] Sent to {node_state['central_server']}")
        else:
            print(f"[!] Heartbeat failed: {response.status_code}")
    except Exception as e:
        print(f"[!] Heartbeat error: {e}")


def background_tasks():
    """Background thread for periodic updates"""
    while True:
        try:
            update_system_stats()
            update_services()
            send_heartbeat()
        except Exception as e:
            print(f"Background task error: {e}")
        time.sleep(HEARTBEAT_INTERVAL)


# HTML template for the simple UI
DASHBOARD_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="10">
    <title>Node Agent - {{ hostname }}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #e0e0e0;
            min-height: 100vh;
            padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { color: #00d9ff; margin-bottom: 20px; font-size: 1.8rem; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .card {
            background: rgba(255,255,255,0.05);
            border-radius: 12px;
            padding: 20px;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .card h2 {
            color: #00d9ff;
            font-size: 1.1rem;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.75rem;
            font-weight: 600;
        }
        .status-online { background: #00c853; color: #000; }
        .status-offline { background: #ff5252; color: #fff; }
        .status-busy { background: #ffab00; color: #000; }
        .metric {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .metric:last-child { border-bottom: none; }
        .metric-label { color: #888; }
        .metric-value { font-weight: 600; }
        .progress-bar {
            height: 8px;
            background: rgba(255,255,255,0.1);
            border-radius: 4px;
            overflow: hidden;
            margin-top: 4px;
        }
        .progress-fill {
            height: 100%;
            border-radius: 4px;
            transition: width 0.3s;
        }
        .progress-cpu { background: linear-gradient(90deg, #00d9ff, #00ff88); }
        .progress-mem { background: linear-gradient(90deg, #ff6b6b, #ffa502); }
        .progress-gpu { background: linear-gradient(90deg, #a55eea, #ff6b6b); }
        .model-list {
            max-height: 150px;
            overflow-y: auto;
            font-size: 0.85rem;
        }
        .model-item {
            padding: 4px 8px;
            background: rgba(0,217,255,0.1);
            border-radius: 4px;
            margin: 4px 0;
            font-family: monospace;
        }
        .job-card {
            background: rgba(0,217,255,0.1);
            border-radius: 8px;
            padding: 12px;
            margin-top: 10px;
        }
        .job-card.idle {
            background: rgba(255,255,255,0.05);
            color: #666;
            text-align: center;
        }
        .ip-list { font-family: monospace; font-size: 0.9rem; }
        footer {
            text-align: center;
            margin-top: 30px;
            color: #666;
            font-size: 0.85rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🖥️ {{ hostname }}</h1>

        <div class="grid">
            <!-- Node Info -->
            <div class="card">
                <h2>📡 Node Info</h2>
                <div class="metric">
                    <span class="metric-label">Node ID</span>
                    <span class="metric-value" style="font-family: monospace; font-size: 0.8rem;">{{ node_id[:16] }}...</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Platform</span>
                    <span class="metric-value">{{ system.platform }}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">IP Addresses</span>
                    <span class="metric-value ip-list">{{ ip_addresses | join(', ') }}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Started</span>
                    <span class="metric-value">{{ started_at[:19] }}</span>
                </div>
            </div>

            <!-- System Stats -->
            <div class="card">
                <h2>📊 System Resources</h2>
                <div class="metric">
                    <span class="metric-label">CPU Usage</span>
                    <span class="metric-value">{{ system.cpu_percent }}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill progress-cpu" style="width: {{ system.cpu_percent }}%"></div>
                </div>
                <div class="metric" style="margin-top: 15px;">
                    <span class="metric-label">Memory Usage</span>
                    <span class="metric-value">{{ system.memory_percent }}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill progress-mem" style="width: {{ system.memory_percent }}%"></div>
                </div>
                {% if system.gpu_info %}
                {% for gpu in system.gpu_info.gpus %}
                <div class="metric" style="margin-top: 15px;">
                    <span class="metric-label">GPU {{ loop.index0 }}</span>
                    <span class="metric-value">{{ gpu.utilization_percent }}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill progress-gpu" style="width: {{ gpu.utilization_percent }}%"></div>
                </div>
                <div class="metric">
                    <span class="metric-label">VRAM</span>
                    <span class="metric-value">{{ gpu.memory_used_mb }} / {{ gpu.memory_total_mb }} MB</span>
                </div>
                {% endfor %}
                {% endif %}
            </div>

            <!-- Ollama Status -->
            <div class="card">
                <h2>
                    🦙 Ollama
                    <span class="status-badge {{ 'status-online' if ollama.available else 'status-offline' }}">
                        {{ 'ONLINE' if ollama.available else 'OFFLINE' }}
                    </span>
                </h2>
                <div class="metric">
                    <span class="metric-label">Port</span>
                    <span class="metric-value">{{ ollama.port }}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Jobs Completed</span>
                    <span class="metric-value">{{ ollama.jobs_completed }}</span>
                </div>
                {% if ollama.available %}
                <div class="metric">
                    <span class="metric-label">Models ({{ ollama.models | length }})</span>
                </div>
                <div class="model-list">
                    {% for model in ollama.models %}
                    <div class="model-item">{{ model }}</div>
                    {% endfor %}
                </div>
                {% endif %}
                <div class="job-card {{ 'idle' if not ollama.current_job else '' }}">
                    {% if ollama.current_job %}
                    <strong>Current Job:</strong> {{ ollama.current_job.type }}<br>
                    <small>{{ ollama.current_job.model }} - {{ ollama.current_job.started_at }}</small>
                    {% else %}
                    Idle - waiting for jobs
                    {% endif %}
                </div>
            </div>

            <!-- ComfyUI Status -->
            <div class="card">
                <h2>
                    🎨 ComfyUI
                    <span class="status-badge {{ 'status-online' if comfyui.available else 'status-offline' }}">
                        {{ 'ONLINE' if comfyui.available else 'OFFLINE' }}
                    </span>
                </h2>
                <div class="metric">
                    <span class="metric-label">Port</span>
                    <span class="metric-value">{{ comfyui.port }}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Jobs Completed</span>
                    <span class="metric-value">{{ comfyui.jobs_completed }}</span>
                </div>
                <div class="job-card {{ 'idle' if not comfyui.current_job else '' }}">
                    {% if comfyui.current_job %}
                    <strong>Current Job:</strong> {{ comfyui.current_job.type }}<br>
                    <small>{{ comfyui.current_job.workflow }} - {{ comfyui.current_job.started_at }}</small>
                    {% else %}
                    Idle - waiting for jobs
                    {% endif %}
                </div>
            </div>
        </div>

        <footer>
            Story Generator Node Agent v1.0 | Last updated: {{ now }}
        </footer>
    </div>
</body>
</html>
"""


# API Routes
@app.route('/')
def dashboard():
    """Render the dashboard UI"""
    return render_template_string(
        DASHBOARD_HTML,
        **node_state,
        now=datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    )


@app.route('/api/status')
def api_status():
    """Get full node status as JSON"""
    return jsonify({
        **node_state,
        "timestamp": datetime.now().isoformat()
    })


@app.route('/api/health')
def api_health():
    """Simple health check endpoint"""
    return jsonify({
        "status": "ok",
        "node_id": node_state['node_id'],
        "hostname": node_state['hostname'],
        "ollama": node_state['ollama']['available'],
        "comfyui": node_state['comfyui']['available']
    })


@app.route('/api/job/start', methods=['POST'])
def api_job_start():
    """Register a new job (called by the main app when dispatching work)"""
    data = request.json
    service = data.get('service', 'ollama')  # 'ollama' or 'comfyui'

    job_info = {
        "id": data.get('job_id'),
        "type": data.get('type', 'generation'),
        "model": data.get('model'),
        "workflow": data.get('workflow'),
        "story_id": data.get('story_id'),
        "started_at": datetime.now().isoformat()
    }

    if service == 'ollama':
        node_state['ollama']['current_job'] = job_info
    else:
        node_state['comfyui']['current_job'] = job_info

    return jsonify({"status": "ok", "job": job_info})


@app.route('/api/job/complete', methods=['POST'])
def api_job_complete():
    """Mark a job as complete"""
    data = request.json
    service = data.get('service', 'ollama')

    if service == 'ollama':
        job = node_state['ollama']['current_job']
        if job:
            job['completed_at'] = datetime.now().isoformat()
            job['status'] = data.get('status', 'completed')
            node_state['jobs_history'].insert(0, job)
            node_state['jobs_history'] = node_state['jobs_history'][:50]  # Keep last 50
            node_state['ollama']['jobs_completed'] += 1
        node_state['ollama']['current_job'] = None
    else:
        job = node_state['comfyui']['current_job']
        if job:
            job['completed_at'] = datetime.now().isoformat()
            job['status'] = data.get('status', 'completed')
            node_state['jobs_history'].insert(0, job)
            node_state['jobs_history'] = node_state['jobs_history'][:50]
            node_state['comfyui']['jobs_completed'] += 1
        node_state['comfyui']['current_job'] = None

    return jsonify({"status": "ok"})


@app.route('/api/jobs/history')
def api_jobs_history():
    """Get job history"""
    return jsonify({"jobs": node_state['jobs_history']})


def generate_node_id() -> str:
    """Generate a unique node ID based on machine characteristics"""
    import hashlib

    # Combine hostname + MAC addresses for a stable ID
    mac_addresses = []
    for interface, addrs in psutil.net_if_addrs().items():
        for addr in addrs:
            if addr.family == psutil.AF_LINK:  # MAC address
                mac_addresses.append(addr.address)

    unique_string = f"{socket.gethostname()}-{'-'.join(sorted(mac_addresses))}"
    return hashlib.sha256(unique_string.encode()).hexdigest()[:32]


def main():
    parser = argparse.ArgumentParser(description='Story Generator Node Agent')
    parser.add_argument('--port', type=int, default=DEFAULT_PORT, help=f'Port to run the agent on (default: {DEFAULT_PORT})')
    parser.add_argument('--server', type=str, help='Central server URL for heartbeats (e.g., http://192.168.0.181:8001)')
    parser.add_argument('--ollama-port', type=int, default=DEFAULT_OLLAMA_PORT, help=f'Ollama port (default: {DEFAULT_OLLAMA_PORT})')
    parser.add_argument('--comfyui-port', type=int, default=DEFAULT_COMFYUI_PORT, help=f'ComfyUI port (default: {DEFAULT_COMFYUI_PORT})')
    args = parser.parse_args()

    # Initialize node state
    node_state['node_id'] = generate_node_id()
    node_state['ip_addresses'] = get_local_ips()
    node_state['agent_port'] = args.port
    node_state['ollama']['port'] = args.ollama_port
    node_state['comfyui']['port'] = args.comfyui_port
    node_state['central_server'] = args.server

    # Initial service check
    update_services()
    update_system_stats()

    # Use ASCII-safe banner to avoid Windows encoding issues
    ollama_status = "Online" if node_state['ollama']['available'] else "Offline"
    comfyui_status = "Online" if node_state['comfyui']['available'] else "Offline"
    ips_str = ', '.join(node_state['ip_addresses'])

    print("")
    print("=" * 65)
    print("         Story Generator Node Agent v1.0")
    print("=" * 65)
    print(f"  Node ID:    {node_state['node_id'][:32]}...")
    print(f"  Hostname:   {node_state['hostname']}")
    print(f"  IPs:        {ips_str}")
    print(f"  Agent Port: {args.port}")
    print("-" * 65)
    print("  Services:")
    print(f"    Ollama:   {ollama_status}")
    print(f"    ComfyUI:  {comfyui_status}")
    print("-" * 65)
    print(f"  Dashboard: http://localhost:{args.port}")
    print(f"  API:       http://localhost:{args.port}/api/status")
    print("=" * 65)
    print("")

    if args.server:
        print(f"[*] Registering with central server: {args.server}")
    else:
        print("[!] No central server configured. Running in standalone mode.")
        print(f"    Use --server http://YOUR_SERVER:8001 to enable heartbeats.")

    # Start background thread for periodic updates
    bg_thread = threading.Thread(target=background_tasks, daemon=True)
    bg_thread.start()

    # Run Flask app
    app.run(host='0.0.0.0', port=args.port, debug=False, threaded=True)


if __name__ == '__main__':
    main()
