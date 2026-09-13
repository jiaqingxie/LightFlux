import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiClient, LightFluxApiError } from '../src/api.mjs';

test('API client uses the public versioned Workspace endpoint', async () => {
  const calls = [];
  const client = createApiClient({
    apiUrl: 'https://lightflux.site/',
    token: 'development-token',
    fetchImplementation: async (...args) => {
      calls.push(args);
      return Response.json({
        workspaces: [
          {
            id: 'personal',
            kind: 'personal',
            name: 'Personal',
            role: 'owner',
          },
        ],
      });
    },
  });

  assert.equal((await client.listWorkspaces()).length, 1);
  assert.equal(calls[0][0], 'https://lightflux.site/api/v1/workspaces');
  assert.equal(
    calls[0][1].headers.Authorization,
    'Bearer development-token',
  );
});

test('API client preserves structured API errors', async () => {
  const client = createApiClient({
    apiUrl: 'https://lightflux.site',
    token: 'development-token',
    fetchImplementation: async () =>
      Response.json(
        { code: 'version_conflict', error: 'The task has changed.' },
        { status: 409 },
      ),
  });

  await assert.rejects(
    client.listWorkspaces(),
    (error) =>
      error instanceof LightFluxApiError &&
      error.status === 409 &&
      error.code === 'version_conflict' &&
      error.message === 'The task has changed.',
  );
});

test('task mutations carry JSON and an idempotency key', async () => {
  const calls = [];
  const client = createApiClient({
    apiUrl: 'https://api.example.com',
    token: 'token',
    fetchImplementation: async (...args) => {
      calls.push(args);
      return Response.json({ ok: true });
    },
  });

  await client.mutateTask(
    'task/1',
    { action: 'task.complete', expectedVersion: 2 },
    'request-1',
  );

  assert.equal(
    calls[0][0],
    'https://api.example.com/api/v1/tasks/task%2F1/mutations',
  );
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].headers['Idempotency-Key'], 'request-1');
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    action: 'task.complete',
    expectedVersion: 2,
  });
});

test('milestone requests use Workspace and entity endpoints', async () => {
  const calls = [];
  const client = createApiClient({
    apiUrl: 'https://api.example.com',
    token: 'token',
    fetchImplementation: async (...args) => {
      calls.push(args);
      return Response.json({ milestones: [] });
    },
  });

  await client.listMilestones('workspace/1', {
    includeArchived: true,
    includeTrash: false,
  });
  await client.createMilestone(
    'workspace/1',
    { title: 'Launch' },
    'create-milestone',
  );
  await client.mutateMilestone(
    'milestone/1',
    { action: 'milestone.archive', expectedVersion: 1 },
    'archive-milestone',
  );

  assert.equal(
    calls[0][0],
    'https://api.example.com/api/v1/workspaces/workspace%2F1/milestones?archived=true&trash=false',
  );
  assert.equal(calls[1][1].headers['Idempotency-Key'], 'create-milestone');
  assert.equal(
    calls[2][0],
    'https://api.example.com/api/v1/milestones/milestone%2F1/mutations',
  );
});

test('project requests use Workspace create and Project mutation endpoints', async () => {
  const calls = [];
  const client = createApiClient({
    apiUrl: 'https://api.example.com',
    token: 'token',
    fetchImplementation: async (...args) => {
      calls.push(args);
      return Response.json({ project: { id: 'p1' } });
    },
  });

  await client.createProject(
    'local',
    { name: 'Work', color: '#8b7eff', afterProjectId: 'inbox' },
    'create-project',
  );
  await client.mutateProject(
    'p1',
    { action: 'project.update', name: 'Work 2' },
    'rename-project',
  );
  await client.showProject('p1');

  assert.equal(
    calls[0][0],
    'https://api.example.com/api/v1/workspaces/local/projects',
  );
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].headers['Idempotency-Key'], 'create-project');
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    name: 'Work',
    color: '#8b7eff',
    afterProjectId: 'inbox',
  });
  assert.equal(
    calls[1][0],
    'https://api.example.com/api/v1/projects/p1/mutations',
  );
  assert.equal(calls[1][1].headers['Idempotency-Key'], 'rename-project');
  assert.deepEqual(JSON.parse(calls[1][1].body), {
    action: 'project.update',
    name: 'Work 2',
  });
  assert.equal(calls[2][0], 'https://api.example.com/api/v1/projects/p1');
  assert.equal(calls[2][1].method, 'GET');
});
