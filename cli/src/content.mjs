import { readFile } from 'node:fs/promises';

const paragraph = (lines) => ({
  type: 'paragraph',
  ...(lines.length > 0
    ? {
        content: lines.flatMap((line, index) => [
          ...(index > 0 ? [{ type: 'hardBreak' }] : []),
          ...(line ? [{ type: 'text', text: line }] : []),
        ]),
      }
    : {}),
});

export const textToRichText = (value) => {
  const normalized = String(value).replace(/\r\n?/g, '\n').trim();
  if (!normalized) {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }
  return {
    type: 'doc',
    content: normalized
      .split(/\n{2,}/)
      .map((block) => paragraph(block.split('\n'))),
  };
};

const readStdin = async () => {
  let value = '';
  for await (const chunk of process.stdin) {
    value += chunk;
  }
  return value;
};

export const loadTaskContent = async ({
  content,
  contentFile,
  contentJson,
}) => {
  const selected = [content, contentFile, contentJson].filter(
    (value) => value !== undefined,
  );
  if (selected.length === 0) {
    return undefined;
  }
  if (selected.length > 1) {
    throw new Error(
      'Use only one of --content, --content-file, or --content-json.',
    );
  }
  if (content !== undefined) {
    return textToRichText(content);
  }
  if (contentFile !== undefined) {
    return textToRichText(await readFile(contentFile, 'utf8'));
  }
  const raw =
    contentJson === '-' ? await readStdin() : await readFile(contentJson, 'utf8');
  const document = JSON.parse(raw);
  if (document?.type !== 'doc' || !Array.isArray(document.content)) {
    throw new Error('Rich-text JSON must be a Tiptap document.');
  }
  return document;
};

const collectText = (node) => {
  const own = typeof node?.text === 'string' ? node.text : '';
  const children = Array.isArray(node?.content)
    ? node.content.map(collectText).filter(Boolean).join(' ')
    : '';
  return `${own} ${children}`.trim();
};

export const richTextPreview = (document, maxLength = 120) => {
  const value = collectText(document).replace(/\s+/g, ' ').trim();
  return value.length > maxLength
    ? `${value.slice(0, maxLength).trim()}...`
    : value;
};
