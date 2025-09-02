import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  IconButton,
  Button,
  Chip,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Grid,
} from '@mui/material';
import {
  PlayArrow,
  Pause,
  Delete,
  ArrowUpward,
  ArrowDownward,
  Clear,
  CheckCircle,
  Error as ErrorIcon,
  HourglassEmpty,
  Visibility,
  Stop,
  Refresh,
} from '@mui/icons-material';
import { useStore, Story } from '../store/useStore';
import { sequentialAiPipelineService } from '../services/sequentialAiPipeline';
import { debugService } from '../services/debugService';
import { nodeDiscoveryService } from '../services/nodeDiscovery';

// Global processing state to prevent double processing across component mounts
const globalProcessingState = {
  isProcessing: false,
  currentItemId: null as string | null,
  reset() {
    this.isProcessing = false;
    this.currentItemId = null;
  }
};

interface StoryQueueProps {
  onOpenStory?: (storyId: string, queueItemId: string) => void;
}

const StoryQueue: React.FC<StoryQueueProps> = ({ onOpenStory }) => {
  const { queue, removeFromQueue, clearCompletedQueue, moveQueueItem, updateQueueItem, addStory, reQueueItem, settings } = useStore();
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingErrors, setProcessingErrors] = useState<string[]>([]);
  const [currentProcessingItem, setCurrentProcessingItem] = useState<string | null>(null);
  
  // Use ref to track processing state to avoid closure issues
  const isProcessingRef = useRef(false);
  const processingItemRef = useRef<string | null>(null);
  
  // Global processing lock to prevent race conditions across component mounts
  const processingLockRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Logging function
  const addDebugLog = useCallback((message: string, level: 'info' | 'error' | 'success' | 'warning' = 'info') => {
    // Route to centralized debug service
    switch (level) {
      case 'success':
        debugService.success('queue', message);
        break;
      case 'error':
        debugService.error('queue', message);
        break;
      case 'warning':
        debugService.warn('queue', message);
        break;
      default:
        debugService.info('queue', message);
        break;
    }
  }, []);

  // Initialize component (run only once on mount)
  useEffect(() => {
    // Add a unique mount ID to detect duplicate mounts
    const mountId = Math.random().toString(36).substring(2, 9);
    const mountTime = new Date().toLocaleTimeString();
    
    addDebugLog(`📊 ===== StoryQueue mounted [${mountId}] at ${mountTime} =====`);
    addDebugLog(`📊 Mount ID: ${mountId} - If you see multiple IDs, React is double-mounting`);
    addDebugLog(`📊 Initial state: isProcessing=${isProcessing}, currentProcessingItem=${currentProcessingItem}`);
    addDebugLog(`📊 Queue items: ${queue.length}, Processing enabled: ${settings.processingEnabled}`);
    addDebugLog(`📊 Available nodes: ${nodeDiscoveryService.getNodes().length}`);
    
    // Only log detailed state if queue has items
    if (queue.length > 0) {
      queue.forEach((item, index) => {
        addDebugLog(`📊 Queue Item ${index + 1}: ${item.status} - "${item.config.prompt.slice(0, 30)}..." (ID: ${item.id})`);
      });
    }
    
    const nodes = nodeDiscoveryService.getNodes();
    if (nodes.length > 0) {
      addDebugLog(`📊 Found ${nodes.length} nodes: ${nodes.map(n => n.name).join(', ')}`);
    } else {
      addDebugLog(`📊 ⚠️ No nodes found - check node discovery service`);
    }
    
    addDebugLog(`📊 ===== End mount [${mountId}] =====`);
    
    // Cleanup function to detect unmounting
    return () => {
      addDebugLog(`📊 🔄 StoryQueue unmounting [${mountId}]`);
      // Abort any ongoing processing
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      isProcessingRef.current = false;
      processingItemRef.current = null;
      processingLockRef.current = null;
      // Don't reset global state on unmount - let it persist
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount


  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const item = queue[index];
    moveQueueItem(item.id, 'up');
  };

  const handleMoveDown = (index: number) => {
    if (index === queue.length - 1) return;
    const item = queue[index];
    moveQueueItem(item.id, 'down');
  };

  const handleDelete = (id: string) => {
    setSelectedItem(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (selectedItem) {
      // Stop processing this item if it's currently being processed
      if (currentProcessingItem === selectedItem) {
        setCurrentProcessingItem(null);
        processingItemRef.current = null;
      }
      removeFromQueue(selectedItem);
    }
    setDeleteDialogOpen(false);
    setSelectedItem(null);
  };

  const validateProcessingSetup = useCallback(async (): Promise<void> => {
    console.log('🔍 Starting validation...');
    
    // Check if model configs are set up
    if (!settings.modelConfigs || settings.modelConfigs.length === 0) {
      console.error('❌ No model configurations found');
      throw new Error('No model configurations found. Please configure models in Settings.');
    }
    console.log(`✅ Found ${settings.modelConfigs.length} model configurations`);

    const enabledConfigs = settings.modelConfigs.filter(config => 
      config.enabled && config.nodeId && config.model
    );
    console.log(`✅ Found ${enabledConfigs.length} enabled configurations:`, enabledConfigs);

    if (enabledConfigs.length === 0) {
      console.error('❌ No enabled model configurations found');
      throw new Error('No enabled model configurations found. Please enable at least one model configuration in Settings.');
    }

    // Check if required steps are configured
    const requiredSteps = ['story', 'shots', 'characters', 'prompts'];
    const configuredSteps = enabledConfigs.map(config => config.step);
    const missingSteps = requiredSteps.filter(step => !configuredSteps.includes(step));
    console.log(`🔍 Required steps: ${requiredSteps.join(', ')}`);
    console.log(`🔍 Configured steps: ${configuredSteps.join(', ')}`);

    if (missingSteps.length > 0) {
      console.error(`❌ Missing required steps: ${missingSteps.join(', ')}`);
      throw new Error(`Missing required model configurations for steps: ${missingSteps.join(', ')}. Please configure these in Settings.`);
    }
    console.log('✅ All required steps configured');

    // Verify nodes are reachable
    const nodes = nodeDiscoveryService.getNodes();
    console.log(`🔍 Available nodes: ${nodes.length}`, nodes.map(n => ({ id: n.id, name: n.name, status: n.status })));
    
    for (const config of enabledConfigs) {
      console.log(`🔍 Validating config for step '${config.step}': node=${config.nodeId}, model=${config.model}`);
      
      const node = nodes.find(n => n.id === config.nodeId);
      if (!node) {
        console.error(`❌ Node '${config.nodeId}' not found for step '${config.step}'`);
        throw new Error(`Node '${config.nodeId}' not found for step '${config.step}'. Please refresh nodes in Settings.`);
      }
      console.log(`✅ Found node '${node.name}' (status: ${node.status})`);
      
      if (node.status !== 'online') {
        console.error(`❌ Node '${node.name}' is offline for step '${config.step}'`);
        throw new Error(`Node '${node.name}' is offline for step '${config.step}'. Please check the node connection.`);
      }
      console.log(`✅ Node '${node.name}' is online`);
      
      console.log(`🔍 Node models:`, node.models);
      if (!node.models.includes(config.model)) {
        console.error(`❌ Model '${config.model}' not available on node '${node.name}'`);
        throw new Error(`Model '${config.model}' not available on node '${node.name}' for step '${config.step}'. Please select a different model or refresh the node.`);
      }
      console.log(`✅ Model '${config.model}' available on node '${node.name}'`);
    }
    
    console.log('🎉 All validation checks passed!');
  }, [settings.modelConfigs]);

  const processNextQueueItem = useCallback(async (): Promise<void> => {
    const callTimestamp = new Date().toISOString();
    addDebugLog(`🔄 [${callTimestamp}] ===== processNextQueueItem ENTRY =====`);
    addDebugLog(`🔄 [${callTimestamp}] isProcessingRef.current: ${isProcessingRef.current}`);
    addDebugLog(`🔄 [${callTimestamp}] isProcessing state: ${isProcessing}`);
    addDebugLog(`🔄 [${callTimestamp}] currentProcessingItem: ${currentProcessingItem}`);
    addDebugLog(`🔄 [${callTimestamp}] processingItemRef.current: ${processingItemRef.current}`);
    addDebugLog(`🔄 [${callTimestamp}] globalProcessingState: ${globalProcessingState.isProcessing}, ${globalProcessingState.currentItemId}`);
    addDebugLog(`🔄 [${callTimestamp}] Queue state: ${queue.length} total items`);
    
    queue.forEach((item, index) => {
      addDebugLog(`🔄 [${callTimestamp}] Item ${index + 1}: ID=${item.id}, status=${item.status}, priority=${item.priority}, prompt="${item.config.prompt.slice(0, 30)}..."`);
    });
    
    if (!isProcessingRef.current) {
      addDebugLog(`⏹️ [${callTimestamp}] Processing disabled (isProcessingRef.current=false), stopping queue processing`);
      globalProcessingState.reset();
      return;
    }

    // Prevent multiple concurrent calls using global state
    if (globalProcessingState.isProcessing) {
      // Check if the item in global state still exists in queue
      const itemStillExists = queue.some(item => item.id === globalProcessingState.currentItemId);
      if (!itemStillExists) {
        addDebugLog(`⚠️ [${callTimestamp}] Global state references non-existent item ${globalProcessingState.currentItemId}, resetting`);
        globalProcessingState.reset();
      } else {
        addDebugLog(`⚠️ [${callTimestamp}] Global processing already active for ${globalProcessingState.currentItemId}, skipping`);
        return;
      }
    }
    
    // Prevent multiple concurrent calls to processNextQueueItem
    if (processingItemRef.current !== null) {
      addDebugLog(`⚠️ [${callTimestamp}] Already processing item ${processingItemRef.current}, skipping processNextQueueItem call`);
      return;
    }

    // Find next queued item by priority (highest priority first)
    addDebugLog(`🔍 [${callTimestamp}] Finding next queued item from ${queue.length} total items...`);
    const queuedItems = queue.filter(item => item.status === 'queued');
    addDebugLog(`🔍 [${callTimestamp}] Found ${queuedItems.length} items with status 'queued'`);
    queuedItems.forEach((item, index) => {
      addDebugLog(`🔍 [${callTimestamp}] Queued item ${index + 1}: ID=${item.id}, priority=${item.priority}, prompt="${item.config.prompt.slice(0, 30)}..."`);
    });
    
    const nextItem = queuedItems.sort((a, b) => b.priority - a.priority)[0];
    if (!nextItem) {
      addDebugLog(`✅ [${callTimestamp}] Queue processing complete - no pending items`, 'success');
      setIsProcessing(false);
      isProcessingRef.current = false;
      setCurrentProcessingItem(null);
      processingItemRef.current = null;
      processingLockRef.current = null;
      processingLockRef.current = null; // Clear processing lock
      return;
    }

    addDebugLog(`🎯 [${callTimestamp}] Selected next item: ID=${nextItem.id}, priority=${nextItem.priority}, status=${nextItem.status}`);

    // Double-check this item hasn't been processed already
    if (nextItem.status !== 'queued') {
      addDebugLog(`⚠️ [${callTimestamp}] Item ${nextItem.id} status is ${nextItem.status}, not 'queued' - skipping`);
      return;
    }
    
    // Set processing lock after validation
    processingItemRef.current = nextItem.id;
    processingLockRef.current = nextItem.id;
    globalProcessingState.isProcessing = true;
    globalProcessingState.currentItemId = nextItem.id;

    // Prevent concurrent processing of the same item
    if (currentProcessingItem === nextItem.id) {
      addDebugLog(`⚠️ [${callTimestamp}] Item ${nextItem.id} already being processed (currentProcessingItem match), skipping`);
      return;
    }

    // Additional safety check: verify item is still in queued state in the store
    const freshQueueItem = queue.find(item => item.id === nextItem.id);
    if (!freshQueueItem || freshQueueItem.status !== 'queued') {
      addDebugLog(`⚠️ [${callTimestamp}] Item ${nextItem.id} no longer in queued state (${freshQueueItem?.status || 'not found'}), skipping`);
      setTimeout(() => processNextQueueItem(), 100);
      return;
    }

    addDebugLog(`✅ [${callTimestamp}] All checks passed for item ${nextItem.id}, proceeding with processing...`);
    addDebugLog(`🚀 [${callTimestamp}] About to set processing states and call enhancedAiPipelineService...`);

    addDebugLog(`📝 Found next item: ${nextItem.config.prompt.slice(0, 50)}... (ID: ${nextItem.id})`);
    addDebugLog(`📝 Setting currentProcessingItem to: ${nextItem.id}`);
    setCurrentProcessingItem(nextItem.id);
    
    // Update item status to processing
    addDebugLog(`📝 Updating item status to 'processing'...`);
    updateQueueItem(nextItem.id, {
      status: 'processing',
      startedAt: new Date(),
      progress: 0
    });
    addDebugLog(`📝 Item status updated to processing`);

    // Create abort controller for this processing session
    abortControllerRef.current = new AbortController();

    try {
      const processTimestamp = new Date().toISOString();
      addDebugLog(`🚀 [${processTimestamp}] ===== STARTING AI PIPELINE =====`);
      addDebugLog(`🚀 [${processTimestamp}] Processing item: ID=${nextItem.id}, prompt="${nextItem.config.prompt.slice(0, 50)}..."`);
      addDebugLog(`🔧 [${processTimestamp}] Using ${settings.modelConfigs?.filter(c => c.enabled)?.length || 0} enabled model configs`);
      
      // Log model config details
      const enabledConfigs = settings.modelConfigs?.filter(c => c.enabled) || [];
      enabledConfigs.forEach((config, index) => {
        addDebugLog(`🔧 [${processTimestamp}] Config ${index + 1}: step="${config.step}" -> nodeId="${config.nodeId}" (model="${config.model}")`);
      });
      
      addDebugLog(`🚀 [${processTimestamp}] ===== CALLING sequentialAiPipelineService.processQueueItem =====`);
      addDebugLog(`🚀 [${processTimestamp}] Parameters:`);
      addDebugLog(`🚀 [${processTimestamp}] - nextItem.id: ${nextItem.id}`);
      addDebugLog(`🚀 [${processTimestamp}] - nextItem.config: ${JSON.stringify(nextItem.config)}`);
      addDebugLog(`🚀 [${processTimestamp}] - modelConfigs count: ${settings.modelConfigs!.length}`);
      addDebugLog(`🚀 [${processTimestamp}] - About to await sequentialAiPipelineService.processQueueItem()...`);
      
      const story = await sequentialAiPipelineService.processQueueItem(
        nextItem,
        settings.modelConfigs!,
        (progress: any) => {
          const progressTimestamp = new Date().toISOString();
          
          debugService.info('queue', `📈 Step: ${progress.currentStepName || progress.currentStep} (${progress.overallProgress}%)`, {
            stepId: progress.currentStep,
            stepName: progress.currentStepName,
            stepProgress: progress.stepProgress,
            overallProgress: progress.overallProgress,
            assignedNode: progress.assignedNode,
            currentModel: progress.currentModel,
            status: progress.status
          });
          
          updateQueueItem(nextItem.id, {
            progress: progress.overallProgress || 0,
            currentStep: progress.currentStepName || progress.currentStep || 'Unknown',
            logs: progress.logs || []
          });
        }
      );
      
      const returnTimestamp = new Date().toISOString();
      addDebugLog(`🚀 [${returnTimestamp}] ===== sequentialAiPipelineService.processQueueItem RETURNED! =====`);
      addDebugLog(`🚀 [${returnTimestamp}] Returned story object: ${story ? 'EXISTS' : 'NULL'}`);
      if (story) {
        addDebugLog(`🚀 [${returnTimestamp}] Story object keys: ${Object.keys(story).join(', ')}`);
        addDebugLog(`🚀 [${returnTimestamp}] Story title: "${story.title || 'NO TITLE'}"`);
        addDebugLog(`🚀 [${returnTimestamp}] Story ID: "${story.id || 'NO ID'}"`);
        addDebugLog(`🚀 [${returnTimestamp}] Story status: "${story.status || 'NO STATUS'}"`);
        addDebugLog(`🚀 [${returnTimestamp}] Story content length: ${story.content?.length || 0} chars`);
        addDebugLog(`🚀 [${returnTimestamp}] Story shots count: ${story.shots?.length || 0}`);
      } else {
        // Story is null, mark as failed
        throw new Error('Story processing returned null');
      }
      
      // Log ComfyUI prompt generation results
      if (story?.shots && story.shots.length > 0) {
        const shotsWithPrompts = story.shots.filter(s => s.comfyUIPositivePrompt);
        addDebugLog(`🎨 Shots with ComfyUI prompts: ${shotsWithPrompts.length}/${story.shots.length}`);
        if (shotsWithPrompts.length > 0) {
          addDebugLog(`🎨 Sample positive prompt: ${shotsWithPrompts[0].comfyUIPositivePrompt?.slice(0, 100)}...`);
        } else {
          addDebugLog(`⚠️ No ComfyUI prompts generated - using fallback`, 'error');
        }
      }
    

      addDebugLog(`✅ Pipeline completed successfully: ${story.title}`, 'success');
      
      // Save story FIRST before marking queue item as completed
      // This ensures the story is available when the user views it

      // Convert enhanced story to basic story for store
      const basicStory: Story = {
        id: story.id,
        title: story.title,
        content: story.content,
        genre: story.genre,
        shots: story.shots?.map(shot => ({
          id: shot.id,
          storyId: story.id,
          shotNumber: shot.shotNumber,
          description: shot.description,
          duration: shot.duration,
          frames: Math.floor(shot.duration * 24),
          camera: shot.cameraMovement || 'medium shot',
          visualPrompt: shot.visualPrompt,
          comfyUIPositivePrompt: shot.comfyUIPositivePrompt,
          comfyUINegativePrompt: shot.comfyUINegativePrompt,
          narration: shot.narration,
          musicCue: shot.musicCue,
          renderStatus: shot.renderStatus as 'pending' | 'rendering' | 'completed' || 'pending'
        })) || [],
        characters: story.characters?.map(char => ({
          name: char.name,
          role: char.role === 'protagonist' ? 'main' : 'supporting',
          physical_description: char.physical_description,
          age_range: char.age_range,
          importance_level: char.importance_level
        })) || [],
        status: 'completed',
        createdAt: story.createdAt,
        updatedAt: story.updatedAt
      };
      
      // Save the story to the store
      addStory(basicStory);
      addDebugLog(`💾 Story saved: ${story.title} (ID: ${story.id})`, 'success');
      
      // NOW mark the queue item as completed with the story ID
      updateQueueItem(nextItem.id, {
        status: 'completed',
        completedAt: new Date(),
        progress: 100,
        storyId: story.id
      });
      addDebugLog(`✅ Queue item marked as completed with storyId: ${story.id}`, 'success');
      
      // Log what was saved
      const savedShotsWithPrompts = basicStory.shots.filter(s => s.comfyUIPositivePrompt);
      addDebugLog(`💾 Saved ${savedShotsWithPrompts.length} shots with ComfyUI prompts`, 'success');

    } catch (error: any) {
      addDebugLog(`❌ Processing failed: ${error.message}`, 'error');
      addDebugLog(`❌ Error stack: ${error.stack}`, 'error');
      console.error('❌ Processing failed:', error);
      console.error('❌ Error stack:', error.stack);
      
      // Mark as failed (NOT back to queued to prevent infinite loop)
      updateQueueItem(nextItem.id, {
        status: 'failed',
        error: error.message,
        completedAt: new Date()
      });

      // Add to processing errors
      setProcessingErrors(prev => [...prev, `Failed to process "${nextItem.config.prompt.slice(0, 30)}...": ${error.message}`]);
    } finally {
      addDebugLog(`🔄 processNextQueueItem finally block: clearing currentProcessingItem`);
      setCurrentProcessingItem(null);
      processingItemRef.current = null;
      processingLockRef.current = null;
      globalProcessingState.reset();
      
      // Clear abort controller
      if (abortControllerRef.current) {
        abortControllerRef.current = null;
      }
      
      // Stop processing - don't automatically continue
      if (!isProcessingRef.current) {
        addDebugLog('🏁 Processing stopped by user', 'info');
        setIsProcessing(false);
        isProcessingRef.current = false;
      }
    }
  }, [queue, updateQueueItem, settings.modelConfigs, addStory, setProcessingErrors, setCurrentProcessingItem, setIsProcessing, addDebugLog, currentProcessingItem]);

  const handleOpenStory = (item: any) => {
    if (onOpenStory && item.storyId) {
      onOpenStory(item.storyId, item.id);
    }
  };

  const handleToggleProcessing = useCallback(async () => {
    const newState = !isProcessing;
    addDebugLog(`🎛️ Toggle processing: ${isProcessing} -> ${newState}`);
    
    if (newState) {
      // Clear any stuck global state before starting
      if (globalProcessingState.isProcessing) {
        addDebugLog(`⚠️ Clearing stuck global state for item: ${globalProcessingState.currentItemId}`);
        globalProcessingState.reset();
      }
      
      // Start processing directly
      try {
        addDebugLog('📋 Validating processing setup...', 'info');
        await validateProcessingSetup();
        addDebugLog('✅ Starting queue processing...', 'success');
        
        setIsProcessing(true);
        isProcessingRef.current = true;  // Update ref immediately
        setProcessingErrors([]);
        
        // Start processing the first item - need to wait for state update
        setTimeout(() => {
          addDebugLog('🚀 Calling processNextQueueItem after state update');
          processNextQueueItem();
        }, 100);
        
      } catch (error: any) {
        addDebugLog(`❌ Failed to start processing: ${error.message}`, 'error');
        setProcessingErrors([error.message]);
        setIsProcessing(false);
        isProcessingRef.current = false;
      }
    } else {
      // Stop processing
      addDebugLog('🛑 Stopping queue processing');
      
      // Call pipeline stop to abort any running AI processes
      sequentialAiPipelineService.stopAllProcessing();
      
      setIsProcessing(false);
      isProcessingRef.current = false;  // Update ref immediately
      setCurrentProcessingItem(null);
      processingItemRef.current = null;
      processingLockRef.current = null;
      globalProcessingState.reset();
      
      // Abort current controller if exists
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      
      // Re-queue any processing items for retry
      const processingItems = queue.filter(item => item.status === 'processing');
      if (processingItems.length > 0) {
        addDebugLog(`🔄 Re-queuing ${processingItems.length} interrupted items`);
        processingItems.forEach(item => {
          reQueueItem(item.id);
        });
      }
    }
  }, [isProcessing, addDebugLog, queue, updateQueueItem, reQueueItem, validateProcessingSetup, processNextQueueItem]);

  const handleCancelItem = (id: string) => {
    // Cancel a specific item
    updateQueueItem(id, { status: 'failed' as const, error: 'Cancelled by user' });
  };

  const getStepDisplayName = (step: string): string => {
    const stepNames: Record<string, string> = {
      'story': '📝 Writing Story',
      'shots': '🎬 Creating Shots',
      'characters': '👥 Analyzing Characters',
      'prompts': '🎨 Generating Prompts',
      'comfyui_prompts': '🖼️ ComfyUI Prompts',
      'narration': '🎙️ Adding Narration',
      'music': '🎵 Adding Music',
      'completed': '✅ Finalizing'
    };
    return stepNames[step] || step;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle color="success" />;
      case 'failed':
        return <ErrorIcon color="error" />;
      case 'processing':
        return <HourglassEmpty color="primary" />;
      default:
        return <HourglassEmpty color="disabled" />;
    }
  };

  const getStatusColor = (status: string): any => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'failed':
        return 'error';
      case 'processing':
        return 'primary';
      default:
        return 'default';
    }
  };

  const calculateETA = () => {
    const processingItems = queue.filter(item => item.status === 'processing' || item.status === 'queued');
    const avgTime = 12; // minutes per story
    const totalMinutes = processingItems.length * avgTime;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  // Auto-start only for high-priority items (from Generate button)
  useEffect(() => {
    // Only check for high-priority items that are actually queued (not completed/failed)
    const highPriorityQueuedItems = queue.filter(item => 
      item.status === 'queued' && 
      item.priority >= 10
    );
    
    // More robust check to prevent duplicate processing using global state
    const isAlreadyBusy = isProcessing || currentProcessingItem || isProcessingRef.current || processingItemRef.current || processingLockRef.current || globalProcessingState.isProcessing;
    
    // Only auto-start if we have genuinely new high-priority items and we're definitely not processing
    if (highPriorityQueuedItems.length > 0 && !isAlreadyBusy && settings.processingEnabled) {
      debugService.info('queue', `🚀 High-priority queued items detected! Auto-starting processing for ${highPriorityQueuedItems.length} items`, {
        highPriorityItems: highPriorityQueuedItems.length,
        isProcessing,
        currentProcessingItem,
        isProcessingRef: isProcessingRef.current,
        processingItemRef: processingItemRef.current
      });
      
      // Start processing immediately for high-priority items
      const startImmediateProcessing = async () => {
        try {
          // Double-check we're not already processing before starting
          if (isProcessingRef.current || processingItemRef.current) {
            addDebugLog('⚠️ Already processing, skipping auto-start', 'info');
            return;
          }
          
          addDebugLog('📋 Validating setup for immediate processing...', 'info');
          await validateProcessingSetup();
          addDebugLog('✅ Starting immediate processing...', 'success');
          
          setIsProcessing(true);
          isProcessingRef.current = true;  // Update ref immediately
          setProcessingErrors([]);
          
          // Call processNextQueueItem directly
          addDebugLog('🚀 Starting processNextQueueItem for high-priority item');
          processNextQueueItem();
          
        } catch (error: any) {
          addDebugLog(`❌ Failed to start immediate processing: ${error.message}`, 'error');
          setProcessingErrors([error.message]);
          setIsProcessing(false);
          isProcessingRef.current = false;
        }
      };
      
      startImmediateProcessing();
    }
  }, [queue, isProcessing, currentProcessingItem, validateProcessingSetup, processNextQueueItem, addDebugLog, settings.processingEnabled]);

  // Manual queue processing only starts when user clicks "Start Processing" button

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">Story Queue</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<Clear />}
            onClick={() => {
              clearCompletedQueue();
              console.log('Cleared completed items');
            }}
            disabled={!queue.some(item => item.status === 'completed')}
          >
            Clear Completed
          </Button>
          <Button
            variant="outlined"
            startIcon={<Delete />}
            onClick={() => {
              if (window.confirm('Are you sure you want to clear ALL items from the queue?')) {
                queue.forEach(item => {
                  if (item.status !== 'processing') {
                    removeFromQueue(item.id);
                  }
                });
              }
            }}
            color="error"
            disabled={queue.length === 0 || queue.every(item => item.status === 'processing')}
          >
            Clear All
          </Button>
          <Button
            variant="contained"
            startIcon={isProcessing ? <Pause /> : <PlayArrow />}
            onClick={handleToggleProcessing}
            color={isProcessing ? 'error' : 'primary'}
          >
            {isProcessing ? 'Stop Processing' : 'Start Processing'}
          </Button>
        </Box>
      </Box>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Queue Items
              </Typography>
              
              {queue.length === 0 ? (
                <Alert severity="info">
                  No items in queue. Add stories from the Story Generator to begin processing.
                </Alert>
              ) : (
                <TableContainer component={Paper} variant="outlined">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Position</TableCell>
                        <TableCell>Story</TableCell>
                        <TableCell>Genre</TableCell>
                        <TableCell>Priority</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Progress</TableCell>
                        <TableCell>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {queue.map((item, index) => (
                        <TableRow key={item.id}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell>
                            <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                              {item.config.prompt || 'Auto-generated'}
                            </Typography>
                          </TableCell>
                          <TableCell>{item.config.genre}</TableCell>
                          <TableCell>
                            <Chip 
                              label={item.priority >= 10 ? 'Immediate' : 'Normal'} 
                              size="small" 
                              color={item.priority >= 10 ? 'error' : 'primary'}
                              variant={item.priority >= 10 ? 'filled' : 'outlined'}
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              icon={getStatusIcon(item.status)}
                              label={item.status}
                              size="small"
                              color={getStatusColor(item.status)}
                            />
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Box sx={{ flex: 1 }}>
                                <LinearProgress
                                  variant="determinate"
                                  value={item.progress}
                                  sx={{ width: '100%', height: 8, borderRadius: 4 }}
                                />
                                <Typography variant="caption" color="text.secondary">
                                  {item.progress}%
                                  {item.status === 'processing' && item.currentStep && (
                                    <> • {getStepDisplayName(item.currentStep)}</>
                                  )}
                                </Typography>
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                              <Tooltip title="Open Story Details">
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenStory(item);
                                  }}
                                  disabled={!item.storyId}
                                  color="primary"
                                >
                                  <Visibility />
                                </IconButton>
                              </Tooltip>
                              {item.status === 'processing' ? (
                                <Tooltip title="Cancel Processing">
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCancelItem(item.id);
                                    }}
                                    color="warning"
                                  >
                                    <Stop />
                                  </IconButton>
                                </Tooltip>
                              ) : item.status === 'failed' ? (
                                <Tooltip title="Re-queue for Processing">
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      reQueueItem(item.id);
                                    }}
                                    color="primary"
                                  >
                                    <Refresh />
                                  </IconButton>
                                </Tooltip>
                              ) : (
                                <>
                                  <Tooltip title="Move Up">
                                    <IconButton
                                      size="small"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMoveUp(index);
                                      }}
                                      disabled={index === 0}
                                    >
                                      <ArrowUpward />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Move Down">
                                    <IconButton
                                      size="small"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMoveDown(index);
                                      }}
                                      disabled={index === queue.length - 1}
                                    >
                                      <ArrowDownward />
                                    </IconButton>
                                  </Tooltip>
                                </>
                              )}
                              <Tooltip title="Delete">
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(item.id);
                                  }}
                                  disabled={item.status === 'processing'}
                                  color="error"
                                >
                                  <Delete />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Queue Statistics
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">Total Items</Typography>
                  <Typography variant="h4">{queue.length}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Processing</Typography>
                  <Typography variant="h4">
                    {queue.filter(item => item.status === 'processing').length}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Completed</Typography>
                  <Typography variant="h4">
                    {queue.filter(item => item.status === 'completed').length}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Estimated Time</Typography>
                  <Typography variant="h4">{calculateETA()}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Processing Settings
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Alert severity={isProcessing ? 'success' : 'info'}>
                  Queue processing is {isProcessing ? 'active' : 'paused'}
                  {currentProcessingItem && (() => {
                    const item = queue.find(q => q.id === currentProcessingItem);
                    return item ? (
                      <>
                        <br />
                        <strong>Processing:</strong> {item.config.prompt.slice(0, 30)}...
                        {item.currentStep && (
                          <>
                            <br />
                            <strong>Step:</strong> {getStepDisplayName(item.currentStep)}
                          </>
                        )}
                      </>
                    ) : null;
                  })()}
                </Alert>
                
                <Alert severity="info" sx={{ mt: 1, fontSize: '0.875rem' }}>
                  <strong>Processing Modes:</strong><br />
                  • <strong>Immediate:</strong> Stories from "Generate" button start automatically<br />
                  • <strong>Normal:</strong> Batch processing starts when you click "Start Processing"<br />
                  • Immediate stories always process first (highest priority)
                </Alert>
                
                <Button 
                  size="small" 
                  variant="outlined" 
                  onClick={() => {
                    console.log('🔍 DEBUG STATE DUMP:');
                    console.log('📊 Queue:', queue);
                    console.log('📊 Settings:', settings);
                    console.log('📊 isProcessing:', isProcessing);
                    console.log('📊 currentProcessingItem:', currentProcessingItem);
                    console.log('📊 processingErrors:', processingErrors);
                    console.log('📊 Available nodes:', nodeDiscoveryService.getNodes());
                    
                    // Show a brief alert
                    alert(`Debug info logged to console:\n- Queue items: ${queue.length}\n- Processing: ${isProcessing}\n- Current item: ${currentProcessingItem || 'none'}\n- Nodes: ${nodeDiscoveryService.getNodes().length}`);
                  }}
                >
                  🐛 Debug State
                </Button>
                
                {processingErrors.length > 0 && (
                  <Alert severity="error" sx={{ mb: 1 }}>
                    <Typography variant="body2" fontWeight="bold">Processing Errors:</Typography>
                    {processingErrors.map((error, index) => (
                      <Typography key={index} variant="body2" component="div">
                        • {error}
                      </Typography>
                    ))}
                  </Alert>
                )}
                
                {settings.modelConfigs && settings.modelConfigs.length > 0 ? (
                  <>
                    <Typography variant="body2">
                      Configured models: <strong>{settings.modelConfigs.filter(c => c.enabled).length}</strong>
                    </Typography>
                    <Typography variant="body2">
                      Processing queue: <strong>{queue.filter(q => q.status === 'queued').length} queued</strong>
                    </Typography>
                    <Typography variant="body2">
                      Auto-retry on failure: <strong>{settings.autoRetry ? `Yes (${settings.retryAttempts} attempts)` : 'No'}</strong>
                    </Typography>
                  </>
                ) : (
                  <Alert severity="warning">
                    No model configurations found. Please configure models in Settings.
                  </Alert>
                )}
              </Box>
            </CardContent>
          </Card>

        </Grid>
      </Grid>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          Are you sure you want to remove this item from the queue?
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StoryQueue;