#!/usr/bin/env python3
"""
Story Generator Node Agent
--------------------------
A lightweight agent that runs on each AI node to:
1. Report node status and capabilities to the central server
2. Track current processing jobs
3. Provide a simple local web UI for monitoring
4. Enable automatic discovery by the main application
5. Display supported ComfyUI workflows with model requirements
6. Log all Ollama and ComfyUI communications for debugging
7. Auto-update from central server on startup

Usage:
    python agent.py [--port 8765] [--server http://192.168.0.181:8001] [--no-update]

Requirements:
    pip install flask requests psutil
"""

import argparse
import hashlib
import json
import os
import platform
import shutil
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


# Agent Version - used for update checking
AGENT_VERSION = "1.1.0"

# Configuration
DEFAULT_PORT = 8765
DEFAULT_OLLAMA_PORT = 11434
DEFAULT_COMFYUI_PORT = 8000
HEARTBEAT_INTERVAL = 30  # seconds
MAX_LOG_ENTRIES = 200  # Maximum log entries to keep
STATS_HISTORY_SIZE = 100  # Number of request stats to keep for averaging
COMFYUI_MODELS_PATHS = {
    "unet": ["models/unet", "models/diffusion_models", "models/checkpoints"],
    "vae": ["models/vae"],
    "clip": ["models/clip", "models/text_encoders"],
    "lora": ["models/loras"]
}

# Config file path (same directory as agent.py)
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'agent_config.json')

# Model visibility config (which models are enabled for broadcast)
model_config = {
    "ollama_disabled_models": [],  # List of Ollama model names to hide
    "comfyui_disabled_workflows": []  # List of workflow IDs to hide
}


def load_config():
    """Load agent configuration from file"""
    global model_config
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'r') as f:
                loaded = json.load(f)
                model_config.update(loaded)
                print(f"[Config] Loaded configuration from {CONFIG_FILE}")
    except Exception as e:
        print(f"[Config] Failed to load config: {e}")


def save_config():
    """Save agent configuration to file"""
    try:
        with open(CONFIG_FILE, 'w') as f:
            json.dump(model_config, f, indent=2)
        print(f"[Config] Saved configuration to {CONFIG_FILE}")
        return True
    except Exception as e:
        print(f"[Config] Failed to save config: {e}")
        return False


def get_enabled_ollama_models():
    """Get list of Ollama models that are enabled for broadcast"""
    all_models = node_state['ollama'].get('models', [])
    disabled = model_config.get('ollama_disabled_models', [])
    return [m for m in all_models if m not in disabled]


def is_ollama_model_enabled(model_name: str) -> bool:
    """Check if an Ollama model is enabled"""
    return model_name not in model_config.get('ollama_disabled_models', [])


def set_ollama_model_enabled(model_name: str, enabled: bool):
    """Enable or disable an Ollama model for broadcast"""
    disabled = model_config.get('ollama_disabled_models', [])

    if enabled and model_name in disabled:
        disabled.remove(model_name)
    elif not enabled and model_name not in disabled:
        disabled.append(model_name)

    model_config['ollama_disabled_models'] = disabled
    save_config()


# Real-time statistics for load balancing
agent_stats = {
    "ollama": {
        "total_requests": 0,
        "successful_requests": 0,
        "failed_requests": 0,
        "total_response_time_ms": 0,
        "avg_response_time_ms": 0,
        "min_response_time_ms": None,
        "max_response_time_ms": None,
        "requests_per_minute": 0,
        "success_rate": 100.0,
        "current_queue_depth": 0,
        "recent_response_times": [],  # Last N response times for rolling avg
        "requests_last_minute": [],  # Timestamps for rate calculation
        "last_error": None,
        "last_error_time": None,
        "tokens_generated": 0,
        "tokens_per_second_avg": 0
    },
    "comfyui": {
        "total_requests": 0,
        "successful_requests": 0,
        "failed_requests": 0,
        "total_response_time_ms": 0,
        "avg_response_time_ms": 0,
        "min_response_time_ms": None,
        "max_response_time_ms": None,
        "requests_per_minute": 0,
        "success_rate": 100.0,
        "current_queue_depth": 0,
        "recent_response_times": [],
        "requests_last_minute": [],
        "last_error": None,
        "last_error_time": None,
        "renders_completed": 0,
        "avg_render_time_ms": 0
    },
    "uptime_seconds": 0,
    "started_at": None
}


# ============================================
# AUTO-UPDATE SYSTEM
# ============================================

