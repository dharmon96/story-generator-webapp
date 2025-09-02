import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  LinearProgress,
  Alert,
  FormControlLabel,
  Checkbox,
  Tabs,
  Tab,
} from '@mui/material';
import {
  TrendingUp,
  Search,
  Refresh,
  ContentCopy,
  YouTube,
  Instagram,
  VideoLibrary,
} from '@mui/icons-material';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { useStore } from '../store/useStore';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

const Research: React.FC = () => {
  const { researchData, setResearchData } = useStore();
  const [tabValue, setTabValue] = useState(0);
  const [isResearching, setIsResearching] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState({
    tiktok: true,
    instagram: true,
    youtube: true,
  });

  const mockTrendingData = [
    { topic: 'AI Generated Art', mentions: 15420, engagement: 89.5, platforms: ['TikTok', 'Instagram'] },
    { topic: 'Time Travel Stories', mentions: 12350, engagement: 76.3, platforms: ['YouTube', 'TikTok'] },
    { topic: 'Mystery Box Reveals', mentions: 10890, engagement: 92.1, platforms: ['Instagram'] },
    { topic: 'Sci-Fi Short Films', mentions: 9560, engagement: 71.8, platforms: ['YouTube'] },
    { topic: 'Horror Animations', mentions: 8430, engagement: 85.2, platforms: ['TikTok'] },
  ];

  const chartData = [
    { date: 'Mon', tiktok: 450, instagram: 320, youtube: 280 },
    { date: 'Tue', tiktok: 520, instagram: 380, youtube: 310 },
    { date: 'Wed', tiktok: 480, instagram: 350, youtube: 330 },
    { date: 'Thu', tiktok: 590, instagram: 420, youtube: 360 },
    { date: 'Fri', tiktok: 610, instagram: 450, youtube: 390 },
    { date: 'Sat', tiktok: 680, instagram: 490, youtube: 420 },
    { date: 'Sun', tiktok: 720, instagram: 510, youtube: 450 },
  ];

  const generatedPrompts = [
    'A detective AI solves crimes in a cyberpunk city where memories can be stolen',
    'Time travelers accidentally create a paradox that makes everyone age backwards',
    'An artist discovers their paintings come to life at midnight',
    'A ghost falls in love with the new homeowner trying to exorcise them',
    'Children discover their toys are secretly protecting them from monsters',
  ];

  const handleStartResearch = async () => {
    setIsResearching(true);
    // Simulate research process
    await new Promise(resolve => setTimeout(resolve, 3000));
    setResearchData({
      trendingTopics: mockTrendingData.map(t => t.topic),
      contentAnalysis: mockTrendingData,
      generatedPrompts,
      lastUpdated: new Date(),
    });
    setIsResearching(false);
  };

  const handleCopyPrompt = (prompt: string) => {
    navigator.clipboard.writeText(prompt);
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'tiktok':
        return <VideoLibrary />;
      case 'instagram':
        return <Instagram />;
      case 'youtube':
        return <YouTube />;
      default:
        return <VideoLibrary />;
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">Research Dashboard</Typography>
        <Button
          variant="contained"
          startIcon={isResearching ? <Refresh /> : <Search />}
          onClick={handleStartResearch}
          disabled={isResearching}
        >
          {isResearching ? 'Researching...' : 'Start Research'}
        </Button>
      </Box>

      {isResearching && <LinearProgress sx={{ mb: 2 }} />}

      <Grid container spacing={3}>
        <Grid size={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Platform Selection
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={selectedPlatforms.tiktok}
                      onChange={(e) => setSelectedPlatforms({ ...selectedPlatforms, tiktok: e.target.checked })}
                    />
                  }
                  label="TikTok"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={selectedPlatforms.instagram}
                      onChange={(e) => setSelectedPlatforms({ ...selectedPlatforms, instagram: e.target.checked })}
                    />
                  }
                  label="Instagram"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={selectedPlatforms.youtube}
                      onChange={(e) => setSelectedPlatforms({ ...selectedPlatforms, youtube: e.target.checked })}
                    />
                  }
                  label="YouTube"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={12}>
          <Card>
            <CardContent>
              <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
                <Tab label="Trending Topics" />
                <Tab label="Content Analysis" />
                <Tab label="Generated Prompts" />
              </Tabs>

              <TabPanel value={tabValue} index={0}>
                <TableContainer component={Paper} variant="outlined">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Topic</TableCell>
                        <TableCell align="right">Mentions</TableCell>
                        <TableCell align="right">Engagement Rate</TableCell>
                        <TableCell>Platforms</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {mockTrendingData.map((row, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <TrendingUp color="primary" />
                              {row.topic}
                            </Box>
                          </TableCell>
                          <TableCell align="right">{row.mentions.toLocaleString()}</TableCell>
                          <TableCell align="right">
                            <Chip
                              label={`${row.engagement}%`}
                              color={row.engagement > 80 ? 'success' : 'default'}
                              size="small"
                            />
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                              {row.platforms.map((platform, idx) => (
                                <Chip
                                  key={idx}
                                  icon={getPlatformIcon(platform)}
                                  label={platform}
                                  size="small"
                                  variant="outlined"
                                />
                              ))}
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </TabPanel>

              <TabPanel value={tabValue} index={1}>
                <Grid container spacing={3}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Paper sx={{ p: 2 }}>
                      <Typography variant="h6" gutterBottom>
                        Platform Activity (7 Days)
                      </Typography>
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis dataKey="date" stroke="#888" />
                          <YAxis stroke="#888" />
                          <RechartsTooltip
                            contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333' }}
                          />
                          <Line type="monotone" dataKey="tiktok" stroke="#ff0050" strokeWidth={2} />
                          <Line type="monotone" dataKey="instagram" stroke="#833ab4" strokeWidth={2} />
                          <Line type="monotone" dataKey="youtube" stroke="#ff0000" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </Paper>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Paper sx={{ p: 2 }}>
                      <Typography variant="h6" gutterBottom>
                        Content Type Distribution
                      </Typography>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={[
                          { type: 'AI Art', count: 450 },
                          { type: 'Stories', count: 320 },
                          { type: 'Tutorials', count: 280 },
                          { type: 'Animations', count: 240 },
                          { type: 'Reviews', count: 180 },
                        ]}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis dataKey="type" stroke="#888" />
                          <YAxis stroke="#888" />
                          <RechartsTooltip
                            contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333' }}
                          />
                          <Bar dataKey="count" fill="#6366f1" />
                        </BarChart>
                      </ResponsiveContainer>
                    </Paper>
                  </Grid>
                </Grid>
              </TabPanel>

              <TabPanel value={tabValue} index={2}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {generatedPrompts.map((prompt, index) => (
                    <Paper key={index} sx={{ p: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="body1" sx={{ flex: 1 }}>
                          {prompt}
                        </Typography>
                        <IconButton onClick={() => handleCopyPrompt(prompt)} color="primary">
                          <ContentCopy />
                        </IconButton>
                      </Box>
                      <Box sx={{ mt: 1 }}>
                        <Chip label="High Potential" color="success" size="small" sx={{ mr: 1 }} />
                        <Chip label="Trending" size="small" sx={{ mr: 1 }} />
                        <Chip label="AI Theme" size="small" />
                      </Box>
                    </Paper>
                  ))}
                </Box>
              </TabPanel>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={12}>
          <Alert severity="info">
            Last research update: {researchData?.lastUpdated ? 
              new Date(researchData.lastUpdated).toLocaleString() : 
              'Never'
            }
          </Alert>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Research;