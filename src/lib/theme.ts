import type { ThemePreference } from './types';

export type ResolvedTheme = Exclude<ThemePreference, 'system'>;
export type DiagramTheme = 'light' | 'dark';

export const THEME_OPTIONS: ReadonlyArray<{
  value: ThemePreference;
  label: string;
  description: string;
}> = [
  { value: 'system', label: 'System', description: 'Follow device appearance' },
  { value: 'light', label: 'Light', description: 'Clean neutral workspace' },
  { value: 'dark', label: 'Dark', description: 'Balanced low-light workspace' },
  { value: 'midnight', label: 'Midnight', description: 'Deep navy with cyan accents' },
  { value: 'sepia', label: 'Sepia', description: 'Warm paper-like reading theme' },
  { value: 'forest', label: 'Forest', description: 'Deep green focused workspace' },
];

const THEME_VALUES = new Set<ThemePreference>(THEME_OPTIONS.map((option) => option.value));

export function isThemePreference(value: string | null): value is ThemePreference {
  return value !== null && THEME_VALUES.has(value as ThemePreference);
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

export function getDiagramTheme(theme: ResolvedTheme): DiagramTheme {
  return theme === 'light' || theme === 'sepia' ? 'light' : 'dark';
}

export function getThemeColor(theme: ResolvedTheme): string {
  switch (theme) {
    case 'light':
      return '#f7f9fc';
    case 'sepia':
      return '#f4eddf';
    case 'midnight':
      return '#07111f';
    case 'forest':
      return '#0b1713';
    default:
      return '#0d1117';
  }
}
