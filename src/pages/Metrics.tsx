import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Paper,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
} from '@mui/material';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';

const Metrics: React.FC = () => {
  const [timeRange, setTimeRange] = useState('7d');

  const performanceData = [
    { date: 'Mon', stories: 8, avgTime: 12.5, success: 95 },
    { date: 'Tue', stories: 12, avgTime: 11.8, success: 92 },
    { date: 'Wed', stories: 10, avgTime: 13.2, success: 90 },
    { date: 'Thu', stories: 15, avgTime: 10.5, success: 97 },
    { date: 'Fri', stories: 18, avgTime: 11.2, success: 94 },
    { date: 'Sat', stories: 14, avgTime: 12.8, success: 93 },
    { date: 'Sun', stories: 16, avgTime: 11.5, success: 96 },
  ];

  const genreDistribution = [
    { genre: 'Sci-Fi', count: 25, color: '#6366f1' },
    { genre: 'Drama', count: 20, color: '#8b5cf6' },
    { genre: 'Comedy', count: 18, color: '#ec4899' },
    { genre: 'Thriller', count: 15, color: '#f43f5e' },
    { genre: 'Horror', count: 12, color: '#ef4444' },
    { genre: 'Mystery', count: 10, color: '#f59e0b' },
  ];

  const nodePerformance = [
    { node: 'Node 1', tasks: 45, avgTime: 10.2, successRate: 98, load: 75 },
    { node: 'Node 2', tasks: 38, avgTime: 11.5, successRate: 95, load: 62 },
    { node: 'Node 3', tasks: 42, avgTime: 10.8, successRate: 96, load: 70 },
    { node: 'ComfyUI 1', tasks: 28, avgTime: 25.3, successRate: 92, load: 85 },
  ];

  const qualityMetrics = [
    { metric: 'Story Quality', value: 85 },
    { metric: 'Shot Composition', value: 78 },
    { metric: 'Visual Consistency', value: 82 },
    { metric: 'Narration Quality', value: 90 },
    { metric: 'Music Selection', value: 75 },
    { metric: 'Overall Rating', value: 82 },
  ];

  const topStories = [
    { title: 'The Last Algorithm', genre: 'Sci-Fi', views: 15420, rating: 4.8 },
    { title: 'Echoes of Tomorrow', genre: 'Drama', views: 12350, rating: 4.6 },
    { title: 'Digital Dreams', genre: 'Mystery', views: 10890, rating: 4.7 },
    { title: 'Neural Networks', genre: 'Thriller', views: 9560, rating: 4.5 },
    { title: 'AI Awakening', genre: 'Sci-Fi', views: 8430, rating: 4.9 },
  ];

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">Analytics & Metrics</Typography>
        <FormControl sx={{ minWidth: 120 }}>
          <InputLabel>Time Range</InputLabel>
          <Select
            value={timeRange}
            label="Time Range"
            onChange={(e) => setTimeRange(e.target.value)}
            size="small"
          >
            <MenuItem value="24h">24 Hours</MenuItem>
            <MenuItem value="7d">7 Days</MenuItem>
            <MenuItem value="30d">30 Days</MenuItem>
            <MenuItem value="90d">90 Days</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Generation Performance
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="date" stroke="#888" />
                <YAxis yAxisId="left" stroke="#888" />
                <YAxis yAxisId="right" orientation="right" stroke="#888" />
                <RechartsTooltip
                  contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333' }}
                />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="stories"
                  stroke="#6366f1"
                  strokeWidth={2}
                  name="Stories Generated"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="avgTime"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="Avg Time (min)"
                />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Genre Distribution
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={genreDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.genre}: ${entry.count}`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {genreDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip
                  contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Quality Metrics
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={qualityMetrics}>
                <PolarGrid stroke="#333" />
                <PolarAngleAxis dataKey="metric" stroke="#888" />
                <PolarRadiusAxis stroke="#888" />
                <Radar
                  name="Quality Score"
                  dataKey="value"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.6}
                />
                <RechartsTooltip
                  contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333' }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Success Rate Trend
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="date" stroke="#888" />
                <YAxis stroke="#888" />
                <RechartsTooltip
                  contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333' }}
                />
                <Bar dataKey="success" fill="#10b981" name="Success Rate (%)" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid size={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Node Performance
              </Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Node</TableCell>
                      <TableCell align="right">Tasks Completed</TableCell>
                      <TableCell align="right">Avg Time (min)</TableCell>
                      <TableCell align="right">Success Rate</TableCell>
                      <TableCell align="right">Current Load</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {nodePerformance.map((node) => (
                      <TableRow key={node.node}>
                        <TableCell>{node.node}</TableCell>
                        <TableCell align="right">{node.tasks}</TableCell>
                        <TableCell align="right">{node.avgTime}</TableCell>
                        <TableCell align="right">
                          <Chip
                            label={`${node.successRate}%`}
                            color={node.successRate > 95 ? 'success' : 'warning'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Chip
                            label={`${node.load}%`}
                            color={node.load > 80 ? 'error' : node.load > 60 ? 'warning' : 'success'}
                            size="small"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Top Performing Stories
              </Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Title</TableCell>
                      <TableCell>Genre</TableCell>
                      <TableCell align="right">Views</TableCell>
                      <TableCell align="right">Rating</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topStories.map((story, index) => (
                      <TableRow key={index}>
                        <TableCell>{story.title}</TableCell>
                        <TableCell>
                          <Chip label={story.genre} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell align="right">{story.views.toLocaleString()}</TableCell>
                        <TableCell align="right">
                          <Chip
                            label={`★ ${story.rating}`}
                            color="primary"
                            size="small"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Metrics;