import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  AutoAwesomeMotion as GeneratorIcon,
  Queue as QueueIcon,
  TrendingUp as ResearchIcon,
  Analytics as MetricsIcon,
  Settings as SettingsIcon,
  ChevronLeft as ChevronLeftIcon,
  Movie as RenderQueueIcon,
} from '@mui/icons-material';

const drawerWidth = 260;

interface LayoutProps {
  children: React.ReactNode;
}

const menuItems = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
  { text: 'Story Generator', icon: <GeneratorIcon />, path: '/generator' },
  { text: 'Story Queue', icon: <QueueIcon />, path: '/queue' },
  { text: 'Render Queue', icon: <RenderQueueIcon />, path: '/render-queue' },
  { text: 'Research', icon: <ResearchIcon />, path: '/research' },
  { text: 'Metrics', icon: <MetricsIcon />, path: '/metrics' },
  { text: 'Settings', icon: <SettingsIcon />, path: '/settings' },
];

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [open, setOpen] = useState(!isMobile);

  const handleDrawerToggle = () => {
    setOpen(!open);
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    if (isMobile) {
      setOpen(false);
    }
  };

  return (
    <Box sx={{ display: 'flex' }}>
      {/* Floating Menu Button - Only show when sidebar is closed */}
      {!open && (
        <IconButton
          onClick={handleDrawerToggle}
          sx={{
            position: 'fixed',
            top: 20,
            left: 10,
            zIndex: theme.zIndex.drawer + 1,
            backgroundColor: theme.palette.primary.main,
            color: 'white',
            '&:hover': {
              backgroundColor: theme.palette.primary.dark,
            },
            boxShadow: theme.shadows[4],
          }}
        >
          <MenuIcon />
        </IconButton>
      )}
      
      <Drawer
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            borderRight: `1px solid ${theme.palette.divider}`,
          },
        }}
        variant={isMobile ? 'temporary' : 'persistent'}
        anchor="left"
        open={open}
        onClose={handleDrawerToggle}
      >
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" noWrap component="div" sx={{ color: 'white', fontWeight: 'bold' }}>
            AI Story Generator
          </Typography>
          <IconButton
            onClick={handleDrawerToggle}
            sx={{ color: 'white' }}
          >
            {open ? <ChevronLeftIcon /> : <MenuIcon />}
          </IconButton>
        </Box>
        <Divider sx={{ backgroundColor: 'rgba(255,255,255,0.2)' }} />
        <Box sx={{ overflow: 'auto' }}>
          <List>
            {menuItems.map((item) => (
              <ListItem key={item.text} disablePadding>
                <ListItemButton
                  selected={location.pathname === item.path}
                  onClick={() => handleNavigate(item.path)}
                  sx={{
                    '&.Mui-selected': {
                      backgroundColor: 'rgba(255,255,255,0.2)',
                      borderLeft: '3px solid white',
                    },
                    '&:hover': {
                      backgroundColor: 'rgba(255,255,255,0.1)',
                    },
                    color: 'white',
                  }}
                >
                  <ListItemIcon sx={{ color: 'white' }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText primary={item.text} sx={{ color: 'white' }} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          bgcolor: 'background.default',
          p: 3,
          width: { md: `calc(100% - ${open ? drawerWidth : 0}px)` },
          ml: { md: open ? 0 : `-${drawerWidth}px` },
          transition: theme.transitions.create(['margin', 'width'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        {children}
      </Box>
    </Box>
  );
};

export default Layout;