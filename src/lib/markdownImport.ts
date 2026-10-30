export const MAX_MARKDOWN_FILE_BYTES = 1_000_000;
export const MAX_NOTE_TITLE_LENGTH = 200;

export interface LocalMarkdownPreview {
  fileName: string;
  title: string;
  content: string;
  importedAt: number;
}

export type MarkdownValidationResult =
  | { valid: true }
  | { valid: false; error: string };

const MARKDOWN_EXTENSION_PATTERN = /\.(?:md|markdown|txt)$/i;
const utf8Encoder = new TextEncoder();

export function validateMarkdownFile(
  file: { name: string; size: number },
  content?: string,
): MarkdownValidationResult {
  if (!MARKDOWN_EXTENSION_PATTERN.test(file.name.trim())) {
    return {
      valid: false,
      error: 'Only Markdown or text files (.md, .markdown, or .txt) are supported.',
    };
  }

  if (file.size > MAX_MARKDOWN_FILE_BYTES) {
    return {
      valid: false,
      error: 'Markdown files are limited to 1 MB UTF-8.',
    };
  }

  if (typeof content === 'string' && utf8Encoder.encode(content).byteLength > MAX_MARKDOWN_FILE_BYTES) {
    return {
      valid: false,
      error: 'Markdown files are limited to 1 MB UTF-8.',
    };
  }

  return { valid: true };
}

export function createLocalMarkdownPreview(
  fileName: string,
  content: string,
  now = Date.now(),
): LocalMarkdownPreview {
  const trimmedFileName = fileName.trim();
  const rawTitle = trimmedFileName.replace(MARKDOWN_EXTENSION_PATTERN, '').trim();
  const title = (rawTitle || 'Untitled note').slice(0, MAX_NOTE_TITLE_LENGTH);

  return {
    fileName: trimmedFileName || 'note.md',
    title,
    content,
    importedAt: now,
  };
}

const UNTITLED_NOTE_TITLES = new Set(['untitled note', 'untitled offline note']);

export function buildOverwriteNotePatch(
  targetNote: { title: string; content: string },
  preview: Pick<LocalMarkdownPreview, 'title' | 'content'>,
): { title: string; content: string } {
  const existingTitle = targetNote.title.trim();
  const isUntitled =
    existingTitle.length === 0 || UNTITLED_NOTE_TITLES.has(existingTitle.toLowerCase());

  return {
    title: isUntitled ? preview.title : targetNote.title,
    content: preview.content,
  };
}

export function formatNoteSnippet(content: string, emptyFallback = 'Empty note'): string {
  return content.replace(/[#>*_`\[\]]/g, '').slice(0, 100) || emptyFallback;
}



