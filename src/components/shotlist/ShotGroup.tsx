/**
 * Shot Group Component
 *
 * Displays a group of shots with:
 * - Collapsible container
 * - Color coding
 * - Nested child groups
 * - Batch actions (queue all, delete all)
 * - Group-level defaults
 */

import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Collapse,
  Chip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  ExpandMore,
  ExpandLess,
  Folder,
  FolderOpen,
  Add,
  Delete,
  PlayArrow,
  MoreVert,
  Edit,
  ColorLens,
  DragIndicator,
  CheckCircle,
  Schedule,
  Movie,
} from '@mui/icons-material';
import {
  ShotlistShot,
  ShotlistGroup as ShotlistGroupType,
  WorkflowType,
  calculateShotlistStats,
  GROUP_COLORS,
} from '../../types/shotlistTypes';
import { GenerationMethodId } from '../../types/generationMethods';
import ShotItem from './ShotItem';

interface ShotGroupProps {
  group: ShotlistGroupType & { children: any[] };
  shots: ShotlistShot[];
  allGroups: ShotlistGroupType[];
  childGroups: (ShotlistGroupType & { children: any[] })[];
  selectedShots: Set<string>;
  onSelectShot: (shotId: string, selected: boolean) => void;
  onUpdateGroup: (updates: Partial<ShotlistGroupType>) => void;
  onDeleteGroup: (deleteShots: boolean) => void;
  onAddShot: () => void;
  onQueueGroup: () => void;
  onQueueShot: (shotId: string) => void;
  onUpdateShot: (shotId: string, updates: Partial<ShotlistShot>) => void;
  onDeleteShot: (shotId: string) => void;
  onMoveShot: (shotId: string, groupId: string | undefined) => void;
  defaultSettings: {
    numFrames: number;
    fps: number;
    resolution: string;
    steps: number;
    cfg: number;
  };
  defaultWorkflowType: WorkflowType;
  defaultGenerationMethod: GenerationMethodId;
  depth?: number;
}

