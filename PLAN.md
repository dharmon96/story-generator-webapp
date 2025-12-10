# Network Discovery Improvement Plan

## Current Problems

1. **CORS blocking**: Browser-based fetch requests to ComfyUI fail due to CORS restrictions
2. **Slow scanning**: Scanning 7 network ranges × 254 IPs = 1,778 sequential requests with timeouts
3. **Incomplete detection**: Network scan only finds Ollama (port 11434), not standalone ComfyUI
4. **Model fetching issues**: Even when nodes are found, getting full model lists can timeout

## Proposed Solution: Backend Proxy for Network Discovery

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React App     │────▶│  Node.js Backend │────▶│  Ollama/ComfyUI │
│   (Browser)     │     │   (No CORS)      │     │   (Network)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Key insight**: The Node.js backend runs server-side, so it's NOT subject to CORS restrictions. It can freely make HTTP requests to any Ollama or ComfyUI instance on the network.

### Implementation Steps

#### Step 1: Add Backend Proxy Endpoints

Add these new API endpoints to `backend/server.js`:

```javascript
// Proxy endpoint for checking a single node
POST /api/proxy/check-node
Body: { host: string, port: number, type: 'ollama' | 'comfyui' }
Response: { online: boolean, models?: string[], comfyUIData?: object, error?: string }

// Proxy endpoint for fetching from any URL (for ComfyUI object_info, etc.)
POST /api/proxy/fetch
Body: { url: string, timeout?: number }
Response: { ok: boolean, data?: any, error?: string }

// Batch network scan (much faster than browser)
POST /api/proxy/scan-network
Body: { ranges: string[], ports: { ollama: number, comfyui: number[] } }
Response: { nodes: OllamaNode[] }
```

#### Step 2: Update Frontend Node Discovery

Modify `nodeDiscoveryService` to:
1. First try the backend proxy (fast, no CORS)
2. Fall back to direct browser fetch for localhost only
3. Use the batch scan endpoint for full network scans

#### Step 3: Optimize Scanning Strategy

**For network scans**:
- Use backend's batch scan endpoint (runs server-side, parallel, no CORS)
- Scan Ollama port 11434 first across all IPs
- For each found Ollama, check ComfyUI on same host
- Use shorter timeouts (1-2 seconds) since backend has no browser overhead

**For manual node additions**:
- Use backend proxy to check both Ollama and ComfyUI
- Return full model list in one request

### Benefits

1. **No CORS issues**: Backend can reach any network endpoint
2. **Faster scanning**: Server-side parallel requests, no browser limits
3. **Complete model detection**: Full object_info fetch for ComfyUI
4. **Reliable**: No browser security restrictions

### Alternative: Enable CORS on ComfyUI

The user could restart ComfyUI with `--enable-cors-header`, but:
- Requires modifying ComfyUI launch config
- May not be possible with installer versions
- Each machine needs configuration

The backend proxy approach works without any changes to Ollama or ComfyUI.

## Files to Modify

1. **backend/server.js** - Add proxy endpoints
2. **src/services/nodeDiscovery.ts** - Use backend proxy for scanning
3. **src/pages/Settings.tsx** - (Optional) Add scan progress indicator

## Estimated Changes

- ~100 lines in backend/server.js
- ~50 lines modified in nodeDiscovery.ts
- No breaking changes to existing functionality