def get_file_hash(filepath: str) -> Optional[str]:
    """Calculate MD5 hash of a file"""
    try:
        hash_md5 = hashlib.md5()
        with open(filepath, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()
    except Exception as e:
        print(f"[!] Failed to calculate file hash: {e}")
        return None


def check_for_updates(server_url: str) -> Dict:
    """Check if an update is available from the server"""
    try:
        current_hash = get_file_hash(__file__)
        if not current_hash:
            return {"needsUpdate": False, "error": "Failed to get current file hash"}

        response = requests.get(
            f"{server_url}/api/agent/check",
            params={"hash": current_hash},
            timeout=10
        )

        if response.ok:
            return response.json()
        else:
            return {"needsUpdate": False, "error": f"Server returned {response.status_code}"}
    except Exception as e:
        return {"needsUpdate": False, "error": str(e)}


def download_update(server_url: str) -> Optional[str]:
    """Download the latest agent.py to a temp file"""
    try:
        response = requests.get(
            f"{server_url}/api/agent/download",
            timeout=30,
            stream=True
        )

        if not response.ok:
            print(f"[!] Failed to download update: {response.status_code}")
            return None

        # Save to temp file
        temp_path = __file__ + ".new"
        with open(temp_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        # Verify the download
        new_hash = get_file_hash(temp_path)
        server_hash = response.headers.get("X-Agent-Hash")

        if server_hash and new_hash != server_hash:
            print(f"[!] Download verification failed: hash mismatch")
            os.remove(temp_path)
            return None

        return temp_path
    except Exception as e:
        print(f"[!] Failed to download update: {e}")
        return None


def apply_update(temp_path: str) -> bool:
    """Apply the downloaded update"""
    try:
        current_path = __file__
        backup_path = current_path + ".backup"

        # Create backup
        shutil.copy2(current_path, backup_path)
        print(f"[Update] Created backup at {backup_path}")

        # Replace current file
        shutil.move(temp_path, current_path)
        print(f"[Update] Applied update successfully")

        return True
    except Exception as e:
        print(f"[!] Failed to apply update: {e}")

        # Try to restore backup
        try:
            if os.path.exists(backup_path):
                shutil.move(backup_path, current_path)
                print("[Update] Restored from backup")
        except:
            pass

        return False


def perform_auto_update(server_url: str) -> bool:
    """
    Check for updates and apply if available.
    Returns True if an update was applied (requires restart).
    """
    print(f"[Update] Checking for updates from {server_url}...")

    # Check if update is available
    update_info = check_for_updates(server_url)

    if update_info.get("error"):
        print(f"[Update] Check failed: {update_info['error']}")
        return False

    if not update_info.get("needsUpdate"):
        print(f"[Update] Agent is up to date (hash: {get_file_hash(__file__)[:8]}...)")
        return False

    print(f"[Update] Update available!")
    print(f"  Current hash: {update_info.get('clientHash', 'unknown')[:8]}...")
    print(f"  Server hash:  {update_info.get('currentHash', 'unknown')[:8]}...")
    print(f"  Server version: {update_info.get('currentVersion', 'unknown')}")

    # Download update
    print("[Update] Downloading update...")
    temp_path = download_update(server_url)

    if not temp_path:
        print("[Update] Download failed")
        return False

    # Apply update
    print("[Update] Applying update...")
    if apply_update(temp_path):
        print("[Update] Update applied successfully!")
        print("[Update] Restarting agent...")
        return True

    return False


def restart_agent():
    """Restart the agent process"""
    print("[Restart] Restarting agent...")
    time.sleep(1)

    # Re-execute the current script with the same arguments
    python = sys.executable
    os.execl(python, python, *sys.argv)


app = Flask(__name__)

# CORS support for browser requests
@app.after_request
def add_cors_headers(response):
    """Add CORS headers to all responses"""
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

# Communication logs for Ollama and ComfyUI
communication_logs = {
    "ollama": [],
    "comfyui": []
}

# Workflow registry - defines supported workflows with their configurations
WORKFLOW_REGISTRY = {
    "hunyuan_video_1.5_720p_t2v": {
        "name": "HunyuanVideo 1.5 720p T2V",
        "description": "Text-to-video generation using HunyuanVideo 1.5 at 720p resolution",
        "type": "text2video",
        "resolution": "1280x720",
        "fps": 24,
        "frames": 121,
        "models": {
            "unet": "hunyuanvideo1.5_720p_t2v_fp16.safetensors",
            "vae": "hunyuanvideo15_vae_fp16.safetensors",
            "clip1": "qwen_2.5_vl_7b_fp8_scaled.safetensors",
            "clip2": "byt5_small_glyphxl_fp16.safetensors"
        },
        "sampler": {
            "name": "euler",
            "scheduler": "simple",
            "steps": 20,
            "cfg": 6,
            "shift": 7
        },
        "workflow_json": {
            "8": {"inputs": {"samples": ["127", 0], "vae": ["10", 0]}, "class_type": "VAEDecode", "_meta": {"title": "VAE Decode"}},
            "10": {"inputs": {"vae_name": "hunyuanvideo15_vae_fp16.safetensors"}, "class_type": "VAELoader", "_meta": {"title": "Load VAE"}},
            "11": {"inputs": {"clip_name1": "qwen_2.5_vl_7b_fp8_scaled.safetensors", "clip_name2": "byt5_small_glyphxl_fp16.safetensors", "type": "hunyuan_video_15", "device": "default"}, "class_type": "DualCLIPLoader", "_meta": {"title": "DualCLIPLoader"}},
            "12": {"inputs": {"unet_name": "hunyuanvideo1.5_720p_t2v_fp16.safetensors", "weight_dtype": "default"}, "class_type": "UNETLoader", "_meta": {"title": "Load Diffusion Model"}},
            "44": {"inputs": {"text": "{{POSITIVE_PROMPT}}", "clip": ["11", 0]}, "class_type": "CLIPTextEncode", "_meta": {"title": "CLIP Text Encode (Positive Prompt)"}},
            "93": {"inputs": {"text": "{{NEGATIVE_PROMPT}}", "clip": ["11", 0]}, "class_type": "CLIPTextEncode", "_meta": {"title": "CLIP Text Encode (Negative Prompt)"}},
            "101": {"inputs": {"fps": 24, "images": ["8", 0]}, "class_type": "CreateVideo", "_meta": {"title": "Create Video"}},
            "102": {"inputs": {"filename_prefix": "video/hunyuan_video_1.5", "format": "auto", "codec": "h264", "video": ["101", 0]}, "class_type": "SaveVideo", "_meta": {"title": "Save Video"}},
            "124": {"inputs": {"width": 1280, "height": 720, "length": 121, "batch_size": 1}, "class_type": "EmptyHunyuanVideo15Latent", "_meta": {"title": "Empty HunyuanVideo 1.5 Latent"}},
            "127": {"inputs": {"noise": ["129", 0], "guider": ["131", 0], "sampler": ["130", 0], "sigmas": ["128", 0], "latent_image": ["124", 0]}, "class_type": "SamplerCustomAdvanced", "_meta": {"title": "SamplerCustomAdvanced"}},
            "128": {"inputs": {"scheduler": "simple", "steps": 20, "denoise": 1, "model": ["12", 0]}, "class_type": "BasicScheduler", "_meta": {"title": "BasicScheduler"}},
            "129": {"inputs": {"noise_seed": "{{SEED}}"}, "class_type": "RandomNoise", "_meta": {"title": "RandomNoise"}},
            "130": {"inputs": {"sampler_name": "euler"}, "class_type": "KSamplerSelect", "_meta": {"title": "KSamplerSelect"}},
            "131": {"inputs": {"cfg": 6, "model": ["132", 0], "positive": ["44", 0], "negative": ["93", 0]}, "class_type": "CFGGuider", "_meta": {"title": "CFGGuider"}},
            "132": {"inputs": {"shift": 7, "model": ["12", 0]}, "class_type": "ModelSamplingSD3", "_meta": {"title": "ModelSamplingSD3"}}
        }
    },
    "wan2.2_14B_t2v": {
        "name": "Wan 2.2 14B T2V (LightX2V 4-step)",
        "description": "Fast text-to-video with Wan 2.2 14B using LightX2V acceleration (4 steps)",
        "type": "text2video",
        "resolution": "640x640",
        "fps": 16,
        "frames": 81,
        "models": {
            "unet_high_noise": "wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors",
            "unet_low_noise": "wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors",
            "vae": "wan_2.1_vae.safetensors",
            "clip": "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
            "lora_high_noise": "wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors",
            "lora_low_noise": "wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors"
        },
        "sampler": {
            "name": "euler",
            "scheduler": "simple",
            "steps": 4,
            "cfg": 1,
            "shift": 5
        },
        "workflow_json": {
            "71": {"inputs": {"clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan", "device": "default"}, "class_type": "CLIPLoader", "_meta": {"title": "Load CLIP"}},
            "72": {"inputs": {"text": "{{NEGATIVE_PROMPT}}", "clip": ["71", 0]}, "class_type": "CLIPTextEncode", "_meta": {"title": "CLIP Text Encode (Negative Prompt)"}},
            "73": {"inputs": {"vae_name": "wan_2.1_vae.safetensors"}, "class_type": "VAELoader", "_meta": {"title": "Load VAE"}},
            "74": {"inputs": {"width": 640, "height": 640, "length": 81, "batch_size": 1}, "class_type": "EmptyHunyuanLatentVideo", "_meta": {"title": "Empty HunyuanVideo 1.0 Latent"}},
            "75": {"inputs": {"unet_name": "wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors", "weight_dtype": "default"}, "class_type": "UNETLoader", "_meta": {"title": "Load Diffusion Model"}},
            "76": {"inputs": {"unet_name": "wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors", "weight_dtype": "default"}, "class_type": "UNETLoader", "_meta": {"title": "Load Diffusion Model"}},
            "78": {"inputs": {"add_noise": "disable", "noise_seed": 0, "steps": 4, "cfg": 1, "sampler_name": "euler", "scheduler": "simple", "start_at_step": 2, "end_at_step": 4, "return_with_leftover_noise": "disable", "model": ["86", 0], "positive": ["89", 0], "negative": ["72", 0], "latent_image": ["81", 0]}, "class_type": "KSamplerAdvanced", "_meta": {"title": "KSampler (Advanced)"}},
            "80": {"inputs": {"filename_prefix": "video/ComfyUI", "format": "auto", "codec": "auto", "video": ["88", 0]}, "class_type": "SaveVideo", "_meta": {"title": "Save Video"}},
            "81": {"inputs": {"add_noise": "enable", "noise_seed": "{{SEED}}", "steps": 4, "cfg": 1, "sampler_name": "euler", "scheduler": "simple", "start_at_step": 0, "end_at_step": 2, "return_with_leftover_noise": "enable", "model": ["82", 0], "positive": ["89", 0], "negative": ["72", 0], "latent_image": ["74", 0]}, "class_type": "KSamplerAdvanced", "_meta": {"title": "KSampler (Advanced)"}},
            "82": {"inputs": {"shift": 5.0, "model": ["83", 0]}, "class_type": "ModelSamplingSD3", "_meta": {"title": "ModelSamplingSD3"}},
            "83": {"inputs": {"lora_name": "wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors", "strength_model": 1.0, "model": ["75", 0]}, "class_type": "LoraLoaderModelOnly", "_meta": {"title": "LoraLoaderModelOnly"}},
            "85": {"inputs": {"lora_name": "wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors", "strength_model": 1.0, "model": ["76", 0]}, "class_type": "LoraLoaderModelOnly", "_meta": {"title": "LoraLoaderModelOnly"}},
            "86": {"inputs": {"shift": 5.0, "model": ["85", 0]}, "class_type": "ModelSamplingSD3", "_meta": {"title": "ModelSamplingSD3"}},
            "87": {"inputs": {"samples": ["78", 0], "vae": ["73", 0]}, "class_type": "VAEDecode", "_meta": {"title": "VAE Decode"}},
            "88": {"inputs": {"fps": 16, "images": ["87", 0]}, "class_type": "CreateVideo", "_meta": {"title": "Create Video"}},
            "89": {"inputs": {"text": "{{POSITIVE_PROMPT}}", "clip": ["71", 0]}, "class_type": "CLIPTextEncode", "_meta": {"title": "CLIP Text Encode (Positive Prompt)"}}
        }
    },
    "holocine": {
        "name": "Holocine (Wan 2.2 14B)",
        "description": "Multi-shot cinematic video generation using Holocine fine-tuned Wan 2.2 14B model with LightX2V acceleration",
        "type": "text2video",
        "resolution": "848x480",
        "fps": 16,
        "frames": 77,
        "models": {
            "unet_high": "Wan2_2-T2V-A14B-HIGH-HoloCine-full_fp8_e4m3fn_scaled_KJ.safetensors",
            "unet_low": "Wan2_2-T2V-A14B-LOW-HoloCine-full_fp8_e4m3fn_scaled_KJ.safetensors",
            "vae": "wan_2.1_vae.safetensors",
            "clip": "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
            "lora": "lightx2v_T2V_14B_cfg_step_distill_v2_lora_rank64_bf16.safetensors"
        },
        "sampler": {
            "name": "euler",
            "scheduler": "simple",
            "steps": 7,
            "cfg_high": 3.5,
            "cfg_low": 1,
            "shift": 6,
            "switch_step": 3
        },
        "workflow_json": {
            "6": {"inputs": {"text": "{{POSITIVE_PROMPT}}", "clip": ["38", 0]}, "class_type": "CLIPTextEncode", "_meta": {"title": "CLIP Text Encode (Prompt)"}},
            "7": {"inputs": {"text": "{{NEGATIVE_PROMPT}}", "clip": ["38", 0]}, "class_type": "CLIPTextEncode", "_meta": {"title": "CLIP Text Encode (Prompt)"}},
            "8": {"inputs": {"samples": ["114", 0], "vae": ["39", 0]}, "class_type": "VAEDecode", "_meta": {"title": "VAE Decode"}},
            "38": {"inputs": {"clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan", "device": "default"}, "class_type": "CLIPLoader", "_meta": {"title": "Load CLIP"}},
            "39": {"inputs": {"vae_name": "wan_2.1_vae.safetensors"}, "class_type": "VAELoader", "_meta": {"title": "Load VAE"}},
            "59": {"inputs": {"width": 848, "height": 480, "length": 77, "batch_size": 1}, "class_type": "EmptyHunyuanLatentVideo", "_meta": {"title": "Empty HunyuanVideo 1.0 Latent"}},
            "63": {"inputs": {"frame_rate": 16, "loop_count": 0, "filename_prefix": "wan2.2", "format": "video/h264-mp4", "pix_fmt": "yuv420p", "crf": 19, "save_metadata": True, "trim_to_audio": False, "pingpong": False, "save_output": False, "images": ["184", 0]}, "class_type": "VHS_VideoCombine", "_meta": {"title": "Video Combine"}},
            "113": {"inputs": {"add_noise": "enable", "noise_seed": "{{SEED}}", "steps": ["119", 0], "cfg": 3.5, "sampler_name": "euler", "scheduler": "simple", "start_at_step": 0, "end_at_step": ["120", 0], "return_with_leftover_noise": "enable", "model": ["154", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["59", 0]}, "class_type": "KSamplerAdvanced", "_meta": {"title": "KSampler (Advanced)"}},
            "114": {"inputs": {"add_noise": "disable", "noise_seed": "{{SEED}}", "steps": ["119", 0], "cfg": 1, "sampler_name": "euler", "scheduler": "simple", "start_at_step": ["120", 0], "end_at_step": 10000, "return_with_leftover_noise": "disable", "model": ["155", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["113", 0]}, "class_type": "KSamplerAdvanced", "_meta": {"title": "KSampler (Advanced)"}},
            "119": {"inputs": {"value": 7}, "class_type": "INTConstant", "_meta": {"title": "INT Constant"}},
            "120": {"inputs": {"value": 3}, "class_type": "INTConstant", "_meta": {"title": "INT Constant"}},
            "123": {"inputs": {"anything": ["8", 0]}, "class_type": "easy cleanGpuUsed", "_meta": {"title": "Clean VRAM Used"}},
            "124": {"inputs": {"anything": ["113", 0]}, "class_type": "easy cleanGpuUsed", "_meta": {"title": "Clean VRAM Used"}},
            "152": {"inputs": {"unet_name": "Wan2_2-T2V-A14B-HIGH-HoloCine-full_fp8_e4m3fn_scaled_KJ.safetensors", "weight_dtype": "fp8_e4m3fn"}, "class_type": "UNETLoader", "_meta": {"title": "Load Diffusion Model"}},
            "153": {"inputs": {"unet_name": "Wan2_2-T2V-A14B-LOW-HoloCine-full_fp8_e4m3fn_scaled_KJ.safetensors", "weight_dtype": "fp8_e4m3fn"}, "class_type": "UNETLoader", "_meta": {"title": "Load Diffusion Model"}},
            "154": {"inputs": {"shift": 6.0, "model": ["152", 0]}, "class_type": "ModelSamplingSD3", "_meta": {"title": "ModelSamplingSD3"}},
            "155": {"inputs": {"shift": 6.0, "model": ["156", 0]}, "class_type": "ModelSamplingSD3", "_meta": {"title": "ModelSamplingSD3"}},
            "156": {"inputs": {"lora_name": "lightx2v_T2V_14B_cfg_step_distill_v2_lora_rank64_bf16.safetensors", "strength_model": 1, "model": ["153", 0]}, "class_type": "LoraLoaderModelOnly", "_meta": {"title": "LoraLoaderModelOnly"}},
            "184": {"inputs": {"sharpen_radius": 1, "sigma": 0.4, "alpha": 0.5, "image": ["8", 0]}, "class_type": "ImageSharpen", "_meta": {"title": "ImageSharpen"}}
        }
    }
}


def add_log_entry(service: str, direction: str, endpoint: str, data: any, response: any = None, error: str = None, duration_ms: float = None, status_code: int = None):
    """Add a log entry for Ollama or ComfyUI communication"""

    # Summarize data intelligently
    def summarize(obj, max_len=500):
        if obj is None:
            return None
        if isinstance(obj, str):
            return obj[:max_len] + "..." if len(obj) > max_len else obj
        if isinstance(obj, dict):
            # For workflow submissions, show key info
            if 'prompt' in obj:
                return f"[Workflow with {len(obj.get('prompt', {}))} nodes]"
            # For Ollama, show model and prompt preview
            if 'model' in obj:
                prompt = obj.get('prompt', obj.get('messages', [{}])[0].get('content', ''))[:100]
                return f"model={obj['model']}, prompt={prompt}..."
            return str(obj)[:max_len]
        if isinstance(obj, list):
            return f"[List with {len(obj)} items]"
        return str(obj)[:max_len]

    entry = {
        "id": f"{service}_{datetime.now().strftime('%H%M%S%f')}",
        "timestamp": datetime.now().isoformat(),
        "direction": direction,  # "send" or "receive"
        "endpoint": endpoint,
        "method": "POST" if direction == "send" else "RESPONSE",
        "data_summary": summarize(data),
        "response_summary": summarize(response),
        "status_code": status_code,
        "duration_ms": round(duration_ms, 2) if duration_ms else None,
        "error": error,
        "full_data": data,
        "full_response": response
    }

    if service in communication_logs:
        communication_logs[service].insert(0, entry)
        # Keep only the last MAX_LOG_ENTRIES
        communication_logs[service] = communication_logs[service][:MAX_LOG_ENTRIES]


def log_ollama_request(endpoint: str, data: dict):
    """Log an outgoing Ollama request"""
    add_log_entry("ollama", "send", endpoint, data)
    return datetime.now()


def log_ollama_response(endpoint: str, start_time: datetime, response: any = None, error: str = None, status_code: int = None):
    """Log an Ollama response"""
    duration_ms = (datetime.now() - start_time).total_seconds() * 1000
    add_log_entry("ollama", "receive", endpoint, None, response, error, duration_ms, status_code)


def log_comfyui_request(endpoint: str, data: dict):
    """Log an outgoing ComfyUI request"""
    add_log_entry("comfyui", "send", endpoint, data)
    return datetime.now()


def log_comfyui_response(endpoint: str, start_time: datetime, response: any = None, error: str = None, status_code: int = None):
    """Log a ComfyUI response"""
    duration_ms = (datetime.now() - start_time).total_seconds() * 1000
    add_log_entry("comfyui", "receive", endpoint, None, response, error, duration_ms, status_code)


def update_stats(service: str, duration_ms: float, success: bool, error: str = None, tokens: int = 0):
    """Update real-time statistics for a service"""
    stats = agent_stats[service]
    now = datetime.now()

    # Update request counts
    stats["total_requests"] += 1
    if success:
        stats["successful_requests"] += 1
    else:
        stats["failed_requests"] += 1
        stats["last_error"] = error
        stats["last_error_time"] = now.isoformat()

    # Update response times
    stats["total_response_time_ms"] += duration_ms
    stats["recent_response_times"].append(duration_ms)

    # Keep only the last N response times for rolling average
    if len(stats["recent_response_times"]) > STATS_HISTORY_SIZE:
        stats["recent_response_times"] = stats["recent_response_times"][-STATS_HISTORY_SIZE:]

    # Calculate rolling average
    if stats["recent_response_times"]:
        stats["avg_response_time_ms"] = sum(stats["recent_response_times"]) / len(stats["recent_response_times"])

    # Update min/max
    if stats["min_response_time_ms"] is None or duration_ms < stats["min_response_time_ms"]:
        stats["min_response_time_ms"] = duration_ms
    if stats["max_response_time_ms"] is None or duration_ms > stats["max_response_time_ms"]:
        stats["max_response_time_ms"] = duration_ms

    # Update success rate
    if stats["total_requests"] > 0:
        stats["success_rate"] = (stats["successful_requests"] / stats["total_requests"]) * 100

    # Track requests per minute
    stats["requests_last_minute"].append(now)
    # Remove requests older than 1 minute
    one_minute_ago = now.timestamp() - 60
    stats["requests_last_minute"] = [t for t in stats["requests_last_minute"] if t.timestamp() > one_minute_ago]
    stats["requests_per_minute"] = len(stats["requests_last_minute"])

    # Track tokens for Ollama
    if service == "ollama" and tokens > 0:
        stats["tokens_generated"] += tokens
        if duration_ms > 0:
            tokens_per_sec = (tokens / duration_ms) * 1000
            # Running average
            if stats["tokens_per_second_avg"] == 0:
                stats["tokens_per_second_avg"] = tokens_per_sec
            else:
                stats["tokens_per_second_avg"] = (stats["tokens_per_second_avg"] + tokens_per_sec) / 2


def get_hardware_info() -> Dict:
    """Get detailed hardware information about CPU, RAM, and GPU"""
    hardware = {
        "cpu": {},
        "memory": {},
        "gpu": [],
        "disk": {}
    }

    # CPU Information
    try:
        hardware["cpu"] = {
            "physical_cores": psutil.cpu_count(logical=False),
            "logical_cores": psutil.cpu_count(logical=True),
            "current_freq_mhz": None,
            "max_freq_mhz": None,
            "usage_percent": psutil.cpu_percent(interval=0.1),
            "per_core_usage": psutil.cpu_percent(interval=0.1, percpu=True)
        }

        # CPU frequency (may not be available on all systems)
        try:
            freq = psutil.cpu_freq()
            if freq:
                hardware["cpu"]["current_freq_mhz"] = round(freq.current, 0)
                hardware["cpu"]["max_freq_mhz"] = round(freq.max, 0) if freq.max else None
        except:
            pass

        # Try to get CPU model name
        try:
            if platform.system() == "Windows":
                import winreg
                key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
                hardware["cpu"]["model"] = winreg.QueryValueEx(key, "ProcessorNameString")[0].strip()
                winreg.CloseKey(key)
            elif platform.system() == "Linux":
                with open("/proc/cpuinfo", "r") as f:
                    for line in f:
                        if "model name" in line:
                            hardware["cpu"]["model"] = line.split(":")[1].strip()
                            break
            elif platform.system() == "Darwin":
                result = subprocess.run(["sysctl", "-n", "machdep.cpu.brand_string"],
                                        capture_output=True, text=True)
                if result.returncode == 0:
                    hardware["cpu"]["model"] = result.stdout.strip()
        except:
            hardware["cpu"]["model"] = "Unknown"

    except Exception as e:
        hardware["cpu"]["error"] = str(e)

    # Memory Information
    try:
        mem = psutil.virtual_memory()
        hardware["memory"] = {
            "total_gb": round(mem.total / (1024**3), 2),
            "available_gb": round(mem.available / (1024**3), 2),
            "used_gb": round(mem.used / (1024**3), 2),
            "usage_percent": mem.percent,
            "total_mb": round(mem.total / (1024**2), 0),
            "available_mb": round(mem.available / (1024**2), 0)
        }

        # Swap memory
        try:
            swap = psutil.swap_memory()
            hardware["memory"]["swap_total_gb"] = round(swap.total / (1024**3), 2)
            hardware["memory"]["swap_used_gb"] = round(swap.used / (1024**3), 2)
            hardware["memory"]["swap_percent"] = swap.percent
        except:
            pass

    except Exception as e:
        hardware["memory"]["error"] = str(e)

    # GPU Information (NVIDIA via nvidia-smi)
    try:
        result = subprocess.run(
            ['nvidia-smi', '--query-gpu=index,name,driver_version,memory.total,memory.used,memory.free,utilization.gpu,utilization.memory,temperature.gpu,power.draw,power.limit,pstate',
             '--format=csv,noheader,nounits'],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            for line in result.stdout.strip().split('\n'):
                parts = [p.strip() for p in line.split(',')]
                if len(parts) >= 12:
                    gpu_info = {
                        "index": int(parts[0]),
                        "name": parts[1],
                        "driver_version": parts[2],
                        "memory_total_mb": int(parts[3]),
                        "memory_used_mb": int(parts[4]),
                        "memory_free_mb": int(parts[5]),
                        "utilization_gpu_percent": int(parts[6]) if parts[6] != '[N/A]' else None,
                        "utilization_memory_percent": int(parts[7]) if parts[7] != '[N/A]' else None,
                        "temperature_c": int(parts[8]) if parts[8] != '[N/A]' else None,
                        "power_draw_w": float(parts[9]) if parts[9] not in ['[N/A]', '[Not Supported]'] else None,
                        "power_limit_w": float(parts[10]) if parts[10] not in ['[N/A]', '[Not Supported]'] else None,
                        "performance_state": parts[11]
                    }
                    # Calculate memory usage percentage
                    if gpu_info["memory_total_mb"] > 0:
                        gpu_info["memory_usage_percent"] = round(
                            (gpu_info["memory_used_mb"] / gpu_info["memory_total_mb"]) * 100, 1
                        )
                    hardware["gpu"].append(gpu_info)
    except FileNotFoundError:
        hardware["gpu"] = []
        hardware["gpu_note"] = "nvidia-smi not found"
    except Exception as e:
        hardware["gpu_error"] = str(e)

    # Disk Information (for the root/main drive)
    try:
        if platform.system() == "Windows":
            disk = psutil.disk_usage("C:\\")
        else:
            disk = psutil.disk_usage("/")

        hardware["disk"] = {
            "total_gb": round(disk.total / (1024**3), 2),
            "used_gb": round(disk.used / (1024**3), 2),
            "free_gb": round(disk.free / (1024**3), 2),
            "usage_percent": disk.percent
        }
    except Exception as e:
        hardware["disk"]["error"] = str(e)

    return hardware


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
        "platform_version": platform.version(),
        "python_version": platform.python_version(),
        "cpu_percent": 0,
        "memory_percent": 0,
        "gpu_info": None
    },
    "hardware": {},  # Detailed hardware info (populated at startup)
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
    endpoint = "/api/tags"
    try:
        start_time = datetime.now()
        response = requests.get(
            f"http://localhost:{node_state['ollama']['port']}{endpoint}",
            timeout=5
        )
        if response.ok:
            data = response.json()
            models = [m['name'] for m in data.get('models', [])]
            # Log successful check
            log_ollama_response(endpoint, start_time, {"models_count": len(models)}, status_code=response.status_code)
            return {"available": True, "models": models}
        log_ollama_response(endpoint, start_time, error=f"HTTP {response.status_code}", status_code=response.status_code)
    except Exception as e:
        log_ollama_response(endpoint, datetime.now(), error=str(e))
    return {"available": False, "models": []}


def check_comfyui() -> Dict:
    """Check if ComfyUI is running and get object/model info"""
    port = node_state['comfyui']['port']
    endpoints = ['/system_stats', '/api/system_stats', '/queue', '/api/queue']

    for endpoint in endpoints:
        try:
            start_time = datetime.now()
            response = requests.get(f"http://localhost:{port}{endpoint}", timeout=3)
            if response.ok:
                log_comfyui_response(endpoint, start_time, {"status": "available"}, status_code=response.status_code)

                # Try to get object_info for model lists
                models_info = get_comfyui_models(port)
                return {"available": True, "port": port, "models_info": models_info}
        except Exception as e:
            log_comfyui_response(endpoint, datetime.now(), error=str(e))

    return {"available": False, "port": port, "models_info": {}}


def get_comfyui_models(port: int) -> Dict:
    """Get available models from ComfyUI object_info endpoint"""
    models = {
        "checkpoints": [],
        "vae": [],
        "clip": [],
        "loras": [],
        "unet": []
    }

    try:
        start_time = datetime.now()
        response = requests.get(f"http://localhost:{port}/object_info", timeout=10)
        if response.ok:
            data = response.json()

            # Extract model lists from various node types
            if "CheckpointLoaderSimple" in data:
                ckpt_info = data["CheckpointLoaderSimple"].get("input", {}).get("required", {})
                if "ckpt_name" in ckpt_info:
                    models["checkpoints"] = ckpt_info["ckpt_name"][0] if isinstance(ckpt_info["ckpt_name"], list) else []

            if "VAELoader" in data:
                vae_info = data["VAELoader"].get("input", {}).get("required", {})
                if "vae_name" in vae_info:
                    models["vae"] = vae_info["vae_name"][0] if isinstance(vae_info["vae_name"], list) else []

            if "CLIPLoader" in data:
                clip_info = data["CLIPLoader"].get("input", {}).get("required", {})
                if "clip_name" in clip_info:
                    models["clip"] = clip_info["clip_name"][0] if isinstance(clip_info["clip_name"], list) else []

            if "LoraLoader" in data:
                lora_info = data["LoraLoader"].get("input", {}).get("required", {})
                if "lora_name" in lora_info:
                    models["loras"] = lora_info["lora_name"][0] if isinstance(lora_info["lora_name"], list) else []

            if "UNETLoader" in data:
                unet_info = data["UNETLoader"].get("input", {}).get("required", {})
                if "unet_name" in unet_info:
                    models["unet"] = unet_info["unet_name"][0] if isinstance(unet_info["unet_name"], list) else []

            log_comfyui_response("/object_info", start_time, {
                "checkpoints": len(models["checkpoints"]),
                "vae": len(models["vae"]),
                "clip": len(models["clip"]),
                "loras": len(models["loras"]),
                "unet": len(models["unet"])
            }, status_code=response.status_code)

    except Exception as e:
        log_comfyui_response("/object_info", datetime.now(), error=str(e))

    return models


def check_workflow_model_availability(workflow_id: str) -> Dict:
    """Check if all models required by a workflow are available on ComfyUI"""
    if workflow_id not in WORKFLOW_REGISTRY:
        return {"available": False, "error": "Unknown workflow"}

    workflow = WORKFLOW_REGISTRY[workflow_id]
    required_models = workflow.get("models", {})
    comfyui_models = node_state.get("comfyui", {}).get("models_info", {})

    availability = {
        "workflow_id": workflow_id,
        "workflow_name": workflow.get("name"),
        "all_available": True,
        "models": {}
    }

    # Flatten available models for easier checking
    all_available_models = []
    for model_list in comfyui_models.values():
        if isinstance(model_list, list):
            all_available_models.extend(model_list)

    for model_type, model_name in required_models.items():
        is_available = model_name in all_available_models
        availability["models"][model_type] = {
            "name": model_name,
            "available": is_available
        }
        if not is_available:
            availability["all_available"] = False

    return availability


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

    # Update hardware info periodically (real-time usage stats)
    hardware = get_hardware_info()
    node_state['hardware'] = hardware

    # Update uptime
    if agent_stats["started_at"]:
        agent_stats["uptime_seconds"] = (datetime.now() - datetime.fromisoformat(agent_stats["started_at"])).total_seconds()


def update_services():
    """Update Ollama and ComfyUI status"""
    ollama_status = check_ollama()
    node_state['ollama']['available'] = ollama_status['available']
    node_state['ollama']['models'] = ollama_status['models']

    comfyui_status = check_comfyui()
    node_state['comfyui']['available'] = comfyui_status['available']
    node_state['comfyui']['models_info'] = comfyui_status.get('models_info', {})


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
                "models": get_enabled_ollama_models(),  # Only broadcast enabled models
                "all_models": node_state['ollama']['models'],  # Full list for reference
                "current_job": node_state['ollama']['current_job'],
                "jobs_completed": node_state['ollama']['jobs_completed']
            },
            "comfyui": {
                "available": node_state['comfyui']['available'],
                "port": node_state['comfyui']['port'],
                "models_info": node_state['comfyui'].get('models_info', {}),
                "current_job": node_state['comfyui']['current_job'],
                "jobs_completed": node_state['comfyui']['jobs_completed']
            },
            "workflows": {
                "supported": list(WORKFLOW_REGISTRY.keys()),
                "ready": [
                    wf_id for wf_id in WORKFLOW_REGISTRY
                    if check_workflow_model_availability(wf_id).get("all_available", False)
                ]
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


# Counter for periodic update checks
heartbeat_counter = 0
UPDATE_CHECK_INTERVAL = 25  # Check for updates every N heartbeats


def background_tasks():
    """Background thread for periodic updates"""
    global heartbeat_counter

    while True:
        try:
            update_system_stats()
            update_services()
            send_heartbeat()

            # Increment heartbeat counter
            heartbeat_counter += 1

            # Check for updates every UPDATE_CHECK_INTERVAL heartbeats
            if heartbeat_counter >= UPDATE_CHECK_INTERVAL and node_state.get('central_server'):
                heartbeat_counter = 0
                try:
                    print(f"[Update] Periodic update check (every {UPDATE_CHECK_INTERVAL} heartbeats)...")
                    update_info = check_for_updates(node_state['central_server'])

                    if update_info.get("needsUpdate"):
                        print(f"[Update] New version available! Downloading...")
                        temp_path = download_update(node_state['central_server'])

                        if temp_path and apply_update(temp_path):
                            print(f"[Update] Update applied! Restarting agent...")
                            time.sleep(1)
                            restart_agent()
                    else:
                        print(f"[Update] Agent is up to date")
                except Exception as e:
                    print(f"[Update] Periodic update check failed: {e}")

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
        .model-toggle {
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .model-toggle:hover {
            transform: translateX(4px);
            background: rgba(0,217,255,0.2);
        }
        .model-enabled {
            background: rgba(0,200,83,0.15);
            border-left: 3px solid #00c853;
        }
        .model-disabled {
            background: rgba(255,82,82,0.1);
            border-left: 3px solid #ff5252;
            opacity: 0.7;
        }
        .model-status {
            font-weight: bold;
            font-size: 0.9em;
        }
        .model-enabled .model-status { color: #00c853; }
        .model-disabled .model-status { color: #ff5252; }
        .hint {
            font-size: 0.75rem;
            color: #666;
            margin-top: 8px;
            font-style: italic;
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
        /* Workflow section styles */
        .workflow-card {
            background: rgba(255,255,255,0.03);
            border-radius: 8px;
            padding: 12px;
            margin: 8px 0;
            border: 1px solid rgba(255,255,255,0.08);
        }
        .workflow-card h3 {
            color: #00d9ff;
            font-size: 0.95rem;
            margin-bottom: 8px;
        }
        .workflow-card .desc {
            color: #888;
            font-size: 0.8rem;
            margin-bottom: 8px;
        }
        .workflow-card .specs {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 8px;
        }
        .spec-badge {
            background: rgba(0,217,255,0.15);
            color: #00d9ff;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 0.75rem;
            font-family: monospace;
        }
        .model-tag {
            background: rgba(165,94,234,0.15);
            color: #a55eea;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 0.7rem;
            font-family: monospace;
            margin: 2px;
            display: inline-block;
        }
        .download-btn {
            background: linear-gradient(90deg, #00d9ff, #00ff88);
            color: #000;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.75rem;
            font-weight: 600;
            text-decoration: none;
            display: inline-block;
            margin-top: 8px;
        }
        .download-btn:hover {
            opacity: 0.9;
        }
        /* Logs section styles */
        .logs-section {
            margin-top: 20px;
        }
        .logs-section h2 {
            color: #00d9ff;
            font-size: 1.1rem;
            margin-bottom: 15px;
        }
        .log-tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
        }
        .log-tab {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            color: #888;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.85rem;
        }
        .log-tab.active {
            background: rgba(0,217,255,0.2);
            color: #00d9ff;
            border-color: #00d9ff;
        }
        .log-container {
            background: rgba(0,0,0,0.3);
            border-radius: 8px;
            padding: 12px;
            max-height: 400px;
            overflow-y: auto;
            font-family: monospace;
            font-size: 0.8rem;
        }
        .log-entry {
            padding: 8px;
            border-bottom: 1px solid rgba(255,255,255,0.05);
            margin-bottom: 4px;
        }
        .log-entry:last-child {
            border-bottom: none;
        }
        .log-entry .timestamp {
            color: #666;
            font-size: 0.7rem;
        }
        .log-entry .direction {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 0.7rem;
            margin: 0 4px;
        }
        .log-entry .direction.send {
            background: rgba(0,200,83,0.2);
            color: #00c853;
        }
        .log-entry .direction.receive {
            background: rgba(0,217,255,0.2);
            color: #00d9ff;
        }
        .log-entry .direction.error {
            background: rgba(255,82,82,0.2);
            color: #ff5252;
        }
        .log-entry .endpoint {
            color: #ffa502;
        }
        .log-entry .data-preview {
            color: #888;
            font-size: 0.75rem;
            margin-top: 4px;
            word-break: break-all;
            max-height: 60px;
            overflow: hidden;
        }
        .clear-logs-btn {
            background: rgba(255,82,82,0.2);
            color: #ff5252;
            border: 1px solid rgba(255,82,82,0.3);
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.75rem;
            margin-left: 10px;
        }
        .full-width {
            grid-column: 1 / -1;
        }
        .section-title {
            color: #00d9ff;
            font-size: 1.3rem;
            margin: 30px 0 15px 0;
            padding-bottom: 10px;
            border-bottom: 1px solid rgba(0,217,255,0.3);
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

            <!-- Hardware Info -->
            <div class="card">
                <h2>🔧 Hardware</h2>
                {% if hardware.cpu %}
                <div class="metric">
                    <span class="metric-label">CPU</span>
                    <span class="metric-value" style="font-size: 0.8rem;">{{ hardware.cpu.model[:30] if hardware.cpu.model else 'Unknown' }}{% if hardware.cpu.model and hardware.cpu.model|length > 30 %}...{% endif %}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Cores</span>
                    <span class="metric-value">{{ hardware.cpu.logical_cores }} ({{ hardware.cpu.physical_cores }} physical)</span>
                </div>
                {% endif %}
                {% if hardware.memory %}
                <div class="metric">
                    <span class="metric-label">RAM</span>
                    <span class="metric-value">{{ hardware.memory.total_gb }} GB total</span>
                </div>
                {% endif %}
                {% if hardware.gpu %}
                {% for gpu in hardware.gpu %}
                <div class="metric" style="margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
                    <span class="metric-label">GPU {{ loop.index0 }}</span>
                    <span class="metric-value" style="font-size: 0.8rem;">{{ gpu.name[:25] }}{% if gpu.name|length > 25 %}...{% endif %}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">VRAM</span>
                    <span class="metric-value">{{ gpu.memory_total_mb }} MB</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Driver</span>
                    <span class="metric-value">{{ gpu.driver_version }}</span>
                </div>
                {% endfor %}
                {% else %}
                <div class="metric">
                    <span class="metric-label">GPU</span>
                    <span class="metric-value" style="color: #888;">None detected</span>
                </div>
                {% endif %}
            </div>

            <!-- System Stats (Real-time) -->
            <div class="card">
                <h2>📊 Real-time Resources</h2>
                <div class="metric">
                    <span class="metric-label">CPU Usage</span>
                    <span class="metric-value">{{ system.cpu_percent }}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill progress-cpu" style="width: {{ system.cpu_percent }}%"></div>
                </div>
                <div class="metric" style="margin-top: 15px;">
                    <span class="metric-label">Memory</span>
                    <span class="metric-value">{{ hardware.memory.used_gb if hardware.memory else '?' }} / {{ hardware.memory.total_gb if hardware.memory else '?' }} GB ({{ system.memory_percent }}%)</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill progress-mem" style="width: {{ system.memory_percent }}%"></div>
                </div>
                {% if hardware.gpu %}
                {% for gpu in hardware.gpu %}
                <div class="metric" style="margin-top: 15px;">
                    <span class="metric-label">GPU {{ loop.index0 }}</span>
                    <span class="metric-value">{{ gpu.utilization_gpu_percent if gpu.utilization_gpu_percent else '?' }}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill progress-gpu" style="width: {{ gpu.utilization_gpu_percent if gpu.utilization_gpu_percent else 0 }}%"></div>
                </div>
                <div class="metric">
                    <span class="metric-label">VRAM</span>
                    <span class="metric-value">{{ gpu.memory_used_mb }} / {{ gpu.memory_total_mb }} MB ({{ gpu.memory_usage_percent }}%)</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill progress-gpu" style="width: {{ gpu.memory_usage_percent }}%"></div>
                </div>
                {% if gpu.temperature_c %}
                <div class="metric">
                    <span class="metric-label">Temp</span>
                    <span class="metric-value" style="{% if gpu.temperature_c > 80 %}color: #ff5252;{% elif gpu.temperature_c > 70 %}color: #ffa502;{% endif %}">{{ gpu.temperature_c }}°C</span>
                </div>
                {% endif %}
                {% if gpu.power_draw_w %}
                <div class="metric">
                    <span class="metric-label">Power</span>
                    <span class="metric-value">{{ gpu.power_draw_w|round(1) }} / {{ gpu.power_limit_w|round(1) if gpu.power_limit_w else '?' }} W</span>
                </div>
                {% endif %}
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
                    <span class="metric-label">Models ({{ enabled_models | length }} enabled / {{ ollama.models | length }} total)</span>
                </div>
                <div class="model-list">
                    {% for model in ollama.models %}
                    <div class="model-item model-toggle {% if model in enabled_models %}model-enabled{% else %}model-disabled{% endif %}"
                         onclick="toggleModel('{{ model }}')"
                         title="Click to {{ 'disable' if model in enabled_models else 'enable' }}">
                        <span class="model-status">{% if model in enabled_models %}✓{% else %}✗{% endif %}</span>
                        {{ model }}
                    </div>
                    {% endfor %}
                </div>
                <p class="hint">Click models to enable/disable them for the pipeline</p>
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

        <!-- Supported Workflows Section -->
        <h2 class="section-title">🎬 Supported ComfyUI Workflows</h2>
        <div class="grid">
            {% for workflow_id, workflow in workflows.items() %}
            {% set avail = workflow_availability.get(workflow_id, {}) %}
            <div class="card workflow-card">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <h3>{{ workflow.name }}</h3>
                    <span class="status-badge {{ 'status-online' if avail.all_available else 'status-offline' }}" style="font-size: 0.65rem;">
                        {{ 'READY' if avail.all_available else 'MISSING MODELS' }}
                    </span>
                </div>
                <p class="desc">{{ workflow.description }}</p>
                <div class="specs">
                    <span class="spec-badge">{{ workflow.resolution }}</span>
                    <span class="spec-badge">{{ workflow.fps }} FPS</span>
                    <span class="spec-badge">{{ workflow.frames }} frames</span>
                    <span class="spec-badge">{{ workflow.type }}</span>
                </div>
                <div style="margin-top: 8px;">
                    <strong style="color: #888; font-size: 0.75rem;">Required Models:</strong><br>
                    {% for model_type, model_name in workflow.models.items() %}
                    {% set model_avail = avail.models.get(model_type, {}).get('available', False) if avail.models else False %}
                    <span class="model-tag" title="{{ model_type }}: {{ 'Available' if model_avail else 'Missing' }}" style="{% if model_avail %}background: rgba(0,200,83,0.15); color: #00c853;{% else %}background: rgba(255,82,82,0.15); color: #ff5252;{% endif %}">
                        {% if model_avail %}✓{% else %}✗{% endif %} {{ model_name[:35] }}{% if model_name|length > 35 %}...{% endif %}
                    </span>
                    {% endfor %}
                </div>
                {% if workflow.sampler %}
                <div style="margin-top: 8px;">
                    <strong style="color: #888; font-size: 0.75rem;">Sampler:</strong>
                    <span class="spec-badge">{{ workflow.sampler.name }}</span>
                    <span class="spec-badge">{{ workflow.sampler.steps }} steps</span>
                    {% if workflow.sampler.cfg %}<span class="spec-badge">CFG {{ workflow.sampler.cfg }}</span>{% endif %}
                    {% if workflow.sampler.cfg_high %}<span class="spec-badge">CFG {{ workflow.sampler.cfg_high }}/{{ workflow.sampler.cfg_low }}</span>{% endif %}
                </div>
                {% endif %}
                <a href="/api/workflows/{{ workflow_id }}/download" class="download-btn">📥 Download Workflow JSON</a>
            </div>
            {% endfor %}
        </div>

        <!-- Performance Stats Section -->
        <h2 class="section-title">📈 Performance Stats (Load Balancing)</h2>
        <div class="grid">
            <!-- Ollama Stats -->
            <div class="card">
                <h2>🦙 Ollama Stats</h2>
                <div class="metric">
                    <span class="metric-label">Total Requests</span>
                    <span class="metric-value">{{ stats.ollama.total_requests }}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Success Rate</span>
                    <span class="metric-value" style="{% if stats.ollama.success_rate < 90 %}color: #ff5252;{% elif stats.ollama.success_rate < 95 %}color: #ffa502;{% else %}color: #00c853;{% endif %}">{{ stats.ollama.success_rate|round(1) }}%</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Avg Response Time</span>
                    <span class="metric-value">{{ stats.ollama.avg_response_time_ms|round(0) }} ms</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Requests/min</span>
                    <span class="metric-value">{{ stats.ollama.requests_per_minute }}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Tokens Generated</span>
                    <span class="metric-value">{{ stats.ollama.tokens_generated }}</span>
                </div>
                {% if stats.ollama.tokens_per_second_avg > 0 %}
                <div class="metric">
                    <span class="metric-label">Avg Tokens/sec</span>
                    <span class="metric-value">{{ stats.ollama.tokens_per_second_avg|round(1) }}</span>
                </div>
                {% endif %}
                {% if stats.ollama.last_error %}
                <div class="metric" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,82,82,0.3);">
                    <span class="metric-label" style="color: #ff5252;">Last Error</span>
                    <span class="metric-value" style="color: #ff5252; font-size: 0.75rem;">{{ stats.ollama.last_error[:50] }}...</span>
                </div>
                {% endif %}
            </div>

            <!-- ComfyUI Stats -->
            <div class="card">
                <h2>🎨 ComfyUI Stats</h2>
                <div class="metric">
                    <span class="metric-label">Total Requests</span>
                    <span class="metric-value">{{ stats.comfyui.total_requests }}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Success Rate</span>
                    <span class="metric-value" style="{% if stats.comfyui.success_rate < 90 %}color: #ff5252;{% elif stats.comfyui.success_rate < 95 %}color: #ffa502;{% else %}color: #00c853;{% endif %}">{{ stats.comfyui.success_rate|round(1) }}%</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Avg Response Time</span>
                    <span class="metric-value">{{ stats.comfyui.avg_response_time_ms|round(0) }} ms</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Requests/min</span>
                    <span class="metric-value">{{ stats.comfyui.requests_per_minute }}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Renders Completed</span>
                    <span class="metric-value">{{ stats.comfyui.renders_completed }}</span>
                </div>
                {% if stats.comfyui.last_error %}
                <div class="metric" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,82,82,0.3);">
                    <span class="metric-label" style="color: #ff5252;">Last Error</span>
                    <span class="metric-value" style="color: #ff5252; font-size: 0.75rem;">{{ stats.comfyui.last_error[:50] }}...</span>
                </div>
                {% endif %}
            </div>
        </div>

        <!-- Communication Logs Section -->
        <h2 class="section-title">📋 Communication Logs</h2>
        <div class="card full-width logs-section">
            <div class="log-tabs">
                <button class="log-tab active" onclick="showLogs('ollama')">🦙 Ollama ({{ ollama_logs|length }})</button>
                <button class="log-tab" onclick="showLogs('comfyui')">🎨 ComfyUI ({{ comfyui_logs|length }})</button>
                <button class="clear-logs-btn" onclick="clearLogs()">Clear Logs</button>
            </div>

            <div id="ollama-logs" class="log-container">
                {% if ollama_logs %}
                {% for log in ollama_logs %}
                <div class="log-entry">
                    <span class="timestamp">{{ log.timestamp[11:19] }}</span>
                    <span class="direction {{ log.direction }}{% if log.error %} error{% endif %}">
                        {% if log.error %}ERROR{% else %}{{ log.direction|upper }}{% endif %}
                    </span>
                    <span class="endpoint">{{ log.endpoint }}</span>
                    {% if log.duration_ms %}<span style="color: #888; font-size: 0.7rem; margin-left: 8px;">{{ log.duration_ms }}ms</span>{% endif %}
                    {% if log.status_code %}<span style="color: {% if log.status_code == 200 %}#00c853{% else %}#ff5252{% endif %}; font-size: 0.7rem; margin-left: 4px;">[{{ log.status_code }}]</span>{% endif %}
                    {% if log.error %}
                    <div class="data-preview" style="color: #ff5252;">{{ log.error }}</div>
                    {% elif log.response_summary %}
                    <div class="data-preview">{{ log.response_summary }}</div>
                    {% elif log.data_summary %}
                    <div class="data-preview">{{ log.data_summary }}</div>
                    {% endif %}
                </div>
                {% endfor %}
                {% else %}
                <div style="color: #666; text-align: center; padding: 20px;">No Ollama logs yet</div>
                {% endif %}
            </div>

            <div id="comfyui-logs" class="log-container" style="display: none;">
                {% if comfyui_logs %}
                {% for log in comfyui_logs %}
                <div class="log-entry">
                    <span class="timestamp">{{ log.timestamp[11:19] }}</span>
                    <span class="direction {{ log.direction }}{% if log.error %} error{% endif %}">
                        {% if log.error %}ERROR{% else %}{{ log.direction|upper }}{% endif %}
                    </span>
                    <span class="endpoint">{{ log.endpoint }}</span>
                    {% if log.duration_ms %}<span style="color: #888; font-size: 0.7rem; margin-left: 8px;">{{ log.duration_ms }}ms</span>{% endif %}
                    {% if log.status_code %}<span style="color: {% if log.status_code == 200 %}#00c853{% else %}#ff5252{% endif %}; font-size: 0.7rem; margin-left: 4px;">[{{ log.status_code }}]</span>{% endif %}
                    {% if log.error %}
                    <div class="data-preview" style="color: #ff5252;">{{ log.error }}</div>
                    {% elif log.response_summary %}
                    <div class="data-preview">{{ log.response_summary }}</div>
                    {% elif log.data_summary %}
                    <div class="data-preview">{{ log.data_summary }}</div>
                    {% endif %}
                </div>
                {% endfor %}
                {% else %}
                <div style="color: #666; text-align: center; padding: 20px;">No ComfyUI logs yet</div>
                {% endif %}
            </div>
        </div>

        <footer>
            Story Generator Node Agent v1.1 | Uptime: {{ (stats.uptime_seconds // 3600)|int }}h {{ ((stats.uptime_seconds % 3600) // 60)|int }}m | Last updated: {{ now }}
        </footer>
    </div>

    <script>
        let currentLogService = 'ollama';

        function showLogs(service) {
            currentLogService = service;
            document.querySelectorAll('.log-tab').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.log-container').forEach(container => container.style.display = 'none');

            event.target.classList.add('active');
            document.getElementById(service + '-logs').style.display = 'block';
        }

        function clearLogs() {
            if (confirm('Clear ' + currentLogService + ' logs?')) {
                fetch('/api/logs/' + currentLogService + '/clear', { method: 'POST' })
                    .then(() => location.reload());
            }
        }

        // Toggle model enabled/disabled status
        function toggleModel(modelName) {
            fetch('/api/models/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelName })
            })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'ok') {
                    // Reload to show updated state
                    location.reload();
                } else {
                    alert('Failed to toggle model: ' + (data.error || 'Unknown error'));
                }
            })
            .catch(err => {
                alert('Error toggling model: ' + err);
            });
        }
    </script>
</body>
</html>
"""


# API Routes
@app.route('/')
def dashboard():
    """Render the dashboard UI"""
    # Prepare workflow data for template (without the full JSON for display)
    workflows_display = {}
    for wf_id, wf in WORKFLOW_REGISTRY.items():
        workflows_display[wf_id] = {
            "name": wf["name"],
            "description": wf["description"],
            "type": wf["type"],
            "resolution": wf["resolution"],
            "fps": wf["fps"],
            "frames": wf["frames"],
            "models": wf["models"],
            "sampler": wf["sampler"]
        }

    # Check workflow model availability
    workflow_availability = {}
    for wf_id in WORKFLOW_REGISTRY:
        workflow_availability[wf_id] = check_workflow_model_availability(wf_id)

    # Prepare stats for template
    stats_for_template = {
        "ollama": {
            "total_requests": agent_stats["ollama"]["total_requests"],
            "success_rate": agent_stats["ollama"]["success_rate"],
            "avg_response_time_ms": agent_stats["ollama"]["avg_response_time_ms"],
            "requests_per_minute": agent_stats["ollama"]["requests_per_minute"],
            "tokens_generated": agent_stats["ollama"]["tokens_generated"],
            "tokens_per_second_avg": agent_stats["ollama"]["tokens_per_second_avg"],
            "last_error": agent_stats["ollama"]["last_error"]
        },
        "comfyui": {
            "total_requests": agent_stats["comfyui"]["total_requests"],
            "success_rate": agent_stats["comfyui"]["success_rate"],
            "avg_response_time_ms": agent_stats["comfyui"]["avg_response_time_ms"],
            "requests_per_minute": agent_stats["comfyui"]["requests_per_minute"],
            "renders_completed": agent_stats["comfyui"]["renders_completed"],
            "last_error": agent_stats["comfyui"]["last_error"]
        },
        "uptime_seconds": agent_stats["uptime_seconds"]
    }

    return render_template_string(
        DASHBOARD_HTML,
        **node_state,
        enabled_models=get_enabled_ollama_models(),
        workflows=workflows_display,
        workflow_availability=workflow_availability,
        stats=stats_for_template,
        ollama_logs=communication_logs["ollama"],
        comfyui_logs=communication_logs["comfyui"],
        now=datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    )


@app.route('/api/status')
def api_status():
    """Get full node status as JSON"""
    return jsonify({
        **node_state,
        "timestamp": datetime.now().isoformat()
    })


@app.route('/api/version')
def api_version():
    """Get agent version info"""
    return jsonify({
        "version": AGENT_VERSION,
        "hash": get_file_hash(__file__),
        "hostname": node_state['hostname'],
        "node_id": node_state['node_id']
    })


@app.route('/api/update/check')
def api_update_check():
    """Check if an update is available from the central server"""
    if not node_state.get('central_server'):
        return jsonify({"error": "No central server configured"}), 400

    update_info = check_for_updates(node_state['central_server'])
    return jsonify({
        "currentVersion": AGENT_VERSION,
        "currentHash": get_file_hash(__file__),
        **update_info
    })


@app.route('/api/update/apply', methods=['POST'])
def api_update_apply():
    """Manually trigger an update from the central server"""
    if not node_state.get('central_server'):
        return jsonify({"error": "No central server configured"}), 400

    # Check for update
    update_info = check_for_updates(node_state['central_server'])

    if not update_info.get("needsUpdate"):
        return jsonify({
            "status": "up_to_date",
            "message": "Agent is already up to date"
        })

    # Download and apply
    temp_path = download_update(node_state['central_server'])
    if not temp_path:
        return jsonify({"error": "Failed to download update"}), 500

    if apply_update(temp_path):
        # Schedule restart in background
        def delayed_restart():
            time.sleep(2)
            restart_agent()
        threading.Thread(target=delayed_restart, daemon=True).start()

        return jsonify({
            "status": "updated",
            "message": "Update applied, agent restarting in 2 seconds..."
        })
    else:
        return jsonify({"error": "Failed to apply update"}), 500


@app.route('/api/health')
def api_health():
    """Simple health check endpoint"""
    return jsonify({
        "status": "ok",
        "version": AGENT_VERSION,
        "node_id": node_state['node_id'],
        "hostname": node_state['hostname'],
        "ollama": node_state['ollama']['available'],
        "comfyui": node_state['comfyui']['available']
    })


@app.route('/api/models/config')
def api_models_config():
    """Get model visibility configuration"""
    all_models = node_state['ollama'].get('models', [])
    disabled = model_config.get('ollama_disabled_models', [])

    return jsonify({
        "ollama_models": [
            {"name": m, "enabled": m not in disabled}
            for m in all_models
        ],
        "ollama_disabled_models": disabled,
        "comfyui_disabled_workflows": model_config.get('comfyui_disabled_workflows', [])
    })


@app.route('/api/models/toggle', methods=['POST'])
def api_models_toggle():
    """Toggle a model's enabled/disabled status"""
    data = request.json
    model_name = data.get('model')
    enabled = data.get('enabled')

    if not model_name:
        return jsonify({"error": "Model name required"}), 400

    if enabled is None:
        # Toggle current state
        enabled = not is_ollama_model_enabled(model_name)

    set_ollama_model_enabled(model_name, enabled)

    return jsonify({
        "status": "ok",
        "model": model_name,
        "enabled": enabled
    })


@app.route('/api/models/set-enabled', methods=['POST'])
def api_models_set_enabled():
    """Set multiple models enabled/disabled at once"""
    data = request.json
    models = data.get('models', {})  # {"model_name": true/false, ...}

    for model_name, enabled in models.items():
        set_ollama_model_enabled(model_name, enabled)

    return jsonify({
        "status": "ok",
        "updated": list(models.keys()),
        "current_disabled": model_config.get('ollama_disabled_models', [])
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


# Workflow API endpoints
@app.route('/api/workflows')
def api_workflows():
    """Get list of all supported workflows with their configurations"""
    workflows_summary = {}
    for workflow_id, workflow in WORKFLOW_REGISTRY.items():
        workflows_summary[workflow_id] = {
            "name": workflow["name"],
            "description": workflow["description"],
            "type": workflow["type"],
            "resolution": workflow["resolution"],
            "fps": workflow["fps"],
            "frames": workflow["frames"],
            "models": workflow["models"],
            "sampler": workflow["sampler"]
        }
    return jsonify({"workflows": workflows_summary})


@app.route('/api/workflows/<workflow_id>')
def api_workflow_detail(workflow_id):
    """Get detailed info for a specific workflow"""
    if workflow_id not in WORKFLOW_REGISTRY:
        return jsonify({"error": f"Workflow '{workflow_id}' not found"}), 404
    return jsonify(WORKFLOW_REGISTRY[workflow_id])


@app.route('/api/workflows/<workflow_id>/download')
def api_workflow_download(workflow_id):
    """Download the workflow JSON file for import into ComfyUI"""
    if workflow_id not in WORKFLOW_REGISTRY:
        return jsonify({"error": f"Workflow '{workflow_id}' not found"}), 404

    workflow = WORKFLOW_REGISTRY[workflow_id]
    workflow_json = workflow.get("workflow_json", {})

    response = app.response_class(
        response=json.dumps(workflow_json, indent=2),
        status=200,
        mimetype='application/json'
    )
    response.headers['Content-Disposition'] = f'attachment; filename={workflow_id}_api.json'
    return response


@app.route('/api/workflows/<workflow_id>/availability')
def api_workflow_availability(workflow_id):
    """Check if all models required by a workflow are available"""
    availability = check_workflow_model_availability(workflow_id)
    return jsonify(availability)


@app.route('/api/workflows/availability')
def api_all_workflows_availability():
    """Check availability of all workflows"""
    all_availability = {}
    for workflow_id in WORKFLOW_REGISTRY:
        all_availability[workflow_id] = check_workflow_model_availability(workflow_id)
    return jsonify({"workflows": all_availability})


@app.route('/api/comfyui/models')
def api_comfyui_models():
    """Get all available ComfyUI models"""
    return jsonify({
        "models": node_state.get("comfyui", {}).get("models_info", {}),
        "available": node_state.get("comfyui", {}).get("available", False)
    })


# Communication Logs API endpoints
@app.route('/api/logs')
def api_logs():
    """Get all communication logs"""
    return jsonify({
        "ollama": communication_logs["ollama"],
        "comfyui": communication_logs["comfyui"]
    })


@app.route('/api/logs/<service>')
def api_logs_service(service):
    """Get logs for a specific service (ollama or comfyui)"""
    if service not in communication_logs:
        return jsonify({"error": f"Unknown service '{service}'. Use 'ollama' or 'comfyui'"}), 400
    return jsonify({"logs": communication_logs[service]})


@app.route('/api/logs/<service>/clear', methods=['POST'])
def api_logs_clear(service):
    """Clear logs for a specific service"""
    if service not in communication_logs:
        return jsonify({"error": f"Unknown service '{service}'"}), 400
    communication_logs[service] = []
    return jsonify({"status": "ok", "message": f"Cleared {service} logs"})


@app.route('/api/logs/add', methods=['POST'])
def api_logs_add():
    """Add a log entry (called by the main app to log communications)"""
    data = request.json
    service = data.get('service', 'ollama')
    direction = data.get('direction', 'send')
    endpoint = data.get('endpoint', '')
    payload = data.get('data')
    response_data = data.get('response')
    error = data.get('error')

    add_log_entry(service, direction, endpoint, payload, response_data, error)
    return jsonify({"status": "ok"})


# =============================================================================
# STATS & LOAD BALANCING ENDPOINTS
# =============================================================================

@app.route('/api/stats')
def api_stats():
    """
    Get real-time statistics for load balancing decisions.
    Returns response times, success rates, queue depth, and throughput metrics.
    """
    # Clean up old request timestamps
    now = datetime.now()
    one_minute_ago = now.timestamp() - 60

    for service in ["ollama", "comfyui"]:
        agent_stats[service]["requests_last_minute"] = [
            t for t in agent_stats[service]["requests_last_minute"]
            if t.timestamp() > one_minute_ago
        ]
        agent_stats[service]["requests_per_minute"] = len(agent_stats[service]["requests_last_minute"])

    # Build response without the internal timestamp objects
    stats_response = {
        "ollama": {
            "total_requests": agent_stats["ollama"]["total_requests"],
            "successful_requests": agent_stats["ollama"]["successful_requests"],
            "failed_requests": agent_stats["ollama"]["failed_requests"],
            "success_rate": round(agent_stats["ollama"]["success_rate"], 2),
            "avg_response_time_ms": round(agent_stats["ollama"]["avg_response_time_ms"], 2),
            "min_response_time_ms": agent_stats["ollama"]["min_response_time_ms"],
            "max_response_time_ms": agent_stats["ollama"]["max_response_time_ms"],
            "requests_per_minute": agent_stats["ollama"]["requests_per_minute"],
            "current_queue_depth": agent_stats["ollama"]["current_queue_depth"],
            "tokens_generated": agent_stats["ollama"]["tokens_generated"],
            "tokens_per_second_avg": round(agent_stats["ollama"]["tokens_per_second_avg"], 2),
            "last_error": agent_stats["ollama"]["last_error"],
            "last_error_time": agent_stats["ollama"]["last_error_time"],
            "is_busy": node_state['ollama']['current_job'] is not None
        },
        "comfyui": {
            "total_requests": agent_stats["comfyui"]["total_requests"],
            "successful_requests": agent_stats["comfyui"]["successful_requests"],
            "failed_requests": agent_stats["comfyui"]["failed_requests"],
            "success_rate": round(agent_stats["comfyui"]["success_rate"], 2),
            "avg_response_time_ms": round(agent_stats["comfyui"]["avg_response_time_ms"], 2),
            "min_response_time_ms": agent_stats["comfyui"]["min_response_time_ms"],
            "max_response_time_ms": agent_stats["comfyui"]["max_response_time_ms"],
            "requests_per_minute": agent_stats["comfyui"]["requests_per_minute"],
            "current_queue_depth": agent_stats["comfyui"]["current_queue_depth"],
            "renders_completed": agent_stats["comfyui"]["renders_completed"],
            "avg_render_time_ms": round(agent_stats["comfyui"]["avg_render_time_ms"], 2),
            "last_error": agent_stats["comfyui"]["last_error"],
            "last_error_time": agent_stats["comfyui"]["last_error_time"],
            "is_busy": node_state['comfyui']['current_job'] is not None
        },
        "uptime_seconds": round(agent_stats["uptime_seconds"], 0),
        "timestamp": now.isoformat()
    }

    return jsonify(stats_response)


@app.route('/api/stats/reset', methods=['POST'])
def api_stats_reset():
    """Reset all statistics counters"""
    for service in ["ollama", "comfyui"]:
        agent_stats[service].update({
            "total_requests": 0,
            "successful_requests": 0,
            "failed_requests": 0,
            "total_response_time_ms": 0,
            "avg_response_time_ms": 0,
            "min_response_time_ms": None,
            "max_response_time_ms": None,
            "requests_per_minute": 0,
            "success_rate": 100.0,
            "current_queue_depth": 0,
            "recent_response_times": [],
            "requests_last_minute": [],
            "last_error": None,
            "last_error_time": None
        })
    return jsonify({"status": "ok", "message": "Statistics reset"})


@app.route('/api/hardware')
def api_hardware():
    """
    Get detailed hardware information.
    Useful for understanding node capabilities and making informed load balancing decisions.
    """
    # Get fresh hardware info
    hardware = get_hardware_info()
    return jsonify({
        "hardware": hardware,
        "hostname": node_state['hostname'],
        "platform": node_state['system']['platform'],
        "timestamp": datetime.now().isoformat()
    })


@app.route('/api/capabilities')
def api_capabilities():
    """
    Get full node capabilities for smart job routing.
    Returns what this agent can do: available models, workflows, and current capacity.
    """
    # Check all workflow availability
    workflow_availability = {}
    ready_workflows = []
    for workflow_id in WORKFLOW_REGISTRY:
        avail = check_workflow_model_availability(workflow_id)
        workflow_availability[workflow_id] = avail
        if avail.get("all_available", False):
            ready_workflows.append(workflow_id)

    # Get current load status
    hardware = node_state.get('hardware', {})
    gpu_info = hardware.get('gpu', [])

    # Calculate available capacity
    gpu_available = len(gpu_info) > 0 and all(
        g.get('memory_usage_percent', 100) < 90 for g in gpu_info
    )

    capabilities = {
        "node_id": node_state['node_id'],
        "hostname": node_state['hostname'],

        # Services
        "services": {
            "ollama": {
                "available": node_state['ollama']['available'],
                "models": node_state['ollama']['models'],
                "is_busy": node_state['ollama']['current_job'] is not None
            },
            "comfyui": {
                "available": node_state['comfyui']['available'],
                "is_busy": node_state['comfyui']['current_job'] is not None
            }
        },

        # Workflows this agent can run
        "workflows": {
            "supported": list(WORKFLOW_REGISTRY.keys()),
            "ready": ready_workflows,  # Have all models
            "availability": workflow_availability
        },

        # Current capacity
        "capacity": {
            "can_accept_ollama_jobs": (
                node_state['ollama']['available'] and
                node_state['ollama']['current_job'] is None
            ),
            "can_accept_comfyui_jobs": (
                node_state['comfyui']['available'] and
                node_state['comfyui']['current_job'] is None and
                gpu_available
            ),
            "gpu_available": gpu_available,
            "cpu_usage_percent": hardware.get('cpu', {}).get('usage_percent', 0),
            "memory_usage_percent": hardware.get('memory', {}).get('usage_percent', 0),
            "gpu_memory_usage_percent": gpu_info[0].get('memory_usage_percent', 0) if gpu_info else None
        },

        # Hardware summary for load balancing
        "hardware_summary": {
            "cpu_cores": hardware.get('cpu', {}).get('logical_cores', 0),
            "cpu_model": hardware.get('cpu', {}).get('model', 'Unknown'),
            "ram_total_gb": hardware.get('memory', {}).get('total_gb', 0),
            "ram_available_gb": hardware.get('memory', {}).get('available_gb', 0),
            "gpu_count": len(gpu_info),
            "gpu_names": [g.get('name', 'Unknown') for g in gpu_info],
            "gpu_vram_total_mb": sum(g.get('memory_total_mb', 0) for g in gpu_info),
            "gpu_vram_free_mb": sum(g.get('memory_free_mb', 0) for g in gpu_info)
        },

        # Performance metrics
        "performance": {
            "ollama_avg_response_ms": agent_stats["ollama"]["avg_response_time_ms"],
            "ollama_success_rate": agent_stats["ollama"]["success_rate"],
            "comfyui_avg_response_ms": agent_stats["comfyui"]["avg_response_time_ms"],
            "comfyui_success_rate": agent_stats["comfyui"]["success_rate"]
        },

        "timestamp": datetime.now().isoformat()
    }

    return jsonify(capabilities)


@app.route('/api/can-handle', methods=['POST'])
def api_can_handle():
    """
    Smart job acceptance endpoint.
    Check if this agent can handle a specific job based on requirements.

    Request body:
    {
        "job_type": "ollama" | "comfyui",
        "model": "model_name" (for ollama),
        "workflow_id": "workflow_id" (for comfyui),
        "priority": "low" | "normal" | "high" (optional)
    }
    """
    data = request.json or {}
    job_type = data.get('job_type', 'ollama')
    model = data.get('model')
    workflow_id = data.get('workflow_id')
    priority = data.get('priority', 'normal')

    result = {
        "can_handle": False,
        "reason": None,
        "score": 0,  # 0-100 score for load balancing
        "estimated_wait_ms": None
    }

    if job_type == 'ollama':
        # Check Ollama availability
        if not node_state['ollama']['available']:
            result["reason"] = "Ollama not available"
            return jsonify(result)

        # Check if model is available
        if model and model not in node_state['ollama']['models']:
            result["reason"] = f"Model '{model}' not available"
            return jsonify(result)

        # Check if busy
        is_busy = node_state['ollama']['current_job'] is not None
        if is_busy and priority != 'high':
            result["reason"] = "Currently processing another job"
            result["estimated_wait_ms"] = agent_stats["ollama"]["avg_response_time_ms"]
            # Still can handle, just with lower score
            result["can_handle"] = True
            result["score"] = 30
            return jsonify(result)

        # Calculate score based on performance
        base_score = 100
        if agent_stats["ollama"]["avg_response_time_ms"] > 10000:
            base_score -= 20  # Slow responses
        if agent_stats["ollama"]["success_rate"] < 95:
            base_score -= 30  # Low success rate
        if is_busy:
            base_score -= 40

        result["can_handle"] = True
        result["score"] = max(0, base_score)
        result["estimated_wait_ms"] = agent_stats["ollama"]["avg_response_time_ms"] if is_busy else 0

    elif job_type == 'comfyui':
        # Check ComfyUI availability
        if not node_state['comfyui']['available']:
            result["reason"] = "ComfyUI not available"
            return jsonify(result)

        # Check if workflow is supported and models available
        if workflow_id:
            if workflow_id not in WORKFLOW_REGISTRY:
                result["reason"] = f"Workflow '{workflow_id}' not supported"
                return jsonify(result)

            avail = check_workflow_model_availability(workflow_id)
            if not avail.get("all_available", False):
                missing = [m for m, info in avail.get("models", {}).items() if not info.get("available")]
                result["reason"] = f"Missing models: {', '.join(missing)}"
                return jsonify(result)

        # Check GPU availability
        hardware = node_state.get('hardware', {})
        gpu_info = hardware.get('gpu', [])
        if not gpu_info:
            result["reason"] = "No GPU available"
            return jsonify(result)

        gpu_memory_percent = gpu_info[0].get('memory_usage_percent', 100)
        if gpu_memory_percent > 95:
            result["reason"] = "GPU memory full"
            return jsonify(result)

        # Check if busy
        is_busy = node_state['comfyui']['current_job'] is not None
        if is_busy and priority != 'high':
            result["reason"] = "Currently rendering"
            result["estimated_wait_ms"] = agent_stats["comfyui"]["avg_response_time_ms"]
            result["can_handle"] = True
            result["score"] = 30
            return jsonify(result)

        # Calculate score
        base_score = 100
        if gpu_memory_percent > 80:
            base_score -= 20
        if agent_stats["comfyui"]["success_rate"] < 95:
            base_score -= 30
        if is_busy:
            base_score -= 40

        result["can_handle"] = True
        result["score"] = max(0, base_score)
        result["estimated_wait_ms"] = agent_stats["comfyui"]["avg_response_time_ms"] if is_busy else 0

    return jsonify(result)


@app.route('/api/load-balance-info')
def api_load_balance_info():
    """
    Compact endpoint for load balancers.
    Returns minimal info needed for quick routing decisions.
    """
    hardware = node_state.get('hardware', {})
    gpu_info = hardware.get('gpu', [])

    return jsonify({
        "node_id": node_state['node_id'],
        "hostname": node_state['hostname'],
        "ollama": {
            "available": node_state['ollama']['available'],
            "busy": node_state['ollama']['current_job'] is not None,
            "models_count": len(node_state['ollama']['models']),
            "avg_response_ms": round(agent_stats["ollama"]["avg_response_time_ms"], 0),
            "success_rate": round(agent_stats["ollama"]["success_rate"], 1),
            "rpm": agent_stats["ollama"]["requests_per_minute"]
        },
        "comfyui": {
            "available": node_state['comfyui']['available'],
            "busy": node_state['comfyui']['current_job'] is not None,
            "workflows_ready": len([
                w for w in WORKFLOW_REGISTRY
                if check_workflow_model_availability(w).get("all_available", False)
            ]),
            "avg_response_ms": round(agent_stats["comfyui"]["avg_response_time_ms"], 0),
            "success_rate": round(agent_stats["comfyui"]["success_rate"], 1),
            "rpm": agent_stats["comfyui"]["requests_per_minute"]
        },
        "resources": {
            "cpu_percent": hardware.get('cpu', {}).get('usage_percent', 0),
            "ram_percent": hardware.get('memory', {}).get('usage_percent', 0),
            "gpu_percent": gpu_info[0].get('utilization_gpu_percent', 0) if gpu_info else None,
            "vram_percent": gpu_info[0].get('memory_usage_percent', 0) if gpu_info else None
        },
        "timestamp": datetime.now().isoformat()
    })


# =============================================================================
# PROXY ENDPOINTS - Route all traffic through agent for accurate logging
# =============================================================================

@app.route('/proxy/ollama/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE'])
def proxy_ollama(path):
    """
    Proxy requests to Ollama through the agent for accurate logging.
    Use: http://agent:8765/proxy/ollama/api/generate instead of http://localhost:11434/api/generate
    """
    ollama_url = f"http://localhost:{node_state['ollama']['port']}/{path}"
    endpoint = f"/{path}"

    try:
        start_time = datetime.now()

        # Get request data
        if request.method in ['POST', 'PUT']:
            req_data = request.get_json(silent=True) or {}
            log_ollama_request(endpoint, req_data)

            # Start job tracking if this is a generation request
            if 'generate' in path or 'chat' in path:
                node_state['ollama']['current_job'] = {
                    "type": "generation" if 'generate' in path else "chat",
                    "model": req_data.get('model', 'unknown'),
                    "started_at": start_time.isoformat(),
                    "prompt_preview": str(req_data.get('prompt', req_data.get('messages', '')))[:100]
                }

            response = requests.request(
                method=request.method,
                url=ollama_url,
                json=req_data,
                headers={k: v for k, v in request.headers if k.lower() != 'host'},
                stream=req_data.get('stream', False),
                timeout=300  # 5 minute timeout for generation
            )
        else:
            log_ollama_request(endpoint, None)
            response = requests.request(
                method=request.method,
                url=ollama_url,
                headers={k: v for k, v in request.headers if k.lower() != 'host'},
                timeout=30
            )

        # Handle streaming responses
        if response.headers.get('Transfer-Encoding') == 'chunked' or 'stream' in path:
            def generate():
                full_response = []
                tokens = 0
                for chunk in response.iter_content(chunk_size=None):
                    if chunk:
                        chunk_str = chunk.decode('utf-8', errors='ignore')
                        full_response.append(chunk_str)
                        # Count tokens from streaming response
                        try:
                            chunk_data = json.loads(chunk_str)
                            if 'response' in chunk_data:
                                tokens += len(chunk_data['response'].split())
                        except:
                            pass
                        yield chunk

                # Calculate duration and log
                duration_ms = (datetime.now() - start_time).total_seconds() * 1000
                log_ollama_response(endpoint, start_time, ''.join(full_response)[:1000], status_code=response.status_code)

                # Update stats
                update_stats("ollama", duration_ms, True, tokens=tokens)

                # Complete job tracking
                if node_state['ollama']['current_job']:
                    node_state['ollama']['current_job'] = None
                    node_state['ollama']['jobs_completed'] += 1

            return app.response_class(generate(), mimetype=response.headers.get('Content-Type', 'application/json'))

        # Non-streaming response
        resp_data = response.json() if response.headers.get('Content-Type', '').startswith('application/json') else response.text
        duration_ms = (datetime.now() - start_time).total_seconds() * 1000
        log_ollama_response(endpoint, start_time, resp_data, status_code=response.status_code)

        # Update stats
        tokens = 0
        if isinstance(resp_data, dict) and 'response' in resp_data:
            tokens = len(resp_data['response'].split())
        update_stats("ollama", duration_ms, True, tokens=tokens)

        # Complete job tracking
        if node_state['ollama']['current_job'] and ('generate' in path or 'chat' in path):
            node_state['ollama']['current_job'] = None
            node_state['ollama']['jobs_completed'] += 1

        return jsonify(resp_data) if isinstance(resp_data, dict) else app.response_class(resp_data, mimetype='text/plain')

    except Exception as e:
        error_msg = str(e)
        duration_ms = (datetime.now() - start_time).total_seconds() * 1000 if 'start_time' in dir() else 0
        log_ollama_response(endpoint, start_time if 'start_time' in dir() else datetime.now(), error=error_msg)

        # Update stats with failure
        update_stats("ollama", duration_ms, False, error=error_msg)

        # Mark job as failed
        if node_state['ollama']['current_job']:
            node_state['ollama']['current_job'] = None

        return jsonify({"error": error_msg}), 500


@app.route('/proxy/comfyui/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE'])
def proxy_comfyui(path):
    """
    Proxy requests to ComfyUI through the agent for accurate logging.
    Use: http://agent:8765/proxy/comfyui/prompt instead of http://localhost:8000/prompt
    """
    comfyui_url = f"http://localhost:{node_state['comfyui']['port']}/{path}"
    endpoint = f"/{path}"

    try:
        start_time = datetime.now()

        # Get request data
        if request.method in ['POST', 'PUT']:
            req_data = request.get_json(silent=True) or {}
            log_comfyui_request(endpoint, req_data)

            # Start job tracking if this is a prompt submission
            if path == 'prompt':
                workflow_nodes = req_data.get('prompt', {})
                node_state['comfyui']['current_job'] = {
                    "type": "render",
                    "workflow_nodes": len(workflow_nodes),
                    "started_at": start_time.isoformat(),
                    "client_id": req_data.get('client_id', 'unknown')
                }

            response = requests.request(
                method=request.method,
                url=comfyui_url,
                json=req_data,
                headers={k: v for k, v in request.headers if k.lower() != 'host'},
                timeout=30
            )
        else:
            log_comfyui_request(endpoint, {"method": request.method})
            response = requests.request(
                method=request.method,
                url=comfyui_url,
                headers={k: v for k, v in request.headers if k.lower() != 'host'},
                timeout=30
            )

        duration_ms = (datetime.now() - start_time).total_seconds() * 1000

        # Check content type from ComfyUI response
        content_type = response.headers.get('Content-Type', '')

        # For binary content (images, videos), return raw content with proper MIME type
        if content_type.startswith(('image/', 'video/', 'audio/', 'application/octet-stream')):
            log_comfyui_response(endpoint, start_time, {"binary_content": True, "content_type": content_type, "size": len(response.content)}, status_code=response.status_code)
            update_stats("comfyui", duration_ms, response.ok)
            return app.response_class(
                response.content,
                mimetype=content_type,
                headers={
                    'Content-Disposition': response.headers.get('Content-Disposition', ''),
                    'Content-Length': response.headers.get('Content-Length', str(len(response.content)))
                }
            )

        # Parse JSON response
        try:
            resp_data = response.json()
        except:
            resp_data = response.text

        log_comfyui_response(endpoint, start_time, resp_data, status_code=response.status_code)

        # Update stats
        update_stats("comfyui", duration_ms, response.ok)

        # Track prompt_id for job completion
        if path == 'prompt' and isinstance(resp_data, dict) and 'prompt_id' in resp_data:
            if node_state['comfyui']['current_job']:
                node_state['comfyui']['current_job']['prompt_id'] = resp_data['prompt_id']

        return jsonify(resp_data) if isinstance(resp_data, dict) else app.response_class(resp_data, mimetype=content_type or 'text/plain')

    except Exception as e:
        error_msg = str(e)
        duration_ms = (datetime.now() - start_time).total_seconds() * 1000 if 'start_time' in dir() else 0
        log_comfyui_response(endpoint, start_time if 'start_time' in dir() else datetime.now(), error=error_msg)

        # Update stats with failure
        update_stats("comfyui", duration_ms, False, error=error_msg)

        # Mark job as failed
        if node_state['comfyui']['current_job']:
            node_state['comfyui']['current_job'] = None

        return jsonify({"error": error_msg}), 500


@app.route('/proxy/comfyui/ws', methods=['GET'])
def proxy_comfyui_ws_info():
    """
    Info about WebSocket proxy.
    Note: Flask doesn't support WebSocket natively - would need flask-socketio or similar.
    For now, provide info about connecting directly to ComfyUI WebSocket.
    """
    return jsonify({
        "message": "WebSocket connections should go directly to ComfyUI",
        "websocket_url": f"ws://localhost:{node_state['comfyui']['port']}/ws",
        "note": "The agent logs REST API calls. For WebSocket events, monitor ComfyUI directly or use the /api/comfyui/status endpoint."
    })


@app.route('/api/comfyui/queue/complete', methods=['POST'])
def api_comfyui_job_complete():
    """Called when a ComfyUI job completes (can be triggered by WebSocket listener)"""
    data = request.json or {}
    prompt_id = data.get('prompt_id')

    if node_state['comfyui']['current_job']:
        job = node_state['comfyui']['current_job']
        job['completed_at'] = datetime.now().isoformat()
        job['status'] = data.get('status', 'completed')
        job['output'] = data.get('output')

        # Add to history
        node_state['jobs_history'].insert(0, {**job, 'service': 'comfyui'})
        node_state['jobs_history'] = node_state['jobs_history'][:50]

        node_state['comfyui']['jobs_completed'] += 1
        node_state['comfyui']['current_job'] = None

        # Log the completion
        add_log_entry('comfyui', 'receive', '/execution_complete', None,
                      {"prompt_id": prompt_id, "status": data.get('status')})

    return jsonify({"status": "ok"})


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
    parser.add_argument('--no-update', action='store_true', help='Skip auto-update check on startup')
    args = parser.parse_args()

    # Auto-update check (only if server is specified and --no-update not set)
    if args.server and not args.no_update:
        print(f"\n[Agent v{AGENT_VERSION}] Checking for updates...")
        if perform_auto_update(args.server):
            # Update was applied, restart the agent
            restart_agent()
            return  # This won't be reached due to exec
    elif args.no_update:
        print(f"\n[Agent v{AGENT_VERSION}] Auto-update skipped (--no-update flag)")
    else:
        print(f"\n[Agent v{AGENT_VERSION}] No server configured, skipping update check")

    # Initialize node state
    node_state['node_id'] = generate_node_id()
    node_state['ip_addresses'] = get_local_ips()
    node_state['agent_port'] = args.port
    node_state['ollama']['port'] = args.ollama_port
    node_state['comfyui']['port'] = args.comfyui_port
    node_state['central_server'] = args.server

    # Load model configuration from file
    load_config()

    # Initialize stats tracking timestamp
    agent_stats["started_at"] = datetime.now().isoformat()

    # Initial service check
    update_services()
    update_system_stats()

    # Get hardware info for startup display
    hardware = node_state.get('hardware', {})
    cpu_info = hardware.get('cpu', {})
    mem_info = hardware.get('memory', {})
    gpu_info = hardware.get('gpu', [])

    # Use ASCII-safe banner to avoid Windows encoding issues
    ollama_status = "Online" if node_state['ollama']['available'] else "Offline"
    comfyui_status = "Online" if node_state['comfyui']['available'] else "Offline"
    ips_str = ', '.join(node_state['ip_addresses'])

    print("")
    print("=" * 65)
    print(f"         Story Generator Node Agent v{AGENT_VERSION}")
    print("=" * 65)
    print(f"  Node ID:    {node_state['node_id'][:32]}...")
    print(f"  Hostname:   {node_state['hostname']}")
    print(f"  IPs:        {ips_str}")
    print(f"  Agent Port: {args.port}")
    print("-" * 65)
    print("  Hardware:")
    print(f"    CPU:      {cpu_info.get('model', 'Unknown')[:40]}")
    print(f"              {cpu_info.get('logical_cores', '?')} cores @ {cpu_info.get('max_freq_mhz', '?')} MHz")
    print(f"    RAM:      {mem_info.get('total_gb', '?')} GB total, {mem_info.get('available_gb', '?')} GB available")
    if gpu_info:
        for i, gpu in enumerate(gpu_info):
            print(f"    GPU {i}:    {gpu.get('name', 'Unknown')}")
            print(f"              {gpu.get('memory_total_mb', '?')} MB VRAM, {gpu.get('memory_free_mb', '?')} MB free")
    else:
        print("    GPU:      None detected")
    print("-" * 65)
    print("  Services:")
    print(f"    Ollama:   {ollama_status} (port {args.ollama_port})")
    if node_state['ollama']['available']:
        print(f"              Models: {len(node_state['ollama']['models'])}")
    print(f"    ComfyUI:  {comfyui_status} (port {args.comfyui_port})")
    print("-" * 65)
    print(f"  Dashboard:    http://localhost:{args.port}")
    print(f"  API Status:   http://localhost:{args.port}/api/status")
    print(f"  Capabilities: http://localhost:{args.port}/api/capabilities")
    print(f"  Load Balance: http://localhost:{args.port}/api/load-balance-info")
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
