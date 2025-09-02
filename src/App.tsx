import React, { useEffect } from 'react';
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
import { debugService } from './services/debugService';
import './services/testUtils'; // Import for global access

function App() {
  useEffect(() => {
    const initializeApp = async () => {
      debugService.info('ui', '🚀 Story Generator App Starting...');
      debugService.info('ui', '🔍 Initializing node discovery service...');
      
      try {
        // Scan for local Ollama instances
        debugService.info('network', '📡 Scanning for local Ollama instances...');
        await nodeDiscoveryService.scanLocalNetwork();
        
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
        
      } catch (error) {
        debugService.error('ui', '❌ App initialization failed', error);
      }
    };

    initializeApp();
  }, []);

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
