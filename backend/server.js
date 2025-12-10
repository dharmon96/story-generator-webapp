const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 8001; // Changed from 8000 to avoid conflict with ComfyUI default port

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Database path
const DB_PATH = path.join(__dirname, '..', 'film_generator.db');

// Initialize SQLite database
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('❌ Failed to connect to SQLite database:', err);
        reject(err);
        return;
      }
      console.log('✅ Connected to SQLite database');
    });

    // Create tables if they don't exist
    db.serialize(() => {
      // Stories table
      db.run(`CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        characters TEXT,
        shots TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Queue table
      db.run(`CREATE TABLE IF NOT EXISTS story_queue (
        id TEXT PRIMARY KEY,
        config TEXT NOT NULL,
        priority INTEGER DEFAULT 5,
        status TEXT DEFAULT 'queued',
        progress INTEGER DEFAULT 0,
        error TEXT,
        result TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Generation logs table
      db.run(`CREATE TABLE IF NOT EXISTS generation_logs (
        id TEXT PRIMARY KEY,
        story_id TEXT,
        step TEXT NOT NULL,
        result TEXT,
        metadata TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Create indexes for better query performance
      db.run(`CREATE INDEX IF NOT EXISTS idx_queue_priority ON story_queue(priority DESC, created_at ASC)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_queue_status ON story_queue(status)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_logs_story_id ON generation_logs(story_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_stories_created ON stories(created_at DESC)`);

      console.log('✅ Database tables initialized');
      console.log('✅ Database indexes created');
      resolve(db);
    });
  });
}

// Global database connection
let db;

// Helper functions for database operations
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    message: 'Story Generator API is running' 
  });
});

// Stories API
app.get('/api/stories', async (req, res) => {
  try {
    const stories = await dbAll('SELECT * FROM stories ORDER BY created_at DESC');
    
    // Parse JSON fields
    const parsedStories = stories.map(story => ({
      ...story,
      characters: story.characters ? JSON.parse(story.characters) : [],
      shots: story.shots ? JSON.parse(story.shots) : [],
      metadata: story.metadata ? JSON.parse(story.metadata) : {},
      createdAt: story.created_at,
      updatedAt: story.updated_at
    }));
    
    res.json(parsedStories);
  } catch (error) {
    console.error('Error fetching stories:', error);
    res.status(500).json({ error: 'Failed to fetch stories' });
  }
});

app.post('/api/stories', async (req, res) => {
  try {
    const newStory = {
      id: uuidv4(),
      title: req.body.title,
      content: req.body.content || '',
      characters: JSON.stringify(req.body.characters || []),
      shots: JSON.stringify(req.body.shots || []),
      metadata: JSON.stringify(req.body.metadata || {}),
    };
    
    await dbRun(
      `INSERT INTO stories (id, title, content, characters, shots, metadata) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newStory.id, newStory.title, newStory.content, newStory.characters, newStory.shots, newStory.metadata]
    );
    
    const createdStory = await dbGet('SELECT * FROM stories WHERE id = ?', [newStory.id]);
    const responseStory = {
      ...createdStory,
      characters: JSON.parse(createdStory.characters),
      shots: JSON.parse(createdStory.shots),
      metadata: JSON.parse(createdStory.metadata),
      createdAt: createdStory.created_at,
      updatedAt: createdStory.updated_at
    };
    
    console.log(`📖 Created story: ${responseStory.title} (${responseStory.id})`);
    res.status(201).json(responseStory);
  } catch (error) {
    console.error('Error creating story:', error);
    res.status(500).json({ error: 'Failed to create story' });
  }
});

app.get('/api/stories/:id', async (req, res) => {
  try {
    const story = await dbGet('SELECT * FROM stories WHERE id = ?', [req.params.id]);
    
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }
    
    const responseStory = {
      ...story,
      characters: JSON.parse(story.characters || '[]'),
      shots: JSON.parse(story.shots || '[]'),
      metadata: JSON.parse(story.metadata || '{}'),
      createdAt: story.created_at,
      updatedAt: story.updated_at
    };
    
    res.json(responseStory);
  } catch (error) {
    console.error('Error fetching story:', error);
    res.status(500).json({ error: 'Failed to fetch story' });
  }
});