const ShotGroup: React.FC<ShotGroupProps> = ({
  group,
  shots,
  allGroups,
  childGroups,
  selectedShots,
  onSelectShot,
  onUpdateGroup,
  onDeleteGroup,
  onAddShot,
  onQueueGroup,
  onQueueShot,
  onUpdateShot,
  onDeleteShot,
  onMoveShot,
  defaultSettings,
  defaultWorkflowType,
  defaultGenerationMethod,
  depth = 0,
}) => {
  const [collapsed, setCollapsed] = useState(group.collapsed);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editedName, setEditedName] = useState(group.name);
  const [editedColor, setEditedColor] = useState(group.color);

  // Calculate group stats
  const stats = calculateShotlistStats(shots);
  const totalInGroup = shots.length + childGroups.reduce((sum, cg) => sum + (cg.children?.length || 0), 0);

  // Handle collapse toggle
  const handleToggleCollapse = () => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    onUpdateGroup({ collapsed: newCollapsed });
  };

  // Handle save edit
  const handleSaveEdit = () => {
    onUpdateGroup({ name: editedName, color: editedColor });
    setEditDialogOpen(false);
  };

  // Handle delete confirmation
  const handleConfirmDelete = (deleteShots: boolean) => {
    onDeleteGroup(deleteShots);
    setDeleteDialogOpen(false);
  };

  // Get child groups' shots (for nested rendering)
  const getChildGroupShots = (childGroupId: string): ShotlistShot[] => {
    // This would need to be passed down properly in a real implementation
    return [];
  };

  return (
    <Paper
      sx={{
        mb: 2,
        ml: depth * 3,
        borderLeft: `4px solid ${group.color}`,
        bgcolor: 'background.paper',
      }}
    >
      {/* Group Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1.5,
          bgcolor: `${group.color}10`,
          cursor: 'pointer',
        }}
        onClick={handleToggleCollapse}
      >
        {/* Drag Handle */}
        <IconButton size="small" sx={{ cursor: 'grab' }} onClick={(e) => e.stopPropagation()}>
          <DragIndicator fontSize="small" />
        </IconButton>

        {/* Folder Icon */}
        {collapsed ? (
          <Folder sx={{ color: group.color }} />
        ) : (
          <FolderOpen sx={{ color: group.color }} />
        )}

        {/* Group Name */}
        <Typography variant="subtitle1" fontWeight="medium" sx={{ flex: 1 }}>
          {group.name}
        </Typography>

        {/* Stats */}
        <Chip label={`${shots.length} shots`} size="small" variant="outlined" />
        {stats.completed > 0 && (
          <Chip
            icon={<CheckCircle />}
            label={stats.completed}
            size="small"
            color="success"
            variant="outlined"
          />
        )}
        {stats.rendering > 0 && (
          <Chip icon={<Movie />} label={stats.rendering} size="small" color="primary" />
        )}
        {stats.queued > 0 && (
          <Chip icon={<Schedule />} label={stats.queued} size="small" color="warning" />
        )}

        {/* Expand/Collapse */}
        <IconButton size="small">
          {collapsed ? <ExpandMore /> : <ExpandLess />}
        </IconButton>

        {/* Menu */}
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            setMenuAnchor(e.currentTarget);
          }}
        >
          <MoreVert />
        </IconButton>
      </Box>

      {/* Group Content */}
      <Collapse in={!collapsed}>
        <Box sx={{ p: 2 }}>
          {/* Action Bar */}
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Button size="small" startIcon={<Add />} onClick={onAddShot} variant="outlined">
              Add Shot
            </Button>
            <Button
              size="small"
              startIcon={<PlayArrow />}
              onClick={onQueueGroup}
              variant="contained"
              disabled={stats.pending === 0}
            >
              Queue All ({stats.pending})
            </Button>
          </Box>

          {/* Shots */}
          {shots.length === 0 && childGroups.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              No shots in this group. Click "Add Shot" to create one.
            </Typography>
          ) : (
            <>
              {/* Render shots */}
              {shots.map((shot) => (
                <ShotItem
                  key={shot.id}
                  shot={shot}
                  selected={selectedShots.has(shot.id)}
                  onSelect={(selected) => onSelectShot(shot.id, selected)}
                  onUpdate={(updates) => onUpdateShot(shot.id, updates)}
                  onDelete={() => onDeleteShot(shot.id)}
                  onMoveToGroup={onMoveShot.bind(null, shot.id)}
                  onQueue={() => onQueueShot(shot.id)}
                  availableGroups={allGroups.filter((g) => g.id !== group.id)}
                  defaultSettings={defaultSettings}
                />
              ))}

              {/* Render nested groups */}
              {childGroups.map((childGroup) => (
                <ShotGroup
                  key={childGroup.id}
                  group={childGroup}
                  shots={getChildGroupShots(childGroup.id)}
                  allGroups={allGroups}
                  childGroups={childGroup.children || []}
                  selectedShots={selectedShots}
                  onSelectShot={onSelectShot}
                  onUpdateGroup={(updates) => {
                    // Would need proper callback handling
                    console.log('Update child group:', childGroup.id, updates);
                  }}
                  onDeleteGroup={(deleteShots) => {
                    console.log('Delete child group:', childGroup.id, deleteShots);
                  }}
                  onAddShot={() => {
                    console.log('Add shot to child group:', childGroup.id);
                  }}
                  onQueueGroup={() => {
                    console.log('Queue child group:', childGroup.id);
                  }}
                  onQueueShot={onQueueShot}
                  onUpdateShot={onUpdateShot}
                  onDeleteShot={onDeleteShot}
                  onMoveShot={onMoveShot}
                  defaultSettings={defaultSettings}
                  defaultWorkflowType={defaultWorkflowType}
                  defaultGenerationMethod={defaultGenerationMethod}
                  depth={depth + 1}
                />
              ))}
            </>
          )}
        </Box>
      </Collapse>

      {/* Context Menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            setEditDialogOpen(true);
            setMenuAnchor(null);
          }}
        >
          <ListItemIcon>
            <Edit fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit Group</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            onAddShot();
            setMenuAnchor(null);
          }}
        >
          <ListItemIcon>
            <Add fontSize="small" />
          </ListItemIcon>
          <ListItemText>Add Shot</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            onQueueGroup();
            setMenuAnchor(null);
          }}
          disabled={stats.pending === 0}
        >
          <ListItemIcon>
            <PlayArrow fontSize="small" />
          </ListItemIcon>
          <ListItemText>Queue All Shots</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            setDeleteDialogOpen(true);
            setMenuAnchor(null);
          }}
        >
          <ListItemIcon>
            <Delete fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>Delete Group</ListItemText>
        </MenuItem>
      </Menu>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Group</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Group Name"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              fullWidth
              autoFocus
            />
            <FormControl fullWidth>
              <InputLabel>Color</InputLabel>
              <Select
                value={editedColor}
                label="Color"
                onChange={(e) => setEditedColor(e.target.value)}
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
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEdit}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Group?</DialogTitle>
        <DialogContent>
          <Typography variant="body1" gutterBottom>
            What would you like to do with the {shots.length} shot{shots.length !== 1 ? 's' : ''} in
            this group?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={() => handleConfirmDelete(false)} variant="outlined">
            Keep Shots (Ungroup)
          </Button>
          <Button onClick={() => handleConfirmDelete(true)} variant="contained" color="error">
            Delete All
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default ShotGroup;
