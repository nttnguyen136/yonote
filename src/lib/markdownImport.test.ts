import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOverwriteNotePatch,
  createLocalMarkdownPreview,
  formatNoteSnippet,
  validateMarkdownFile,
} from './markdownImport.ts';

test('validateMarkdownFile accepts valid .md, .markdown, and .txt files within 1 MB UTF-8', () => {
  assert.deepEqual(validateMarkdownFile({ name: 'architecture.md', size: 1200 }, '# Hello'), {
    valid: true,
  });
  assert.deepEqual(validateMarkdownFile({ name: 'notes.MARKDOWN', size: 500 }, 'Content'), {
    valid: true,
  });
  assert.deepEqual(validateMarkdownFile({ name: 'readme.txt', size: 10 }, 'Hi'), {
    valid: true,
  });
});

test('validateMarkdownFile rejects unsupported extensions and files over 1,000,000 UTF-8 bytes', () => {
  const badExt = validateMarkdownFile({ name: 'image.png', size: 100 });
  assert.equal(badExt.valid, false);
  if (!badExt.valid) {
    assert.match(badExt.error, /\.md, \.markdown, or \.txt/i);
  }

  const tooLargeSize = validateMarkdownFile({ name: 'huge.md', size: 1_000_001 });
  assert.equal(tooLargeSize.valid, false);
  if (!tooLargeSize.valid) {
    assert.match(tooLargeSize.error, /1 MB/i);
  }

  const multibyteOverLimit = 'a'.repeat(999_999) + '🙂';
  const tooLargeContent = validateMarkdownFile(
    { name: 'utf8.md', size: multibyteOverLimit.length },
    multibyteOverLimit,
  );
  assert.equal(tooLargeContent.valid, false);
});

test('createLocalMarkdownPreview derives a clean title up to 200 chars and preserves content in memory', () => {
  const preview = createLocalMarkdownPreview('  System Design v2.markdown ', '# Overview\n\nDetails', 1700000000000);
  assert.deepEqual(preview, {
    fileName: 'System Design v2.markdown',
    title: 'System Design v2',
    content: '# Overview\n\nDetails',
    importedAt: 1700000000000,
  });

  const emptyNamePreview = createLocalMarkdownPreview('.md', 'Body', 1700000000000);
  assert.equal(emptyNamePreview.title, 'Untitled note');

  const longName = `${'A'.repeat(240)}.md`;
  const truncatedPreview = createLocalMarkdownPreview(longName, 'Body', 1700000000000);
  assert.equal(truncatedPreview.title.length, 200);
  assert.equal(truncatedPreview.title, 'A'.repeat(200));
});

test('buildOverwriteNotePatch preserves existing note title unless empty or untitled', () => {
  const preview = createLocalMarkdownPreview('imported-draft.md', '# Updated Content', 1700000000000);

  assert.deepEqual(
    buildOverwriteNotePatch({ title: 'Architecture Roadmap', content: 'Old' }, preview),
    {
      title: 'Architecture Roadmap',
      content: '# Updated Content',
    },
  );

  assert.deepEqual(
    buildOverwriteNotePatch({ title: '   ', content: 'Old' }, preview),
    {
      title: 'imported-draft',
      content: '# Updated Content',
    },
  );

  assert.deepEqual(
    buildOverwriteNotePatch({ title: 'Untitled note', content: 'Old' }, preview),
    {
      title: 'imported-draft',
      content: '# Updated Content',
    },
  );

  assert.deepEqual(
    buildOverwriteNotePatch({ title: 'Untitled offline note', content: 'Old' }, preview),
    {
      title: 'imported-draft',
      content: '# Updated Content',
    },
  );
});

test('formatNoteSnippet strips markdown punctuation and truncates to 100 chars', () => {
  assert.equal(formatNoteSnippet('# Heading\n> Quote **bold** `code` [link]'), ' Heading\n Quote bold code link');
  assert.equal(formatNoteSnippet('', 'Empty Markdown file'), 'Empty Markdown file');
  assert.equal(formatNoteSnippet('x'.repeat(150)).length, 100);
});