app.put('/api/stories/:id', async (req, res) => {
  try {
    const existing = await dbGet('SELECT * FROM stories WHERE id = ?', [req.params.id]);
    
    if (!existing) {
      return res.status(404).json({ error: 'Story not found' });
    }
    
    const updates = {
      title: req.body.title !== undefined ? req.body.title : existing.title,
      content: req.body.content !== undefined ? req.body.content : existing.content,
      characters: req.body.characters !== undefined ? JSON.stringify(req.body.characters) : existing.characters,
      shots: req.body.shots !== undefined ? JSON.stringify(req.body.shots) : existing.shots,
      metadata: req.body.metadata !== undefined ? JSON.stringify(req.body.metadata) : existing.metadata,
    };
    
    await dbRun(
      `UPDATE stories SET title = ?, content = ?, characters = ?, shots = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [updates.title, updates.content, updates.characters, updates.shots, updates.metadata, req.params.id]
    );
    
    const updatedStory = await dbGet('SELECT * FROM stories WHERE id = ?', [req.params.id]);
    const responseStory = {
      ...updatedStory,
      characters: JSON.parse(updatedStory.characters),
      shots: JSON.parse(updatedStory.shots),
      metadata: JSON.parse(updatedStory.metadata),
      createdAt: updatedStory.created_at,
      updatedAt: updatedStory.updated_at
    };
    
    console.log(`📝 Updated story: ${responseStory.title} (${responseStory.id})`);
    res.json(responseStory);
  } catch (error) {
    console.error('Error updating story:', error);
    res.status(500).json({ error: 'Failed to update story' });
  }
});

app.delete('/api/stories/:id', async (req, res) => {
  try {
    const story = await dbGet('SELECT * FROM stories WHERE id = ?', [req.params.id]);
    
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }
    
    await dbRun('DELETE FROM stories WHERE id = ?', [req.params.id]);
    console.log(`🗑️ Deleted story: ${story.title} (${story.id})`);
    res.json({ message: 'Story deleted successfully' });
  } catch (error) {
    console.error('Error deleting story:', error);
    res.status(500).json({ error: 'Failed to delete story' });
  }
});

// Queue API
app.get('/api/queue', async (req, res) => {
  try {
    const queue = await dbAll('SELECT * FROM story_queue ORDER BY priority DESC, created_at ASC');
    
    // Parse JSON fields
    const parsedQueue = queue.map(item => ({
      ...item,
      config: JSON.parse(item.config),
      error: item.error ? JSON.parse(item.error) : null,
      result: item.result ? JSON.parse(item.result) : null,
      createdAt: item.created_at,
      updatedAt: item.updated_at
    }));
    
    res.json(parsedQueue);
  } catch (error) {
    console.error('Error fetching queue:', error);
    res.status(500).json({ error: 'Failed to fetch queue' });
  }
});

app.post('/api/queue', async (req, res) => {
  try {
    const newItem = {
      id: uuidv4(),
      config: JSON.stringify(req.body.config || {}),
      priority: req.body.priority || 5,
      status: 'queued',
      progress: 0,
      error: null,
      result: null
    };
    
    await dbRun(
      `INSERT INTO story_queue (id, config, priority, status, progress, error, result) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newItem.id, newItem.config, newItem.priority, newItem.status, newItem.progress, newItem.error, newItem.result]
    );
    
    const createdItem = await dbGet('SELECT * FROM story_queue WHERE id = ?', [newItem.id]);
    const responseItem = {
      ...createdItem,
      config: JSON.parse(createdItem.config),
      createdAt: createdItem.created_at,
      updatedAt: createdItem.updated_at
    };
    
    console.log(`📋 Added to queue: ${responseItem.config?.prompt?.slice(0, 50)}... (Priority: ${responseItem.priority})`);
    res.status(201).json(responseItem);
  } catch (error) {
    console.error('Queue add error:', error);
    res.status(500).json({ error: 'Failed to add to queue' });
  }
});

