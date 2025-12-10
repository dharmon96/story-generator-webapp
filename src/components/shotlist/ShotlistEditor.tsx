/**
 * Shotlist Editor Component
 *
 * Main editor for a single shotlist. Allows:
 * - Adding/removing/reordering shots
 * - Creating/managing groups with nesting
 * - Editing shotlist-level defaults
 * - Toggling workflow type per shot
 * - Queueing shots/groups/entire shotlist for rendering
 * - Viewing rendered output
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Tabs,
  Tab,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  Chip,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Menu,
  ListItemIcon,
  ListItemText,
  Badge,
} from '@mui/material';
import {
  Add,
  ArrowBack,
  PlayArrow,
  Settings,
  Videocam,
  Movie,
  Folder,
  Queue as QueueIcon,
  CheckCircle,
  Schedule,
  Error as ErrorIcon,
  MoreVert,
  CreateNewFolder,
  Delete,
  SelectAll,
  ClearAll,
} from '@mui/icons-material';
import { useStore } from '../../store/useStore';
import {
  Shotlist,
  ShotlistShot,
  ShotlistGroup,
  WorkflowType,
  createNewShot,
  createNewGroup,
  calculateShotlistStats,
  GROUP_COLORS,
} from '../../types/shotlistTypes';
import { GENERATION_METHODS, GenerationMethodId } from '../../types/generationMethods';
import ShotItem from './ShotItem';
import ShotGroup from './ShotGroup';

interface ShotlistEditorProps {
  shotlistId: string;
  onBack: () => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

const ShotlistEditor: React.FC<ShotlistEditorProps> = ({ shotlistId, onBack }) => {
  const {
    shotlists,
    updateShotlist,
    addShotToShotlist,
    updateShot,
    deleteShot,
    reorderShots,
    addGroupToShotlist,
    updateGroup,
    deleteGroup,
    moveShotToGroup,
    queueShotlistShot,
    queueShotlistGroup,
    queueAllShotlistShots,
  } = useStore();

  const shotlist = shotlists.find((sl) => sl.id === shotlistId);

  const [activeTab, setActiveTab] = useState(0);
  const [selectedShots, setSelectedShots] = useState<Set<string>>(new Set());
  const [createGroupDialogOpen, setCreateGroupDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState(GROUP_COLORS[0].color);
  const [newGroupParent, setNewGroupParent] = useState<string | undefined>(undefined);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [bulkMenuAnchor, setBulkMenuAnchor] = useState<HTMLElement | null>(null);

  // Calculate stats
  const stats = useMemo(() => {
    if (!shotlist) return { total: 0, completed: 0, rendering: 0, queued: 0, pending: 0, failed: 0 };
    return calculateShotlistStats(shotlist.shots);
  }, [shotlist]);

  // Get shots organized by groups
  const organizedShots = useMemo(() => {
    if (!shotlist) return { ungrouped: [], groups: new Map<string, ShotlistShot[]>() };

    const ungrouped: ShotlistShot[] = [];
    const groups = new Map<string, ShotlistShot[]>();

    // Initialize groups
    shotlist.groups.forEach((g) => groups.set(g.id, []));

    // Sort shots into groups
    const sortedShots = [...shotlist.shots].sort((a, b) => a.order - b.order);
    sortedShots.forEach((shot) => {
      if (shot.groupId && groups.has(shot.groupId)) {
        groups.get(shot.groupId)!.push(shot);
      } else {
        ungrouped.push(shot);
      }
    });

    return { ungrouped, groups };
  }, [shotlist]);

  // Get nested group structure
  const groupHierarchy = useMemo(() => {
    if (!shotlist) return [];

    const sortedGroups = [...shotlist.groups].sort((a, b) => a.order - b.order);
    const rootGroups = sortedGroups.filter((g) => !g.parentGroupId);

    const buildTree = (parentId?: string): (ShotlistGroup & { children: any[] })[] => {
      return sortedGroups
        .filter((g) => g.parentGroupId === parentId)
        .map((g) => ({
          ...g,
          children: buildTree(g.id),
        }));
    };

    return buildTree(undefined);
  }, [shotlist]);

  // Handle add shot
  const handleAddShot = useCallback(
    (groupId?: string) => {
      if (!shotlist) return;

      const newShot = addShotToShotlist(shotlistId, {
        groupId,
        workflowType: shotlist.defaultWorkflowType,
        generationMethod: shotlist.defaultGenerationMethod,
        negativePrompt: shotlist.defaultNegativePrompt,
        settings: { ...shotlist.defaultSettings },
      });

      return newShot;
    },
    [shotlist, shotlistId, addShotToShotlist]
  );

  // Handle create group
  const handleCreateGroup = () => {
    if (!shotlist) return;

    addGroupToShotlist(shotlistId, {
      name: newGroupName || 'New Group',
      color: newGroupColor,
      parentGroupId: newGroupParent,
    });

    setNewGroupName('');
    setNewGroupColor(GROUP_COLORS[0].color);
    setNewGroupParent(undefined);
    setCreateGroupDialogOpen(false);
  };

  // Handle shot selection
  const handleSelectShot = (shotId: string, selected: boolean) => {
    const newSelection = new Set(selectedShots);
    if (selected) {
      newSelection.add(shotId);
    } else {
      newSelection.delete(shotId);
    }
    setSelectedShots(newSelection);
  };

  // Handle select all
  const handleSelectAll = () => {
    if (!shotlist) return;
    setSelectedShots(new Set(shotlist.shots.map((s) => s.id)));
  };

  // Handle clear selection
  const handleClearSelection = () => {
    setSelectedShots(new Set());
  };

  // Handle bulk delete
  const handleBulkDelete = () => {
    if (!shotlist) return;
    selectedShots.forEach((shotId) => {
      deleteShot(shotlistId, shotId);
    });
    setSelectedShots(new Set());
    setBulkMenuAnchor(null);
  };

  // Handle bulk move to group
  const handleBulkMoveToGroup = (groupId: string | undefined) => {
    selectedShots.forEach((shotId) => {
      moveShotToGroup(shotlistId, shotId, groupId);
    });
    setBulkMenuAnchor(null);
  };

  // Handle queue selected shots
  const handleQueueSelected = () => {
    selectedShots.forEach((shotId) => {
      queueShotlistShot(shotlistId, shotId);
    });
    setSelectedShots(new Set());
    setBulkMenuAnchor(null);
  };

  // Handle queue all shots
  const handleQueueAll = () => {
    queueAllShotlistShots(shotlistId);
  };

  // Handle queue group
  const handleQueueGroup = (groupId: string) => {
    queueShotlistGroup(shotlistId, groupId);
  };

  if (!shotlist) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Shotlist not found</Alert>
        <Button startIcon={<ArrowBack />} onClick={onBack} sx={{ mt: 2 }}>
          Back to Shotlists
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Paper sx={{ p: 2, borderRadius: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <IconButton onClick={onBack}>
            <ArrowBack />
          </IconButton>

          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" fontWeight="bold">
              {shotlist.title}
            </Typography>
            {shotlist.description && (
              <Typography variant="body2" color="text.secondary">
                {shotlist.description}
              </Typography>
            )}
          </Box>

          {/* Quick Stats */}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Chip
              icon={<Videocam />}
              label={`${stats.total} shots`}
              variant="outlined"
            />
            <Chip
              icon={<CheckCircle />}
              label={`${stats.completed} done`}
              color="success"
              variant={stats.completed > 0 ? 'filled' : 'outlined'}
            />
            {stats.rendering > 0 && (
              <Chip icon={<Movie />} label={`${stats.rendering} rendering`} color="primary" />
            )}
            {stats.queued > 0 && (
              <Chip icon={<Schedule />} label={`${stats.queued} queued`} color="warning" />
            )}
            {stats.failed > 0 && (
              <Chip icon={<ErrorIcon />} label={`${stats.failed} failed`} color="error" />
            )}
          </Box>

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <IconButton onClick={() => setSettingsDialogOpen(true)}>
              <Settings />
            </IconButton>
            <Button
              variant="contained"
              startIcon={<PlayArrow />}
              onClick={handleQueueAll}
              disabled={stats.pending === 0}
            >
              Queue All
            </Button>
          </Box>
        </Box>

        {/* Tabs */}
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab label="Shots" icon={<Videocam />} iconPosition="start" />
          <Tab label="Settings" icon={<Settings />} iconPosition="start" />
        </Tabs>
      </Paper>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {/* Shots Tab */}
        <TabPanel value={activeTab} index={0}>
          {/* Toolbar */}
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Button variant="contained" startIcon={<Add />} onClick={() => handleAddShot()}>
              Add Shot
            </Button>
            <Button
              variant="outlined"
              startIcon={<CreateNewFolder />}
              onClick={() => setCreateGroupDialogOpen(true)}
            >
              New Group
            </Button>

            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

            {selectedShots.size > 0 ? (
              <>
                <Chip
                  label={`${selectedShots.size} selected`}
                  onDelete={handleClearSelection}
                  color="primary"
                />
                <Button
                  size="small"
                  startIcon={<MoreVert />}
                  onClick={(e) => setBulkMenuAnchor(e.currentTarget)}
                >
                  Actions
                </Button>
              </>
            ) : (
              <Button size="small" startIcon={<SelectAll />} onClick={handleSelectAll}>
                Select All
              </Button>
            )}
          </Box>

          {/* Shots List */}
          {shotlist.shots.length === 0 ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              No shots yet. Click "Add Shot" to create your first shot.
            </Alert>
          ) : (
            <Box>
              {/* Render groups with their shots */}
              {groupHierarchy.map((group) => (
                <ShotGroup
                  key={group.id}
                  group={group}
                  shots={organizedShots.groups.get(group.id) || []}
                  allGroups={shotlist.groups}
                  childGroups={group.children}
                  selectedShots={selectedShots}
                  onSelectShot={handleSelectShot}
                  onUpdateGroup={(updates) => updateGroup(shotlistId, group.id, updates)}
                  onDeleteGroup={(deleteShots) => deleteGroup(shotlistId, group.id, deleteShots)}
                  onAddShot={() => handleAddShot(group.id)}
                  onQueueGroup={() => handleQueueGroup(group.id)}
                  onQueueShot={(shotId) => queueShotlistShot(shotlistId, shotId)}
                  onUpdateShot={(shotId, updates) => updateShot(shotlistId, shotId, updates)}
                  onDeleteShot={(shotId) => deleteShot(shotlistId, shotId)}
                  onMoveShot={(shotId, groupId) => moveShotToGroup(shotlistId, shotId, groupId)}
                  defaultSettings={shotlist.defaultSettings}
                  defaultWorkflowType={shotlist.defaultWorkflowType}
                  defaultGenerationMethod={shotlist.defaultGenerationMethod}
                />
              ))}

              {/* Ungrouped shots */}
              {organizedShots.ungrouped.length > 0 && (
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
                    Ungrouped Shots ({organizedShots.ungrouped.length})
                  </Typography>
                  {organizedShots.ungrouped.map((shot) => (
                    <ShotItem
                      key={shot.id}
                      shot={shot}
                      selected={selectedShots.has(shot.id)}
                      onSelect={(selected) => handleSelectShot(shot.id, selected)}
                      onUpdate={(updates) => updateShot(shotlistId, shot.id, updates)}
                      onDelete={() => deleteShot(shotlistId, shot.id)}
                      onMoveToGroup={(groupId) => moveShotToGroup(shotlistId, shot.id, groupId)}
                      onQueue={() => queueShotlistShot(shotlistId, shot.id)}
                      availableGroups={shotlist.groups}
                      defaultSettings={shotlist.defaultSettings}
                    />
                  ))}
                </Paper>
              )}
            </Box>
          )}
        </TabPanel>

        {/* Settings Tab */}
        <TabPanel value={activeTab} index={1}>
          <Paper sx={{ p: 3, maxWidth: 600 }}>
            <Typography variant="h6" gutterBottom>
              Shotlist Defaults
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              These settings are used as defaults for new shots.
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <TextField
                label="Title"
                value={shotlist.title}
                onChange={(e) => updateShotlist(shotlistId, { title: e.target.value })}
                fullWidth
              />

              <TextField
                label="Description"
                value={shotlist.description || ''}
                onChange={(e) => updateShotlist(shotlistId, { description: e.target.value })}
                multiline
                rows={2}
                fullWidth
              />

              <FormControl fullWidth>
                <InputLabel>Default Workflow Type</InputLabel>
                <Select
                  value={shotlist.defaultWorkflowType}
                  label="Default Workflow Type"
                  onChange={(e) =>
                    updateShotlist(shotlistId, {
                      defaultWorkflowType: e.target.value as WorkflowType,
                    })
                  }
                >
                  <MenuItem value="shot">Shot-based (Positive/Negative prompts)</MenuItem>
                  <MenuItem value="scene">Scene-based (Global caption + cuts)</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel>Default Generation Method</InputLabel>
                <Select
                  value={shotlist.defaultGenerationMethod}
                  label="Default Generation Method"
                  onChange={(e) =>
                    updateShotlist(shotlistId, {
                      defaultGenerationMethod: e.target.value as GenerationMethodId,
                    })
                  }
                >
                  {GENERATION_METHODS.map((method) => (
                    <MenuItem key={method.id} value={method.id}>
                      {method.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                label="Default Negative Prompt"
                value={shotlist.defaultNegativePrompt}
                onChange={(e) =>
                  updateShotlist(shotlistId, { defaultNegativePrompt: e.target.value })
                }
                multiline
                rows={3}
                fullWidth
              />

              <Divider />

              <Typography variant="subtitle2">Default Render Settings</Typography>

              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label="Frames"
                  type="number"
                  value={shotlist.defaultSettings.numFrames}
                  onChange={(e) =>
                    updateShotlist(shotlistId, {
                      defaultSettings: {
                        ...shotlist.defaultSettings,
                        numFrames: parseInt(e.target.value) || 81,
                      },
                    })
                  }
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="FPS"
                  type="number"
                  value={shotlist.defaultSettings.fps}
                  onChange={(e) =>
                    updateShotlist(shotlistId, {
                      defaultSettings: {
                        ...shotlist.defaultSettings,
                        fps: parseInt(e.target.value) || 24,
                      },
                    })
                  }
                  sx={{ flex: 1 }}
                />
              </Box>

              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label="Steps"
                  type="number"
                  value={shotlist.defaultSettings.steps}
                  onChange={(e) =>
                    updateShotlist(shotlistId, {
                      defaultSettings: {
                        ...shotlist.defaultSettings,
                        steps: parseInt(e.target.value) || 20,
                      },
                    })
                  }
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="CFG"
                  type="number"
                  value={shotlist.defaultSettings.cfg}
                  onChange={(e) =>
                    updateShotlist(shotlistId, {
                      defaultSettings: {
                        ...shotlist.defaultSettings,
                        cfg: parseFloat(e.target.value) || 7,
                      },
                    })
                  }
                  sx={{ flex: 1 }}
                />
              </Box>

              <FormControl fullWidth>
                <InputLabel>Resolution</InputLabel>
                <Select
                  value={shotlist.defaultSettings.resolution}
                  label="Resolution"
                  onChange={(e) =>
                    updateShotlist(shotlistId, {
                      defaultSettings: {
                        ...shotlist.defaultSettings,
                        resolution: e.target.value,
                      },
                    })
                  }
                >
                  <MenuItem value="1280x720">1280x720 (720p)</MenuItem>
                  <MenuItem value="1920x1080">1920x1080 (1080p)</MenuItem>
                  <MenuItem value="854x480">854x480 (480p)</MenuItem>
                  <MenuItem value="512x512">512x512 (Square)</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Paper>
        </TabPanel>
      </Box>

      {/* Create Group Dialog */}
      <Dialog
        open={createGroupDialogOpen}
        onClose={() => setCreateGroupDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create New Group</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Group Name"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              fullWidth
              autoFocus
            />

            <FormControl fullWidth>
              <InputLabel>Color</InputLabel>
              <Select
                value={newGroupColor}
                label="Color"
                onChange={(e) => setNewGroupColor(e.target.value)}
              >
                {GROUP_COLORS.map((colorObj) => (
                  <MenuItem key={colorObj.id} value={colorObj.color}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 20,
                          height: 20,
                          borderRadius: 1,
                          bgcolor: colorObj.color,
                        }}
                      />
                      {colorObj.name}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Parent Group (optional)</InputLabel>
              <Select
                value={newGroupParent || ''}
                label="Parent Group (optional)"
                onChange={(e) => setNewGroupParent(e.target.value || undefined)}
              >
                <MenuItem value="">None (root level)</MenuItem>
                {shotlist.groups.map((g) => (
                  <MenuItem key={g.id} value={g.id}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          bgcolor: g.color,
                        }}
                      />
                      {g.name}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateGroupDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateGroup}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Actions Menu */}
      <Menu
        anchorEl={bulkMenuAnchor}
        open={Boolean(bulkMenuAnchor)}
        onClose={() => setBulkMenuAnchor(null)}
      >
        <MenuItem onClick={handleQueueSelected}>
          <ListItemIcon>
            <PlayArrow fontSize="small" />
          </ListItemIcon>
          <ListItemText>Queue Selected</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => handleBulkMoveToGroup(undefined)}>
          <ListItemIcon>
            <ClearAll fontSize="small" />
          </ListItemIcon>
          <ListItemText>Remove from Group</ListItemText>
        </MenuItem>
        {shotlist.groups.map((g) => (
          <MenuItem key={g.id} onClick={() => handleBulkMoveToGroup(g.id)}>
            <ListItemIcon>
              <Folder fontSize="small" sx={{ color: g.color }} />
            </ListItemIcon>
            <ListItemText>Move to {g.name}</ListItemText>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={handleBulkDelete}>
          <ListItemIcon>
            <Delete fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>Delete Selected</ListItemText>
        </MenuItem>
      </Menu>

      {/* Settings Dialog (Quick access) */}
      <Dialog
        open={settingsDialogOpen}
        onClose={() => setSettingsDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Quick Settings</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Title"
              value={shotlist.title}
              onChange={(e) => updateShotlist(shotlistId, { title: e.target.value })}
              fullWidth
            />
            <TextField
              label="Description"
              value={shotlist.description || ''}
              onChange={(e) => updateShotlist(shotlistId, { description: e.target.value })}
              multiline
              rows={2}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ShotlistEditor;
