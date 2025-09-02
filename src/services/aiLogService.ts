interface AILogEntry {
  timestamp: Date;
  type: 'request' | 'response' | 'error' | 'info';
  step: string;
  model?: string;
  node?: string;
  prompt?: string;
  response?: string;
  error?: string;
  metadata?: Record<string, any>;
}

class AILogService {
  private logs: Map<string, AILogEntry[]> = new Map();
  private maxLogsPerStory = 100;

  addLog(storyId: string, entry: Omit<AILogEntry, 'timestamp'>) {
    if (!this.logs.has(storyId)) {
      this.logs.set(storyId, []);
    }

    const logs = this.logs.get(storyId)!;
    const newEntry: AILogEntry = {
      ...entry,
      timestamp: new Date()
    };

    logs.push(newEntry);

    // Keep only last N logs per story
    if (logs.length > this.maxLogsPerStory) {
      logs.shift();
    }

    // Emit event for UI updates
    window.dispatchEvent(new CustomEvent('ai-log-update', {
      detail: { storyId, entry: newEntry }
    }));

    // Also log to console for debugging
    this.consoleLog(newEntry);
  }

  private consoleLog(entry: AILogEntry) {
    const prefix = `[${entry.step}] ${entry.type.toUpperCase()}:`;
    
    switch (entry.type) {
      case 'error':
        console.error(prefix, entry.error, entry.metadata);
        break;
      case 'response':
        console.log(prefix, `Response length: ${entry.response?.length || 0} chars`, entry.metadata);
        break;
      case 'request':
        console.log(prefix, `Prompt: ${entry.prompt?.slice(0, 100)}...`, entry.metadata);
        break;
      default:
        console.log(prefix, entry.metadata);
    }
  }

  getLogs(storyId: string): AILogEntry[] {
    return this.logs.get(storyId) || [];
  }

  clearLogs(storyId: string) {
    this.logs.delete(storyId);
  }

  exportLogs(storyId: string): string {
    const logs = this.getLogs(storyId);
    return JSON.stringify(logs, null, 2);
  }

  // Get formatted logs for display
  getFormattedLogs(storyId: string): string[] {
    const logs = this.getLogs(storyId);
    return logs.map(log => {
      const time = log.timestamp.toLocaleTimeString();
      const typeIcon = {
        request: '📤',
        response: '📥',
        error: '❌',
        info: 'ℹ️'
      }[log.type];

      let message = `${time} ${typeIcon} [${log.step}]`;
      
      if (log.model) message += ` Model: ${log.model}`;
      if (log.node) message += ` Node: ${log.node}`;
      if (log.error) message += ` Error: ${log.error}`;
      if (log.response) message += ` Response: ${log.response.length} chars`;
      
      return message;
    });
  }
}

export const aiLogService = new AILogService();
export type { AILogEntry };