app.put('/api/queue/:id', async (req, res) => {
  try {
    const existing = await dbGet('SELECT * FROM story_queue WHERE id = ?', [req.params.id]);
    
    if (!existing) {
      return res.status(404).json({ error: 'Queue item not found' });
    }
    
    const updates = {
      config: req.body.config !== undefined ? JSON.stringify(req.body.config) : existing.config,
      priority: req.body.priority !== undefined ? req.body.priority : existing.priority,
      status: req.body.status !== undefined ? req.body.status : existing.status,
      progress: req.body.progress !== undefined ? req.body.progress : existing.progress,
      error: req.body.error !== undefined ? JSON.stringify(req.body.error) : existing.error,
      result: req.body.result !== undefined ? JSON.stringify(req.body.result) : existing.result
    };
    
    await dbRun(
      `UPDATE story_queue SET config = ?, priority = ?, status = ?, progress = ?, error = ?, result = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [updates.config, updates.priority, updates.status, updates.progress, updates.error, updates.result, req.params.id]
    );
    
    const updatedItem = await dbGet('SELECT * FROM story_queue WHERE id = ?', [req.params.id]);
    const responseItem = {
      ...updatedItem,
      config: JSON.parse(updatedItem.config),
      error: updatedItem.error ? JSON.parse(updatedItem.error) : null,
      result: updatedItem.result ? JSON.parse(updatedItem.result) : null,
      createdAt: updatedItem.created_at,
      updatedAt: updatedItem.updated_at
    };
    
    res.json(responseItem);
  } catch (error) {
    console.error('Error updating queue item:', error);
    res.status(500).json({ error: 'Failed to update queue item' });
  }
});

app.delete('/api/queue/:id', async (req, res) => {
  try {
    const item = await dbGet('SELECT * FROM story_queue WHERE id = ?', [req.params.id]);
    
    if (!item) {
      return res.status(404).json({ error: 'Queue item not found' });
    }
    
    await dbRun('DELETE FROM story_queue WHERE id = ?', [req.params.id]);
    console.log(`🗑️ Removed from queue: ${item.id}`);
    res.json({ message: 'Queue item removed successfully' });
  } catch (error) {
    console.error('Error removing queue item:', error);
    res.status(500).json({ error: 'Failed to remove queue item' });
  }
});

// Bulk queue operations
app.delete('/api/queue', async (req, res) => {
  try {
    const { status } = req.query;
    
    let deleteQuery;
    let countQuery = 'SELECT COUNT(*) as count FROM story_queue';
    
    if (status === 'completed') {
      deleteQuery = 'DELETE FROM story_queue WHERE status = "completed"';
      countQuery = 'SELECT COUNT(*) as count FROM story_queue WHERE status = "completed"';
    } else {
      deleteQuery = 'DELETE FROM story_queue';
    }
    
    const beforeCount = await dbGet(countQuery);
    await dbRun(deleteQuery);
    
    if (status === 'completed') {
      console.log('🧹 Cleared completed queue items');
    } else {
      console.log('🧹 Cleared entire queue');
    }
    
    res.json({ 
      message: `Queue cleared (${status || 'all'})`, 
      removed: beforeCount.count 
    });
  } catch (error) {
    console.error('Error clearing queue:', error);
    res.status(500).json({ error: 'Failed to clear queue' });
  }
});

// Generation logs API (for AI processing tracking)
app.post('/api/generations', async (req, res) => {
  try {
    const newGeneration = {
      id: uuidv4(),
      story_id: req.body.storyId,
      step: req.body.step,
      result: JSON.stringify(req.body.result || {}),
      metadata: JSON.stringify(req.body.metadata || {})
    };
    
    await dbRun(
      `INSERT INTO generation_logs (id, story_id, step, result, metadata) 
       VALUES (?, ?, ?, ?, ?)`,
      [newGeneration.id, newGeneration.story_id, newGeneration.step, newGeneration.result, newGeneration.metadata]
    );
    
    const createdLog = await dbGet('SELECT * FROM generation_logs WHERE id = ?', [newGeneration.id]);
    const responseLog = {
      ...createdLog,
      storyId: createdLog.story_id,
      result: JSON.parse(createdLog.result),
      metadata: JSON.parse(createdLog.metadata)
    };
    
    res.status(201).json(responseLog);
  } catch (error) {
    console.error('Error saving generation log:', error);
    res.status(500).json({ error: 'Failed to save generation log' });
  }
});

app.get('/api/generations/:storyId', async (req, res) => {
  try {
    const logs = await dbAll('SELECT * FROM generation_logs WHERE story_id = ? ORDER BY timestamp ASC', [req.params.storyId]);
    
    const parsedLogs = logs.map(log => ({
      ...log,
      storyId: log.story_id,
      result: JSON.parse(log.result || '{}'),
      metadata: JSON.parse(log.metadata || '{}')
    }));
    
    res.json(parsedLogs);
  } catch (error) {
    console.error('Error fetching generation logs:', error);
    res.status(500).json({ error: 'Failed to fetch generation logs' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============== NODE DISCOVERY PROXY ENDPOINTS ==============
// These endpoints allow the frontend to discover Ollama/ComfyUI nodes
// without CORS restrictions (server-side requests have no CORS)

const http = require('http');

/**
 * Helper to make HTTP request with timeout (no CORS issues server-side)
 */
function proxyFetch(url, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      timeout: timeout,
      headers: {
        'Accept': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve({ ok: true, status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ ok: true, status: res.statusCode, data: data });
          }
        } else {
          resolve({ ok: false, status: res.statusCode, error: `HTTP ${res.statusCode}` });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    });

    req.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });

    req.end();
  });
}

/**
 * Check if Ollama is running on a host:port
 */
async function checkOllama(host, port) {
  try {
    const result = await proxyFetch(`http://${host}:${port}/api/tags`, 2000);
    if (result.ok && result.data?.models) {
      return {
        online: true,
        models: result.data.models.map(m => m.name),
        type: 'ollama'
      };
    }
  } catch (e) {
    // Silent fail
  }
  return { online: false };
}

/**
 * Check if ComfyUI is running on a host:port
 * Tries multiple endpoints since ComfyUI API varies by version
 */
async function checkComfyUI(host, port) {
  const endpoints = [
    '/system_stats',
    '/api/system_stats',
    '/object_info',
    '/api/object_info',
    '/queue',
    '/api/queue'
  ];

  for (const endpoint of endpoints) {
    try {
      const result = await proxyFetch(`http://${host}:${port}${endpoint}`, 3000);
      if (result.ok) {
        // Found ComfyUI - try to get models from object_info
        let models = [];
        let comfyUIData = null;

        // Get models/checkpoints if we haven't already
        if (!endpoint.includes('object_info')) {
          const objInfo = await proxyFetch(`http://${host}:${port}/object_info`, 5000);
          if (objInfo.ok && objInfo.data) {
            const parsed = parseComfyUIObjectInfo(objInfo.data);
            models = parsed.models;
            comfyUIData = parsed.comfyUIData;
          }
        } else if (result.data) {
          const parsed = parseComfyUIObjectInfo(result.data);
          models = parsed.models;
          comfyUIData = parsed.comfyUIData;
        }

        return {
          online: true,
          models,
          comfyUIData,
          type: 'comfyui',
          endpoint: endpoint
        };
      }
    } catch (e) {
      // Continue to next endpoint
    }
  }
  return { online: false };
}

/**
 * Parse ComfyUI object_info response to extract models
 */
function parseComfyUIObjectInfo(objectInfo) {
  const comfyUIData = {
    checkpoints: [],
    vaes: [],
    loras: [],
    clipModels: [],
    unets: [],
    customNodes: Object.keys(objectInfo || {}),
    embeddings: []
  };
  const models = [];

  if (!objectInfo) return { models, comfyUIData };

  // Extract checkpoints
  if (objectInfo.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0]) {
    comfyUIData.checkpoints = objectInfo.CheckpointLoaderSimple.input.required.ckpt_name[0];
    models.push(...comfyUIData.checkpoints.map(m => `[Checkpoint] ${m}`));
  }

  // Extract VAEs
  if (objectInfo.VAELoader?.input?.required?.vae_name?.[0]) {
    comfyUIData.vaes = objectInfo.VAELoader.input.required.vae_name[0];
  }

  // Extract LoRAs
  if (objectInfo.LoraLoader?.input?.required?.lora_name?.[0]) {
    comfyUIData.loras = objectInfo.LoraLoader.input.required.lora_name[0];
  }

  // Extract UNETs
  if (objectInfo.UNETLoader?.input?.required?.unet_name?.[0]) {
    comfyUIData.unets = objectInfo.UNETLoader.input.required.unet_name[0];
  }

  // Look for video generation models (Wan, HoloCine, etc.)
  const videoLoaders = ['DownloadAndLoadWanVideo2Model', 'WanVideoModelLoader', 'LoadWanVideoModel'];
  for (const loader of videoLoaders) {
    if (objectInfo[loader]?.input?.required?.model?.[0]) {
      const videoModels = objectInfo[loader].input.required.model[0];
      comfyUIData.unets.push(...videoModels);
      models.push(...videoModels.map(m => `[Video Model] ${m}`));
    }
  }

  // Check for video generation nodes
  const videoNodes = [
    'WanVideoWrapper', 'WanVideoSampler', 'WanVideoVAEDecode',
    'HoloCineLoader', 'HoloCineSceneLoader',
    'CogVideoXLoader', 'CogVideoXSampler'
  ];
  for (const nodeName of videoNodes) {
    if (objectInfo[nodeName]) {
      models.push(`[Video Node] ${nodeName}`);
    }
  }

  return { models, comfyUIData };
}

/**
 * POST /api/proxy/check-node
 * Check a single node for Ollama or ComfyUI
 */
app.post('/api/proxy/check-node', async (req, res) => {
  const { host, port, type } = req.body;

  if (!host || !port) {
    return res.status(400).json({ error: 'host and port are required' });
  }

  console.log(`🔍 Proxy checking ${type || 'auto'} at ${host}:${port}...`);

  try {
    if (type === 'ollama') {
      const result = await checkOllama(host, port);
      return res.json(result);
    } else if (type === 'comfyui') {
      const result = await checkComfyUI(host, port);
      return res.json(result);
    } else {
      // Auto-detect: try both
      const [ollamaResult, comfyResult] = await Promise.all([
        checkOllama(host, port),
        checkComfyUI(host, port)
      ]);

      if (ollamaResult.online) {
        return res.json(ollamaResult);
      } else if (comfyResult.online) {
        return res.json(comfyResult);
      } else {
        return res.json({ online: false });
      }
    }
  } catch (error) {
    console.error(`Error checking node ${host}:${port}:`, error);
    res.json({ online: false, error: error.message });
  }
});

/**
 * POST /api/proxy/scan-host
 * Scan a single host for both Ollama and ComfyUI
 */
app.post('/api/proxy/scan-host', async (req, res) => {
  const { host, ollamaPort = 11434, comfyuiPorts = [8188, 8080, 7860] } = req.body; // ComfyUI default is 8188

  if (!host) {
    return res.status(400).json({ error: 'host is required' });
  }

  console.log(`🔍 Scanning host ${host} for Ollama (${ollamaPort}) and ComfyUI (${comfyuiPorts.join(',')})...`);

  try {
    // Check Ollama
    const ollamaResult = await checkOllama(host, ollamaPort);

    // Check ComfyUI on multiple ports
    let comfyResult = { online: false };
    let comfyPort = null;
    for (const port of comfyuiPorts) {
      const result = await checkComfyUI(host, port);
      if (result.online) {
        comfyResult = result;
        comfyPort = port;
        break;
      }
    }

    res.json({
      host,
      ollama: {
        online: ollamaResult.online,
        port: ollamaPort,
        models: ollamaResult.models || []
      },
      comfyui: {
        online: comfyResult.online,
        port: comfyPort,
        models: comfyResult.models || [],
        comfyUIData: comfyResult.comfyUIData || null
      }
    });
  } catch (error) {
    console.error(`Error scanning host ${host}:`, error);
    res.json({ host, error: error.message, ollama: { online: false }, comfyui: { online: false } });
  }
});

/**
 * POST /api/proxy/scan-network
 * Batch scan multiple hosts in parallel (much faster than browser)
 */
app.post('/api/proxy/scan-network', async (req, res) => {
  const {
    hosts = [],
    ranges = [],
    ollamaPort = 11434,
    comfyuiPorts = [8188, 8080, 7860], // ComfyUI default is 8188
    concurrency = 30 // Increased for faster scanning
  } = req.body;

  console.log(`🔍 Network scan: ${hosts.length} hosts, ${ranges.length} ranges, concurrency ${concurrency}`);

  // Build list of all hosts to scan
  const allHosts = [...hosts];

  // Expand IP ranges
  for (const range of ranges) {
    // e.g., "192.168.1." -> 192.168.1.1 to 192.168.1.254
    for (let i = 1; i <= 254; i++) {
      allHosts.push(`${range}${i}`);
    }
  }

  console.log(`🔍 Scanning ${allHosts.length} total hosts...`);

  const results = [];

  // Process in batches for controlled concurrency
  // Scan for BOTH Ollama AND ComfyUI (standalone ComfyUI instances are common)
  for (let i = 0; i < allHosts.length; i += concurrency) {
    const batch = allHosts.slice(i, i + concurrency);
    const batchPromises = batch.map(async (host) => {
      // Check Ollama first (fast check)
      const ollamaResult = await checkOllama(host, ollamaPort);

      // Check ComfyUI on all ports (even if no Ollama - standalone ComfyUI is common)
      let comfyResult = { online: false };
      let comfyPort = null;
      for (const port of comfyuiPorts) {
        const result = await checkComfyUI(host, port);
        if (result.online) {
          comfyResult = result;
          comfyPort = port;
          break;
        }
      }

      // Return if either Ollama OR ComfyUI is found
      if (ollamaResult.online || comfyResult.online) {
        return {
          host,
          ollama: { online: ollamaResult.online, port: ollamaPort, models: ollamaResult.models || [] },
          comfyui: { online: comfyResult.online, port: comfyPort, models: comfyResult.models || [], comfyUIData: comfyResult.comfyUIData }
        };
      }
      return null; // Neither found
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter(r => r !== null));

    // Log progress
    const progress = Math.min(100, Math.round(((i + concurrency) / allHosts.length) * 100));
    console.log(`🔍 Scan progress: ${progress}% (${results.length} found)`);
  }

  console.log(`✅ Network scan complete: found ${results.length} nodes`);
  res.json({ nodes: results, scanned: allHosts.length });
});

/**
 * POST /api/proxy/fetch
 * Generic proxy fetch for any URL (used for ComfyUI object_info, etc.)
 */
app.post('/api/proxy/fetch', async (req, res) => {
  const { url, timeout = 5000 } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'url is required' });
  }

  try {
    const result = await proxyFetch(url, timeout);
    res.json(result);
  } catch (error) {
    res.json({ ok: false, error: error.message });
  }
});

