export interface Note {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';
