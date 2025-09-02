export interface DebugLogEntry {
  id: string;
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error' | 'success';
  category: 'queue' | 'ui' | 'ai' | 'pipeline' | 'store' | 'network' | 'test' | 'console';
  message: string;
  details?: any;
  source?: string;
  duration?: number;
  stackTrace?: string;
}

class DebugService {
  private logs: DebugLogEntry[] = [];
  private listeners: Set<(logs: DebugLogEntry[]) => void> = new Set();
  private maxLogs: number = 1000;
  private isEnabled: boolean = true;
  private categories: Set<string> = new Set();

  constructor() {
    // Auto-enable in development
    this.isEnabled = process.env.NODE_ENV === 'development';
    
    // Only intercept console errors if explicitly enabled (disabled by default to prevent loops)
    // this.interceptConsoleErrors(); // DISABLED for now due to infinite loop potential
    
    // Listen to unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.error('unhandled', `Unhandled Promise Rejection: ${event.reason}`, {
        reason: event.reason,
        promise: event.promise
      });
    });

    // Listen to global errors
    window.addEventListener('error', (event) => {
      this.error('global', `Global Error: ${event.message}`, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error
      });
    });
  }

  private interceptConsoleErrors() {
    const originalError = console.error;
    const originalWarn = console.warn;
    
    console.error = (...args) => {
      this.error('console', args.join(' '), { args });
      originalError.apply(console, args);
    };
    
    console.warn = (...args) => {
      this.warn('console', args.join(' '), { args });
      originalWarn.apply(console, args);
    };
  }

  private addLog(entry: Omit<DebugLogEntry, 'id' | 'timestamp'>) {
    if (!this.isEnabled) return;

    const logEntry: DebugLogEntry = {
      ...entry,
      id: `debug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      stackTrace: entry.level === 'error' ? new Error().stack : undefined
    };

    this.logs.push(logEntry);
    
    // Keep only the most recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Track categories
    this.categories.add(entry.category);

    // Notify listeners
    this.listeners.forEach(listener => listener([...this.logs]));

    // Log to console only if it's not from the console interceptor to prevent infinite loops
    if (entry.category !== 'console') {
      const timestamp = logEntry.timestamp.toISOString();
      const prefix = `[${timestamp}] [${entry.category.toUpperCase()}]`;
      
      switch (entry.level) {
        case 'error':
          console.error(`${prefix} ❌ ${entry.message}`, entry.details || '');
          break;
        case 'warn':
          console.warn(`${prefix} ⚠️ ${entry.message}`, entry.details || '');
          break;
        case 'success':
          console.log(`${prefix} ✅ ${entry.message}`, entry.details || '');
          break;
        case 'info':
          console.info(`${prefix} ℹ️ ${entry.message}`, entry.details || '');
          break;
        case 'debug':
          console.debug(`${prefix} 🔍 ${entry.message}`, entry.details || '');
          break;
      }
    }
  }

  // Public logging methods
  debug(category: string, message: string, details?: any, source?: string) {
    this.addLog({ level: 'debug', category: category as any, message, details, source });
  }

  info(category: string, message: string, details?: any, source?: string) {
    this.addLog({ level: 'info', category: category as any, message, details, source });
  }

  warn(category: string, message: string, details?: any, source?: string) {
    this.addLog({ level: 'warn', category: category as any, message, details, source });
  }

  error(category: string, message: string, details?: any, source?: string) {
    this.addLog({ level: 'error', category: category as any, message, details, source });
  }

  success(category: string, message: string, details?: any, source?: string) {
    this.addLog({ level: 'success', category: category as any, message, details, source });
  }

  // UI-specific logging
  uiUpdate(component: string, message: string, details?: any) {
    this.info('ui', `[${component}] ${message}`, details, component);
  }

  uiError(component: string, message: string, error?: any) {
    this.error('ui', `[${component}] ${message}`, { error, component }, component);
  }

  uiMount(component: string, props?: any) {
    this.debug('ui', `[${component}] Component mounted`, props, component);
  }

  uiUnmount(component: string) {
    this.debug('ui', `[${component}] Component unmounted`, {}, component);
  }

  // Step completion logging
  stepComplete(step: string, message: string, data?: any) {
    this.success('pipeline', `Step '${step}' completed: ${message}`, data);
  }

  stepStart(step: string, message: string, data?: any) {
    this.info('pipeline', `Step '${step}' started: ${message}`, data);
  }

  stepFailed(step: string, message: string, error?: any) {
    this.error('pipeline', `Step '${step}' failed: ${message}`, error);
  }

  // Performance timing
  time(label: string, category: string = 'debug') {
    const startTime = performance.now();
    return {
      end: (message?: string) => {
        const duration = performance.now() - startTime;
        this.addLog({
          level: 'debug',
          category: category as any,
          message: `${label} ${message || 'completed'}`,
          duration
        });
        return duration;
      }
    };
  }

  // Queue-specific logging
  queueAdd(itemId: string, type: string, priority: number) {
    this.info('queue', `Added ${type} item to queue`, { itemId, type, priority });
  }

  queueProcess(itemId: string, status: string) {
    this.info('queue', `Queue item ${status}`, { itemId, status });
  }

  queueComplete(itemId: string, result?: any) {
    this.success('queue', `Queue item completed`, { itemId, result });
  }

  queueError(itemId: string, error: any) {
    this.error('queue', `Queue item failed`, { itemId, error });
  }

  // Store-specific logging
  storeUpdate(action: string, payload?: any) {
    this.debug('store', `Store updated: ${action}`, payload);
  }

  storeError(action: string, error: any) {
    this.error('store', `Store error during: ${action}`, error);
  }

  // Testing framework
  testStart(testName: string, description?: string) {
    this.info('test', `🧪 Test started: ${testName}`, { description });
  }

  testPass(testName: string, result?: any) {
    this.success('test', `✅ Test passed: ${testName}`, result);
  }

  testFail(testName: string, error: any) {
    this.error('test', `❌ Test failed: ${testName}`, error);
  }

  testStep(testName: string, step: string, data?: any) {
    this.debug('test', `🧪 [${testName}] ${step}`, data);
  }

  // Listeners
  subscribe(listener: (logs: DebugLogEntry[]) => void) {
    this.listeners.add(listener);
    // Immediately send current logs
    listener([...this.logs]);
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  // Getters
  getLogs(filter?: Partial<Pick<DebugLogEntry, 'level' | 'category'>>) {
    if (!filter) return [...this.logs];
    
    return this.logs.filter(log => {
      if (filter.level && log.level !== filter.level) return false;
      if (filter.category && log.category !== filter.category) return false;
      return true;
    });
  }

  getCategories() {
    return Array.from(this.categories);
  }

  // Controls
  clear() {
    this.logs = [];
    this.categories.clear(); // Also clear categories
    this.listeners.forEach(listener => listener([]));
    // Don't log the clear action to prevent immediate pollution
  }
  
  // Emergency method to clear everything and restart
  reset() {
    this.logs = [];
    this.categories.clear();
    this.listeners.clear();
    console.warn('🚨 Debug service reset - all logs and listeners cleared');
  }

  setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    this.info('debug', `Debug logging ${enabled ? 'enabled' : 'disabled'}`);
  }

  isDebugEnabled() {
    return this.isEnabled;
  }

  // Export logs
  exportLogs() {
    const data = {
      timestamp: new Date().toISOString(),
      logs: this.logs,
      categories: Array.from(this.categories),
      summary: {
        total: this.logs.length,
        byLevel: {
          debug: this.logs.filter(l => l.level === 'debug').length,
          info: this.logs.filter(l => l.level === 'info').length,
          warn: this.logs.filter(l => l.level === 'warn').length,
          error: this.logs.filter(l => l.level === 'error').length,
          success: this.logs.filter(l => l.level === 'success').length,
        },
        byCategory: {}
      }
    };

    // Calculate category counts
    this.categories.forEach(category => {
      (data.summary.byCategory as any)[category] = this.logs.filter(l => l.category === category).length;
    });

    return data;
  }
}

export const debugService = new DebugService();

// Global access for testing
(window as any).debugService = debugService;