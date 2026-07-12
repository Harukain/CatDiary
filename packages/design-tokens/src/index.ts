export const colors = {
  brand: '#E0714C',
  brandPressed: '#C9603E',
  brandSoft: '#F8E3D9',
  ink: '#2C2622',
  page: '#FAF7F4',
  surface: '#FFFFFF',
  border: '#EDE4DC',
  divider: '#F5EFE9',
  textSecondary: '#98897E',
  textTertiary: '#C0B4AA',
  navInactive: '#8C8078',
  successDark: '#6E8A70',
  success: '#8FAE91',
  successSoft: '#E4EBE2',
  warningDark: '#C77A3E',
  warning: '#EBB868',
  warningSoft: '#FBEDD8',
  dangerDark: '#B14A3A',
  danger: '#D45B4A',
  dangerSoft: '#F9E3E0',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;
export const radii = {
  segment: 10,
  selector: 12,
  input: 14,
  banner: 16,
  card: 20,
  navigation: 24,
  pill: 999,
} as const;
export const typography = {
  h1: { fontSize: 22, fontWeight: '700' as const, lineHeight: 31 },
  h2: { fontSize: 16, fontWeight: '700' as const, lineHeight: 24 },
  h3: { fontSize: 14.5, fontWeight: '600' as const, lineHeight: 22 },
  body: { fontSize: 14, fontWeight: '400' as const, lineHeight: 22 },
  secondary: { fontSize: 13, fontWeight: '400' as const, lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '400' as const, lineHeight: 19 },
} as const;

export const shadows = {
  card: {
    shadowColor: colors.ink,
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  small: {
    shadowColor: colors.ink,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
} as const;