// ============================================
// NODE AGENT REGISTRY
// Tracks nodes that have registered via heartbeat
// ============================================

// In-memory registry of active nodes (cleared on server restart)
const nodeRegistry = new Map();
const NODE_TIMEOUT = 90000; // 90 seconds - consider node offline if no heartbeat

/**
 * POST /api/nodes/heartbeat
 * Receive heartbeat from a node agent
 */
app.post('/api/nodes/heartbeat', (req, res) => {
  const {
    node_id,
    hostname,
    ip_addresses,
    agent_port,
    ollama,
    comfyui,
    system,
    timestamp
  } = req.body;

  if (!node_id) {
    return res.status(400).json({ error: 'node_id is required' });
  }

  const nodeData = {
    node_id,
    hostname,
    ip_addresses: ip_addresses || [],
    agent_port: agent_port || 8765,
    ollama: ollama || { available: false },
    comfyui: comfyui || { available: false },
    system: system || {},
    last_heartbeat: new Date().toISOString(),
    received_timestamp: timestamp
  };

  nodeRegistry.set(node_id, nodeData);
  console.log(`💓 Heartbeat from ${hostname} (${node_id.slice(0, 8)}...) - Ollama: ${ollama?.available ? '✅' : '❌'}, ComfyUI: ${comfyui?.available ? '✅' : '❌'}`);

  res.json({ status: 'ok', registered: true });
});

