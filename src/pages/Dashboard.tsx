import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  LinearProgress,
  Paper,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  AutoAwesome,
  Queue,
  TrendingUp,
  Speed,
  Refresh,
} from '@mui/icons-material';
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

interface DashboardStats {
  totalStories: number;
  storiesInQueue: number;
  storiesCompleted: number;
  averageGenerationTime: number;
  successRate: number;
  activeNodes: number;
  trendingTopics: string[];
}

const Dashboard: React.FC = () => {
  const [stats] = useState<DashboardStats>({
    totalStories: 42,
    storiesInQueue: 5,
    storiesCompleted: 37,
    averageGenerationTime: 12.5,
    successRate: 95.2,
    activeNodes: 3,
    trendingTopics: ['AI Art', 'Sci-Fi Adventures', 'Mystery Thrillers'],
  });

  const [loading, setLoading] = useState(false);

  const pieData = [
    { name: 'Completed', value: stats.storiesCompleted, color: '#10b981' },
    { name: 'In Queue', value: stats.storiesInQueue, color: '#f59e0b' },
    { name: 'Processing', value: stats.totalStories - stats.storiesCompleted - stats.storiesInQueue, color: '#3b82f6' },
  ];

  const lineData = [
    { day: 'Mon', stories: 4 },
    { day: 'Tue', stories: 6 },
    { day: 'Wed', stories: 8 },
    { day: 'Thu', stories: 5 },
    { day: 'Fri', stories: 9 },
    { day: 'Sat', stories: 7 },
    { day: 'Sun', stories: 8 },
  ];

  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
    }, 1000);
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" gutterBottom>
          Dashboard
        </Typography>
        <Tooltip title="Refresh">
          <IconButton onClick={handleRefresh} color="primary">
            <Refresh />
          </IconButton>
        </Tooltip>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Stats Cards */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr 1fr' }, gap: 3 }}>
          <Card sx={{ height: '100%', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <AutoAwesome sx={{ mr: 1 }} />
                <Typography variant="h6">Total Stories</Typography>
              </Box>
              <Typography variant="h3">{stats.totalStories}</Typography>
              <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
                All time generated
              </Typography>
            </CardContent>
          </Card>

          <Card sx={{ height: '100%', background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Queue sx={{ mr: 1 }} />
                <Typography variant="h6">Queue</Typography>
              </Box>
              <Typography variant="h3">{stats.storiesInQueue}</Typography>
              <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
                Waiting to process
              </Typography>
            </CardContent>
          </Card>

          <Card sx={{ height: '100%', background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Speed sx={{ mr: 1 }} />
                <Typography variant="h6">Avg Time</Typography>
              </Box>
              <Typography variant="h3">{stats.averageGenerationTime}m</Typography>
              <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
                Per story generation
              </Typography>
            </CardContent>
          </Card>

          <Card sx={{ height: '100%', background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <TrendingUp sx={{ mr: 1 }} />
                <Typography variant="h6">Success Rate</Typography>
              </Box>
              <Typography variant="h3">{stats.successRate}%</Typography>
              <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
                Completion rate
              </Typography>
            </CardContent>
          </Card>
        </Box>

        {/* Charts */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
          <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant="h6" gutterBottom>
              Story Generation Trend
            </Typography>
            <ResponsiveContainer width="100%" height="90%">
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="day" stroke="#888" />
                <YAxis stroke="#888" />
                <RechartsTooltip
                  contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333' }}
                />
                <Line type="monotone" dataKey="stories" stroke="#6366f1" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Paper>

          <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant="h6" gutterBottom>
              Story Status Distribution
            </Typography>
            <ResponsiveContainer width="100%" height="90%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={120}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip
                  contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Box>

        {/* Additional Info */}
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Trending Topics
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
            {stats.trendingTopics.map((topic, index) => (
              <Chip
                key={index}
                label={topic}
                color="primary"
                variant="outlined"
                icon={<TrendingUp />}
              />
            ))}
          </Box>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Active Processing Nodes
          </Typography>
          <Box sx={{ mt: 2 }}>
            <Typography variant="body1">
              {stats.activeNodes} nodes currently active
            </Typography>
            <LinearProgress
              variant="determinate"
              value={(stats.activeNodes / 5) * 100}
              sx={{ mt: 1, height: 10, borderRadius: 5 }}
            />
          </Box>
        </Paper>
      </Box>
    </Box>
  );
};

export default Dashboard;