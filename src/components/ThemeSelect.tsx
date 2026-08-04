import type { ChangeEvent } from 'react';
import type { ThemePreference } from '../lib/types';
import { THEME_OPTIONS } from '../lib/theme';
import { AppIcon } from './AppIcon';

export function ThemeSelect({
  value,
  onChange,
  compact = false,
}: {
  value: ThemePreference;
  onChange: (theme: ThemePreference) => void;
  compact?: boolean;
}) {
  return (
    <label className={`theme-control ${compact ? 'compact' : ''}`} title="Choose appearance">
      <span className="theme-control-icon" aria-hidden="true"><AppIcon name="moon" /></span>
      <span className="visually-hidden">Theme</span>
      <select
        aria-label="Theme"
        value={value}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value as ThemePreference)}
      >
        {THEME_OPTIONS.map((option) => (
          <option key={option.value} value={option.value} title={option.description}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