/**
 * GET /api/nodes
 * Get all registered nodes (filters out stale nodes)
 */
app.get('/api/nodes', (req, res) => {
  const now = Date.now();
  const activeNodes = [];

  for (const [nodeId, node] of nodeRegistry) {
    const lastHeartbeat = new Date(node.last_heartbeat).getTime();
    const isStale = (now - lastHeartbeat) > NODE_TIMEOUT;

    if (isStale) {
      // Mark as offline but keep in registry
      node.status = 'offline';
    } else {
      node.status = 'online';
    }

    activeNodes.push(node);
  }

  res.json({
    nodes: activeNodes,
    total: activeNodes.length,
    online: activeNodes.filter(n => n.status === 'online').length
  });
});

/**
 * GET /api/nodes/:nodeId
 * Get a specific node by ID
 */
app.get('/api/nodes/:nodeId', (req, res) => {
  const node = nodeRegistry.get(req.params.nodeId);

  if (!node) {
    return res.status(404).json({ error: 'Node not found' });
  }

  // Check if stale
  const now = Date.now();
  const lastHeartbeat = new Date(node.last_heartbeat).getTime();
  node.status = (now - lastHeartbeat) > NODE_TIMEOUT ? 'offline' : 'online';

  res.json(node);
});

/**
 * DELETE /api/nodes/:nodeId
 * Remove a node from the registry
 */
