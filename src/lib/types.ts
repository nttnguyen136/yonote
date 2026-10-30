export interface Note {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export type SaveState = 'idle' | 'unsaved' | 'saving' | 'saved' | 'offline' | 'error' | 'conflict';
export type WorkspaceMode = 'locked' | 'online' | 'offline';
export type ThemePreference = 'system' | 'light' | 'dark' | 'midnight' | 'sepia' | 'forest';
