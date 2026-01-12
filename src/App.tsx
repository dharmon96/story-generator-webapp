import React, { useEffect, useRef } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

import theme from './theme';
import Layout from './components/Layout';
import MainAppRouter from './components/MainAppRouter';
import FloatingDebugConsole from './components/FloatingDebugConsole';
import { nodeDiscoveryService } from './services/nodeDiscovery';
import { agentDiscoveryService } from './services/agentDiscovery';
import { debugService } from './services/debugService';
import { useStore } from './store/useStore';
import './services/testUtils'; // Import for global access

// Global agent polling interval (30 seconds)
const AGENT_POLL_INTERVAL = 30000;

function App() {
  const { agents, setAgents, cloudServices, settings } = useStore();
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Sync agents to nodeDiscoveryService whenever agents change
  useEffect(() => {
    if (agents.length > 0) {
      debugService.info('sync', `🔄 Syncing ${agents.length} agent(s) to nodeDiscoveryService...`);
      nodeDiscoveryService.syncFromAgents(agents);
    }
  }, [agents]);

  // Sync cloud services to nodeDiscoveryService whenever they change
  useEffect(() => {
    debugService.info('sync', `☁️ Syncing ${cloudServices.length} cloud service(s) to nodeDiscoveryService...`);
    nodeDiscoveryService.syncCloudServices(cloudServices);
  }, [cloudServices]);

  // Fetch agents from backend and sync to nodeDiscoveryService
  const fetchAndSyncAgents = async () => {
    try {
      const backendAgents = await agentDiscoveryService.fetchRegisteredAgents(settings.apiEndpoint);
      if (backendAgents.length > 0 || agents.length > 0) {
        setAgents(backendAgents);
        // The useEffect above will sync to nodeDiscoveryService
      }
    } catch (error) {
      debugService.warn('sync', 'Failed to fetch agents from backend', error);
    }
  };

  useEffect(() => {
    const initializeApp = async () => {
      debugService.info('ui', '🚀 Story Generator App Starting...');
      debugService.info('ui', '🔍 Initializing agent discovery...');

      try {
        // Fetch agents from backend (replaces legacy local network scan)
        debugService.info('network', '📡 Fetching registered agents from backend...');
        await fetchAndSyncAgents();

        const nodes = nodeDiscoveryService.getNodes();
        debugService.success('network', `✅ Found ${nodes.length} nodes`, nodes.map(n => ({
          name: n.name,
          type: n.type,
          status: n.status,
          models: n.models?.length || 0
        })));

        // Log current settings
        const storedSettings = localStorage.getItem('story-generator-storage');
        if (storedSettings) {
          const parsed = JSON.parse(storedSettings);
          debugService.info('store', '⚙️ Loaded settings from localStorage', {
            processingEnabled: parsed?.state?.settings?.processingEnabled,
            modelConfigs: parsed?.state?.settings?.modelConfigs?.length || 0,
            apiKeys: Object.keys(parsed?.state?.settings || {}).filter(k => k.endsWith('Key'))
          });
        }

        debugService.success('ui', '🎉 App initialization complete!');

        // Start polling for agent updates
        pollIntervalRef.current = setInterval(() => {
          fetchAndSyncAgents();
        }, AGENT_POLL_INTERVAL);

      } catch (error) {
        debugService.error('ui', '❌ App initialization failed', error);
      }
    };

    initializeApp();

    // Cleanup polling on unmount
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <Layout>
            <MainAppRouter />
          </Layout>
          {/* Global Debug Console */}
          <FloatingDebugConsole />
        </LocalizationProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