app.delete('/api/nodes/:nodeId', (req, res) => {
  const deleted = nodeRegistry.delete(req.params.nodeId);
  res.json({ deleted });
});

/**
 * GET /api/nodes/discover
 * Get all nodes - combines registered agents + network scan results
 * This is the unified endpoint for the frontend
 */
app.get('/api/nodes/discover', async (req, res) => {
  const includeNetworkScan = req.query.scan !== 'false';

  // Get registered nodes
  const now = Date.now();
  const registeredNodes = [];

  for (const [nodeId, node] of nodeRegistry) {
    const lastHeartbeat = new Date(node.last_heartbeat).getTime();
    const isOnline = (now - lastHeartbeat) <= NODE_TIMEOUT;

    registeredNodes.push({
      source: 'agent',
      node_id: node.node_id,
      hostname: node.hostname,
      ip_addresses: node.ip_addresses,
      agent_port: node.agent_port,
      agent_url: node.ip_addresses[0] ? `http://${node.ip_addresses[0]}:${node.agent_port}` : null,
      status: isOnline ? 'online' : 'offline',
      ollama: node.ollama,
      comfyui: node.comfyui,
      system: node.system,
      last_heartbeat: node.last_heartbeat
    });
  }

  // Optionally do a quick network scan for nodes without agents
  let scannedNodes = [];
  if (includeNetworkScan) {
    // Quick scan of common hosts (not full IP range scan)
    const quickHosts = ['localhost'];

    // Add IPs from registered nodes to cross-check
    for (const node of registeredNodes) {
      for (const ip of node.ip_addresses) {
        if (!quickHosts.includes(ip)) {
          quickHosts.push(ip);
        }
      }
    }

    for (const host of quickHosts) {
      // Skip if we already have this host from agent registry
      const alreadyRegistered = registeredNodes.some(n =>
        n.ip_addresses.includes(host) || n.hostname === host
      );

      if (!alreadyRegistered || host === 'localhost') {
        const ollamaResult = await checkOllama(host, 11434);
        const comfyResult = await checkComfyUI(host, 8188);

        if (ollamaResult.online || comfyResult.online) {
          scannedNodes.push({
            source: 'scan',
            host,
            status: 'online',
            ollama: { available: ollamaResult.online, models: ollamaResult.models || [], port: 11434 },
            comfyui: { available: comfyResult.online, port: 8188 }
          });
        }
      }
    }
  }

  res.json({
    registered: registeredNodes,
    scanned: scannedNodes,
    summary: {
      total_registered: registeredNodes.length,
      online_registered: registeredNodes.filter(n => n.status === 'online').length,
      scanned_found: scannedNodes.length
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Start server
async function startServer() {
  try {
    db = await initializeDatabase();
    
    app.listen(PORT, () => {
      console.log(`🚀 Story Generator API running on http://localhost:${PORT}`);
      console.log(`📁 Data stored in SQLite: ${DB_PATH}`);
      console.log(`🔗 API endpoints:`);
      console.log(`   GET  /api/health`);
      console.log(`   GET  /api/stories`);
      console.log(`   POST /api/stories`);
      console.log(`   GET  /api/queue`);
      console.log(`   POST /api/queue`);
      console.log(`   GET  /api/generations/:storyId`);
      console.log(`   POST /api/generations`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();