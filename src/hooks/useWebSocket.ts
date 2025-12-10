import { useEffect, useRef, useCallback, useState } from 'react';

export interface WebSocketMessage {
  type: string;
  story_id?: string;
  data?: any;
  message?: string;
}

export interface GenerationProgressData {
  step: string;
  progress: number;
  message: string;
  current_data?: any;
}

interface UseWebSocketProps {
  url?: string;
  clientId: string;
  onMessage?: (message: WebSocketMessage) => void;
  onProgress?: (storyId: string, progress: GenerationProgressData) => void;
  onQueueUpdate?: () => void;
  onError?: (error: Event) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  send: (message: any) => void;
  subscribe: (storyId: string) => void;
  unsubscribe: (storyId: string) => void;
  reconnect: () => void;
  disconnect: () => void;
}

const useWebSocket = ({
  url = `ws://localhost:8001/api/ws/connect`,
  clientId,
  onMessage,
  onProgress,
  onQueueUpdate,
  onError,
  onConnect,
  onDisconnect,
}: UseWebSocketProps): UseWebSocketReturn => {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const wsUrl = `${url}/${clientId}`;
    console.log('Connecting to WebSocket:', wsUrl);

    socketRef.current = new WebSocket(wsUrl);

    socketRef.current.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      reconnectAttempts.current = 0;
      onConnect?.();
    };

    socketRef.current.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        console.log('WebSocket message:', message);

        // Handle different message types
        if (message.type === 'generation_progress' && onProgress && message.story_id) {
          onProgress(message.story_id, message.data);
        } else if (message.type === 'queue_update' && onQueueUpdate) {
          onQueueUpdate();
        }

        onMessage?.(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    socketRef.current.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      onDisconnect?.();

      // Attempt to reconnect
      if (reconnectAttempts.current < maxReconnectAttempts) {
        const timeout = Math.pow(2, reconnectAttempts.current) * 1000; // Exponential backoff
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttempts.current++;
          console.log(`Reconnecting WebSocket (attempt ${reconnectAttempts.current})`);
          connect();
        }, timeout);
      }
    };

    socketRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      // Reset reconnection attempts on error to prevent infinite retries
      if (reconnectAttempts.current >= maxReconnectAttempts) {
        reconnectAttempts.current = 0;
      }
      onError?.(error);
    };
  }, [url, clientId, onMessage, onProgress, onQueueUpdate, onError, onConnect, onDisconnect]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    setIsConnected(false);
  }, []);

  const send = useCallback((message: any) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, cannot send message');
    }
  }, []);

  const subscribe = useCallback((storyId: string) => {
    send({
      type: 'subscribe',
      story_id: storyId,
    });
  }, [send]);

  const unsubscribe = useCallback((storyId: string) => {
    send({
      type: 'unsubscribe',
      story_id: storyId,
    });
  }, [send]);

  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttempts.current = 0;
    connect();
  }, [connect, disconnect]);

  // Connect on mount
  useEffect(() => {
    connect();

    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Ping to keep connection alive
  useEffect(() => {
    if (!isConnected) return;

    const pingInterval = setInterval(() => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        send({ type: 'ping' });
      }
    }, 30000); // Ping every 30 seconds

    return () => {
      clearInterval(pingInterval);
    };
  }, [isConnected, send]);

  return {
    isConnected,
    send,
    subscribe,
    unsubscribe,
    reconnect,
    disconnect,
  };
};

export default useWebSocket;