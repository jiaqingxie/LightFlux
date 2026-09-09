import assert from 'node:assert/strict';
import test from 'node:test';

import { selectWorkspaceContext } from '../src/context.mjs';

test('auto-selects the only Workspace and Project', async () => {
  const output = [];
  const context = await selectWorkspaceContext({
    choose: async () => {
      throw new Error('Single options must not prompt.');
    },
    client: {
      listWorkspaces: async () => [
        { id: 'personal', kind: 'personal', name: 'Personal Workspace' },
      ],
      listProjects: async () => [
        { id: 'inbox', kind: 'inbox', name: 'Inbox' },
      ],
    },
    write: (value) => output.push(value),
  });

  assert.deepEqual(context, {
    workspaceId: 'personal',
    workspaceName: 'Personal Workspace',
    projectId: 'inbox',
    projectName: 'Inbox',
  });
  assert.deepEqual(output, [
    'Workspace: Personal Workspace (personal)\n',
    'Default Project for task commands: Inbox\n',
  ]);
});

test('prompts when multiple Projects are available', async () => {
  const prompts = [];
  const context = await selectWorkspaceContext({
    choose: async (label, options) => {
      prompts.push({ label, options });
      return options.at(-1).value;
    },
    client: {
      listWorkspaces: async () => [
        { id: 'personal', kind: 'personal', name: 'Personal Workspace' },
      ],
      listProjects: async () => [
        { id: 'inbox', kind: 'inbox', name: 'Inbox' },
        { id: 'work', kind: 'standard', name: 'Work' },
      ],
    },
    write: () => {},
  });

  assert.equal(context.projectId, 'work');
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].label, 'Default Project for task commands');
});
