// Pea design system — colors and typography tokens.
// Design rules: no red failure states, calm and warm, serif display type.

export const P = {
  green:      '#4a7c59',
  greenLight: '#e8f2eb',
  greenMid:   '#7fad8c',
  greenDark:  '#2d5a3d',
  greenPop:   '#6ab87a',
  cream:      '#faf9f5',
  warm:       '#f5f0e8',
  text:       '#1c2b22',
  muted:      '#6b7f71',
  border:     'rgba(74,124,89,0.15)',
  amber:      '#c4873a',
  amberLight: '#fdf3e7',
  rose:       '#c4607a',
  roseLight:  '#f8ecef',
  lavender:   '#7a68a6',
  lavLight:   '#f0ebf8',
  night:      '#1a2e20',
} as const;

export const FONT = {
  display:       'DMSerifDisplay_400Regular',
  displayItalic: 'DMSerifDisplay_400Regular_Italic',
  bodyLight:     'DMSans_300Light',
  body:          'DMSans_400Regular',
  bodyMed:       'DMSans_500Medium',
  bodySemi:      'DMSans_600SemiBold',
} as const;
