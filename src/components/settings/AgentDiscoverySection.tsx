/**
 * AgentDiscoverySection Component
 *
 * Section for discovering and managing agent nodes.
 * Agents are registered via heartbeats to the backend - this just displays them.
 * Displays local agents and cloud services in separate subsections.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  CircularProgress,
  Divider,
  Alert,
  TextField
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Add as AddIcon,
  Computer as LocalIcon,
  Cloud as CloudIcon
} from '@mui/icons-material';
import { useStore } from '../../store/useStore';
import { agentDiscoveryService } from '../../services/agentDiscovery';
import { nodeDiscoveryService } from '../../services/nodeDiscovery';
import { AgentCard } from './AgentCard';
import { CloudServiceCard } from './CloudServiceCard';
import { AgentNode, CloudServiceNode } from '../../types/agentTypes';

// How often to auto-refresh agents from backend (30 seconds)
const AUTO_REFRESH_INTERVAL = 30000;

export const AgentDiscoverySection: React.FC = () => {
  const {
    agents,
    cloudServices,
    isScanning,
    lastScanTime,
    setAgents,
    addAgent,
    removeAgent,
    setScanning,
    setLastScanTime,
    setCloudServiceApiKey,
    updateCloudService,
    settings
  } = useStore();

  const [manualIp, setManualIp] = useState('');
  const [addingManual, setAddingManual] = useState(false);

  const localAgents = agents.filter(a => a.category === 'local');

  // Fetch agents from backend (source of truth from heartbeats)
  const fetchAgentsFromBackend = useCallback(async (showLoading = true) => {
    if (showLoading) setScanning(true);
    try {
      // Backend has authoritative list from heartbeats
      const backendAgents = await agentDiscoveryService.fetchRegisteredAgents(settings.apiEndpoint);

      if (backendAgents.length > 0 || agents.length > 0) {
        setAgents(backendAgents);
        setLastScanTime(new Date().toISOString());

        // Sync to legacy nodeDiscoveryService for pipeline compatibility
        nodeDiscoveryService.syncFromAgents(backendAgents);
      }
    } catch (error) {
      console.error('Failed to fetch agents from backend:', error);
    } finally {
      if (showLoading) setScanning(false);
    }
  }, [settings.apiEndpoint, setAgents, setLastScanTime, setScanning, agents.length]);

  // Auto-fetch on mount and set up polling
  useEffect(() => {
    // Initial fetch
    fetchAgentsFromBackend(true);

    // Set up polling interval
    const intervalId = setInterval(() => {
      fetchAgentsFromBackend(false); // Don't show loading spinner for background refreshes
    }, AUTO_REFRESH_INTERVAL);

    return () => clearInterval(intervalId);
  }, [fetchAgentsFromBackend]);

  // Manual refresh button
  const handleRefresh = () => {
    fetchAgentsFromBackend(true);
  };

  // Refresh a single agent (re-fetch from backend)
  const handleRefreshAgent = async (agent: AgentNode) => {
    // Just re-fetch all from backend - the heartbeat is the source of truth
    await fetchAgentsFromBackend(false);
  };

  // Remove an agent
  const handleRemoveAgent = (agent: AgentNode) => {
    removeAgent(agent.id);
  };

  // Add manual agent by IP
  const handleAddManualAgent = async () => {
    if (!manualIp.trim()) return;

    setAddingManual(true);
    try {
      const [ip, portStr] = manualIp.split(':');
      const port = portStr ? parseInt(portStr, 10) : 8765;

      const agent = await agentDiscoveryService.checkAgentEndpoint(ip, port);
      if (agent) {
        addAgent(agent);
        setManualIp('');
        // Sync to legacy nodeDiscoveryService
        nodeDiscoveryService.syncFromAgents([agent]);
      } else {
        alert(`Could not connect to agent at ${manualIp}`);
      }
    } catch (error) {
      console.error('Failed to add manual agent:', error);
    } finally {
      setAddingManual(false);
    }
  };

  // Validate cloud service API key
  const handleValidateCloudService = async (service: CloudServiceNode) => {
    updateCloudService(service.id, { status: 'validating', error: undefined });

    const result = await agentDiscoveryService.validateCloudService(
      service.type,
      service.apiKey
    );

    if (result.valid) {
      updateCloudService(service.id, {
        status: 'online',
        models: {
          ...service.models,
          chat: result.models || service.models.chat
        },
        lastValidated: new Date().toISOString()
      });
    } else {
      updateCloudService(service.id, {
        status: 'offline',
        error: result.error
      });
    }
  };

  // Handle cloud service API key change
  const handleApiKeyChange = (id: string, apiKey: string) => {
    setCloudServiceApiKey(id, apiKey);
  };

  const formatLastScan = () => {
    if (!lastScanTime) return 'Never';
    const date = new Date(lastScanTime);
    return date.toLocaleTimeString();
  };

  return (
    <Paper sx={{ p: 3 }}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Box>
          <Typography variant="h6">Agent Discovery</Typography>
          <Typography variant="caption" color="text.secondary">
            Last scan: {formatLastScan()}
          </Typography>
        </Box>

        <Box display="flex" gap={1}>
          <Button
            variant="contained"
            startIcon={isScanning ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
            onClick={handleRefresh}
            disabled={isScanning}
          >
            {isScanning ? 'Refreshing...' : 'Refresh'}
          </Button>
        </Box>
      </Box>

      {/* Manual Agent Add */}
      <Box display="flex" gap={1} mb={3}>
        <TextField
          size="small"
          placeholder="Add agent by IP (e.g., 192.168.1.100:8765)"
          value={manualIp}
          onChange={(e) => setManualIp(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleAddManualAgent()}
          sx={{ flex: 1, maxWidth: 350 }}
        />
        <Button
          variant="outlined"
          startIcon={addingManual ? <CircularProgress size={16} /> : <AddIcon />}
          onClick={handleAddManualAgent}
          disabled={addingManual || !manualIp.trim()}
        >
          Add
        </Button>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Local Agents Section */}
      <Box mb={4}>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <LocalIcon color="primary" />
          <Typography variant="subtitle1" fontWeight="bold">
            Local Agents
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ({localAgents.length})
          </Typography>
        </Box>

        {localAgents.length === 0 ? (
          <Alert severity="info">
            No local agents found. Click "Quick Scan" to discover agents on your network,
            or add one manually by IP address.
          </Alert>
        ) : (
          <Box>
            {localAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onRefresh={handleRefreshAgent}
                onRemove={handleRemoveAgent}
              />
            ))}
          </Box>
        )}
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Cloud Services Section */}
      <Box>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <CloudIcon color="secondary" />
          <Typography variant="subtitle1" fontWeight="bold">
            Cloud Services
          </Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" mb={2}>
          Configure cloud API keys to enable additional AI models for chat and video generation.
        </Typography>

        {cloudServices.map((service) => (
          <CloudServiceCard
            key={service.id}
            service={service}
            onApiKeyChange={handleApiKeyChange}
            onValidate={handleValidateCloudService}
          />
        ))}
      </Box>
    </Paper>
  );
};

export default AgentDiscoverySection;
