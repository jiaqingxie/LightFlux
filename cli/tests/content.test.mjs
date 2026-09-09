import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  loadTaskContent,
  richTextPreview,
  textToRichText,
} from '../src/content.mjs';

test('converts plain text paragraphs and line breaks to rich text', () => {
  const document = textToRichText('First line\nSecond line\n\nNext');

  assert.deepEqual(document, {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'First line' },
          { type: 'hardBreak' },
          { type: 'text', text: 'Second line' },
        ],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Next' }],
      },
    ],
  });
  assert.equal(richTextPreview(document), 'First line Second line Next');
});

test('loads text and Tiptap JSON files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lightflux-content-'));
  const textPath = join(directory, 'content.txt');
  const jsonPath = join(directory, 'content.json');
  await writeFile(textPath, 'Task details', 'utf8');
  await writeFile(
    jsonPath,
    JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    }),
    'utf8',
  );

  assert.equal(
    richTextPreview(await loadTaskContent({ contentFile: textPath })),
    'Task details',
  );
  assert.deepEqual(await loadTaskContent({ contentJson: jsonPath }), {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  });
});

test('rejects ambiguous content sources', async () => {
  await assert.rejects(
    loadTaskContent({ content: 'one', contentFile: 'two' }),
    /only one/,
  );
});
