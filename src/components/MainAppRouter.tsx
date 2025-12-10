import React, { useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { Box } from '@mui/material';
import StoryGenerator from '../pages/StoryGenerator';
import StoryQueue from '../pages/StoryQueue';
import Dashboard from '../pages/Dashboard';
import Research from '../pages/Research';
import Metrics from '../pages/Metrics';
import Settings from '../pages/Settings';
import RenderQueue from '../pages/RenderQueue';
import ShotlistManager from '../pages/ShotlistManager';
import StoryDetail from '../components/StoryDetail';
import { ShotlistEditor } from '../components/shotlist';

const MainAppRouter: React.FC = () => {
  const navigate = useNavigate();
  const [selectedStory, setSelectedStory] = useState<{ storyId: string; queueItemId?: string } | null>(null);
  const [selectedShotlist, setSelectedShotlist] = useState<string | null>(null);

  const handleOpenStory = (storyId: string, queueItemId?: string) => {
    setSelectedStory({ storyId, queueItemId });
    navigate(`/story/${storyId}`);
  };

  const handleBackFromStory = () => {
    setSelectedStory(null);
    navigate(-1);
  };

  const handleOpenShotlist = (shotlistId: string) => {
    setSelectedShotlist(shotlistId);
    navigate(`/shotlists/${shotlistId}`);
  };

  const handleBackFromShotlist = () => {
    setSelectedShotlist(null);
    navigate('/shotlists');
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/generator" element={<StoryGenerator />} />
        <Route path="/queue" element={<StoryQueue onOpenStory={handleOpenStory} />} />
        <Route path="/shotlists" element={<ShotlistManager onOpenShotlist={handleOpenShotlist} />} />
        <Route
          path="/shotlists/:shotlistId"
          element={
            <ShotlistEditor
              shotlistId={selectedShotlist || window.location.pathname.split('/').pop() || ''}
              onBack={handleBackFromShotlist}
            />
          }
        />
        <Route path="/research" element={<Research />} />
        <Route path="/metrics" element={<Metrics />} />
        <Route path="/render-queue" element={<RenderQueue />} />
        <Route path="/settings" element={<Settings />} />
        <Route
          path="/story/:storyId"
          element={
            <StoryDetail
              storyId={selectedStory?.storyId || window.location.pathname.split('/').pop() || ''}
              queueItemId={selectedStory?.queueItemId}
              onBack={handleBackFromStory}
            />
          }
        />
      </Routes>
    </Box>
  );
};

export default MainAppRouter;