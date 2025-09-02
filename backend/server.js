const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 8000;

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

      console.log('✅ Database tables initialized');
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