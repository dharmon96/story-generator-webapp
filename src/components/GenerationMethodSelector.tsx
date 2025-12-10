import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  alpha,
  useTheme,
} from '@mui/material';
import {
  CheckCircle,
  AccessTime,
} from '@mui/icons-material';
import {
  GenerationMethodId,
  GENERATION_METHODS,
} from '../types/generationMethods';

interface GenerationMethodSelectorProps {
  value: GenerationMethodId;
  onChange: (method: GenerationMethodId) => void;
  disabled?: boolean;
}

/**
 * Visual card-based selector for generation methods
 * Shows available video generation models as selectable cards with icons and descriptions
 */
const GenerationMethodSelector: React.FC<GenerationMethodSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const theme = useTheme();

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
        Generation Method
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Choose how your video will be generated
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 2,
        }}
      >
        {GENERATION_METHODS.map((method) => {
          const isSelected = value === method.id;
          const isDisabled = disabled || (!method.available && !method.comingSoon);

          return (
            <Card
              key={method.id}
              onClick={() => {
                if (!isDisabled && method.available) {
                  onChange(method.id);
                }
              }}
              sx={{
                cursor: method.available && !disabled ? 'pointer' : 'not-allowed',
                border: '2px solid',
                borderColor: isSelected
                  ? method.color
                  : alpha(theme.palette.divider, 0.3),
                bgcolor: isSelected
                  ? alpha(method.color, 0.08)
                  : 'background.paper',
                opacity: isDisabled ? 0.5 : 1,
                transition: 'all 0.2s ease-in-out',
                position: 'relative',
                overflow: 'visible',
                '&:hover': method.available && !disabled
                  ? {
                      borderColor: method.color,
                      transform: 'translateY(-2px)',
                      boxShadow: `0 4px 20px ${alpha(method.color, 0.25)}`,
                    }
                  : {},
              }}
            >
              {/* Selected indicator */}
              {isSelected && (
                <CheckCircle
                  sx={{
                    position: 'absolute',
                    top: -10,
                    right: -10,
                    color: method.color,
                    bgcolor: 'background.paper',
                    borderRadius: '50%',
                    fontSize: 24,
                  }}
                />
              )}

              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                {/* Icon/Emoji */}
                <Box
                  sx={{
                    width: 64,
                    height: 64,
                    borderRadius: 2,
                    bgcolor: alpha(method.color, 0.15),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mx: 'auto',
                    mb: 1.5,
                    color: method.color,
                  }}
                >
                  <Typography variant="h3" component="span">
                    {method.icon}
                  </Typography>
                </Box>

                {/* Name */}
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 600,
                    color: isSelected ? method.color : 'text.primary',
                    mb: 0.5,
                  }}
                >
                  {method.name}
                </Typography>

                {/* Pipeline type badge */}
                <Chip
                  size="small"
                  label={method.pipelineType === 'scene-based' ? 'Scene-Based' : 'Shot-Based'}
                  sx={{
                    mb: 1,
                    fontSize: '0.7rem',
                    height: 20,
                    bgcolor: alpha(method.color, 0.15),
                    color: method.color,
                  }}
                />

                {/* Description */}
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    fontSize: '0.75rem',
                    lineHeight: 1.4,
                    minHeight: 40,
                  }}
                >
                  {method.description}
                </Typography>

                {/* Features */}
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 0.5,
                    justifyContent: 'center',
                    mt: 1,
                  }}
                >
                  {method.features.multiShot && (
                    <Chip
                      size="small"
                      label={`Up to ${method.features.maxShots || 6} shots`}
                      variant="outlined"
                      sx={{ fontSize: '0.65rem', height: 18 }}
                    />
                  )}
                  {method.features.characterConsistency && (
                    <Chip
                      size="small"
                      label="Consistent chars"
                      variant="outlined"
                      sx={{ fontSize: '0.65rem', height: 18 }}
                    />
                  )}
                  <Chip
                    size="small"
                    label={`${method.features.maxDuration}s max`}
                    variant="outlined"
                    sx={{ fontSize: '0.65rem', height: 18 }}
                  />
                </Box>

                {/* Coming Soon badge */}
                {method.comingSoon && (
                  <Chip
                    size="small"
                    icon={<AccessTime sx={{ fontSize: 14 }} />}
                    label="Coming Soon"
                    sx={{
                      mt: 1,
                      fontSize: '0.7rem',
                      bgcolor: alpha(theme.palette.warning.main, 0.15),
                      color: theme.palette.warning.main,
                    }}
                  />
                )}
              </CardContent>
            </Card>
          );
        })}
      </Box>
    </Box>
  );
};

export default GenerationMethodSelector;
