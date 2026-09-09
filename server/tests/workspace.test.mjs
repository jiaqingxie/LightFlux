import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createWorkspaceService,
  hashWorkspaceSecret,
} from '../src/workspace.mjs';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Workspace User',
  avatarUrl: null,
};
const scopes = [
  'projects:read',
  'tasks:read',
  'tasks:write',
  'tasks:complete',
  'milestones:read',
  'milestones:write',
  'comments:write',
];
const auth = {
  provider: 'cli-token',
  scopes,
  session: { id: 'cli-token-id' },
  user,
};

const initialState = () => ({
  schemaVersion: 12,
  updatedAt: 100,
  analyticsStartedAt: 1,
  language: 'en',
  navigationOrder: [],
  hiddenNavigationItems: [],
  projects: [
    {
      id: 'inbox',
      name: 'Inbox',
      color: '#8B7EFF',
      createdAt: 1,
      kind: 'inbox',
      sortOrder: 0,
    },
    {
      id: 'work',
      name: 'Work',
      color: '#55B9A5',
      createdAt: 2,
      kind: 'standard',
      sortOrder: 1,
    },
  ],
  todos: [
    {
      id: 'parent',
      title: 'Parent',
      completed: false,
      completedAt: null,
      createdAt: 10,
      updatedAt: 100,
      scheduledDate: '2026-09-06',
      projectId: 'inbox',
      milestoneId: null,
      parentId: null,
      priority: 'none',
      sortOrder: 0,
      trashedAt: null,
      content: { type: 'doc', content: [] },
    },
    {
      id: 'child',
      title: 'Child',
      completed: false,
      completedAt: null,
      createdAt: 11,
      updatedAt: 100,
      scheduledDate: '2026-09-06',
      projectId: 'inbox',
      milestoneId: null,
      parentId: 'parent',
      priority: 'none',
      sortOrder: 0,
      trashedAt: null,
      content: { type: 'doc', content: [] },
    },
  ],
  milestones: [
    {
      id: 'launch',
      title: 'Launch',
      type: 'countdown',
      dateRule: {
        calendar: 'solar',
        year: 2026,
        month: 9,
        day: 30,
        leapDayPolicy: 'feb-28',
      },
      startYear: null,
      reminderOffsets: [1],
      notes: '',
      icon: 'hourglass-outline',
      color: '#6D8DF5',
      pinned: false,
      archivedAt: null,
      trashedAt: null,
      createdAt: 20,
      updatedAt: 20,
      revision: 1,
    },
  ],
  taskEvents: [],
});

const createRepository = () => {
  let state = initialState();
  let revision = 4;
  const mutations = new Map();
  return {
    get state() {
      return state;
    },
    createDeviceAuthorization: async (authorization) => {
      repository.authorization = authorization;
    },
    approveDeviceAuthorization: async ({ userCode }) =>
      userCode === repository.authorization?.userCode,
    consumeDeviceAuthorization: async ({ deviceCodeHash }) => ({
      status:
        deviceCodeHash === repository.authorization?.deviceCodeHash
          ? 'approved'
          : 'expired',
      userId: user.id,
    }),
    findApiTokenByHash: async (hash) =>
      hash === hashWorkspaceSecret('valid-token')
        ? { scopes, session: { id: 'token' }, user }
        : null,
    revokeApiToken: async () => true,
    getAppStateSnapshot: async () => ({ revision, state }),
    listTaskComments: async () => [],
    addTaskComment: async (comment) => ({
      ...comment,
      id: 'comment',
      createdAt: new Date(0).toISOString(),
    }),
    mutateAppState: async ({
      entityKind = 'task',
      entityId,
      idempotencyKey,
      mutate,
      requestHash,
    }) => {
      const replay = mutations.get(idempotencyKey);
      if (replay) {
        if (replay.requestHash !== requestHash) {
          const error = new Error('Idempotency conflict.');
          error.status = 409;
          throw error;
        }
        return { ...replay.result, replayed: true };
      }
      state = await mutate(structuredClone(state));
      revision += 1;
      const entities =
        entityKind === 'milestone' ? state.milestones : state.todos;
      const resolvedEntityId = entityId;
      const result = {
        entity: entities.find((item) => item.id === resolvedEntityId),
        entityId: resolvedEntityId,
        mutationId: `mutation-${revision}`,
        replayed: false,
        revision,
        state,
      };
      mutations.set(idempotencyKey, { requestHash, result });
      return result;
    },
  };
};

let repository;

test('issues and exchanges a one-time desktop authorization code', async () => {
  repository = createRepository();
  const service = createWorkspaceService({
    appWebUrl: 'https://app.example.com',
    now: () => 200,
    repository,
  });

  const authorization = await service.requestDeviceAuthorization();
  assert.match(authorization.userCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(
    authorization.verificationUri,
    `lightflux://cli/authorize?code=${authorization.userCode}`,
  );
  assert.equal(
    repository.authorization.deviceCodeHash,
    hashWorkspaceSecret(authorization.deviceCode),
  );
  assert.deepEqual(
    await service.approveDeviceAuthorization({
      auth: { user },
      userCode: authorization.userCode.toLowerCase(),
    }),
    { ok: true },
  );
  const token = await service.exchangeDeviceAuthorization({
    deviceCode: authorization.deviceCode,
  });
  assert.equal(token.tokenType, 'Bearer');
  assert.match(token.accessToken, /^[A-Za-z0-9_-]+$/);
});

test('lists personal Workspace data and exposes stable task versions', async () => {
  repository = createRepository();
  const service = createWorkspaceService({
    appWebUrl: 'https://app.example.com',
    now: () => 200,
    repository,
  });

  const workspaces = await service.listWorkspaces(auth);
  assert.equal(workspaces.workspaces[0].id, user.id);
  const projects = await service.listProjects({
    auth,
    workspaceId: user.id,
  });
  assert.equal(projects.revision, 4);
  const tasks = await service.listTasks({
    auth,
    projectId: 'inbox',
    includeCompleted: false,
    includeTrash: false,
  });
  assert.equal(tasks.tasks[0].version, 100);
});

test('moves a task branch and replays an idempotent mutation', async () => {
  repository = createRepository();
  const service = createWorkspaceService({
    appWebUrl: 'https://app.example.com',
    now: () => 200,
    repository,
  });
  const input = {
    action: 'task.update',
    auth,
    body: {
      expectedVersion: 100,
      changes: { projectId: 'work' },
    },
    idempotencyKey: 'move-parent',
    taskId: 'parent',
  };

  const first = await service.mutateTask(input);
  const replay = await service.mutateTask(input);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(repository.state.todos[0].projectId, 'work');
  assert.equal(repository.state.todos[1].projectId, 'work');
});

test('creates one task when an idempotent request is replayed', async () => {
  repository = createRepository();
  const service = createWorkspaceService({
    appWebUrl: 'https://app.example.com',
    now: () => 200,
    repository,
  });
  const input = {
    action: 'task.create',
    auth,
    body: {
      title: 'Created from CLI',
      scheduledDate: '2026-09-07',
      projectId: 'inbox',
    },
    idempotencyKey: 'create-task',
  };

  const first = await service.mutateTask(input);
  const replay = await service.mutateTask(input);
  assert.equal(first.task.id, replay.task.id);
  assert.equal(
    repository.state.todos.filter(
      (task) => task.title === 'Created from CLI',
    ).length,
    1,
  );
});

test('rejects stale task mutations with the current task', async () => {
  repository = createRepository();
  const service = createWorkspaceService({
    appWebUrl: 'https://app.example.com',
    now: () => 200,
    repository,
  });

  await assert.rejects(
    service.mutateTask({
      action: 'task.complete',
      auth,
      body: { expectedVersion: 99 },
      idempotencyKey: 'complete-parent',
      taskId: 'parent',
    }),
    (error) =>
      error.status === 409 &&
      error.code === 'version_conflict' &&
      error.currentTask.id === 'parent',
  );
});

test('rejects impossible scheduled dates', async () => {
  repository = createRepository();
  const service = createWorkspaceService({
    appWebUrl: 'https://app.example.com',
    now: () => 200,
    repository,
  });

  await assert.rejects(
    service.mutateTask({
      action: 'task.create',
      auth,
      body: {
        title: 'Invalid date',
        scheduledDate: '2026-02-31',
        projectId: 'inbox',
      },
      idempotencyKey: 'invalid-date',
    }),
    /scheduledDate/,
  );
});

test('creates a rich-text subtask and rejects parent cycles', async () => {
  repository = createRepository();
  const service = createWorkspaceService({
    now: () => 200,
    repository,
  });
  const content = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Details' }],
      },
    ],
  };

  const created = await service.mutateTask({
    action: 'task.create',
    auth,
    body: {
      content,
      milestoneId: 'launch',
      parentId: 'parent',
      projectId: 'inbox',
      scheduledDate: '2026-09-08',
      title: 'Nested task',
    },
    idempotencyKey: 'create-subtask',
  });

  assert.equal(created.task.parentId, 'parent');
  assert.equal(created.task.milestoneId, 'launch');
  assert.deepEqual(created.task.content, content);
  await assert.rejects(
    service.mutateTask({
      action: 'task.update',
      auth,
      body: {
        changes: { parentId: 'child' },
        expectedVersion: 100,
      },
      idempotencyKey: 'cycle-parent',
      taskId: 'parent',
    }),
    /own descendant/,
  );
  const moved = await service.mutateTask({
    action: 'task.update',
    auth,
    body: {
      changes: { projectId: 'work' },
      expectedVersion: 100,
    },
    idempotencyKey: 'move-child-away',
    taskId: 'child',
  });
  assert.equal(moved.task.projectId, 'work');
  assert.equal(moved.task.parentId, null);
});

test('rejects unsafe task rich-text content', async () => {
  repository = createRepository();
  const service = createWorkspaceService({
    now: () => 200,
    repository,
  });

  await assert.rejects(
    service.mutateTask({
      action: 'task.update',
      auth,
      body: {
        changes: {
          content: {
            type: 'doc',
            content: [
              {
                type: 'image',
                attrs: { src: 'javascript:alert(1)' },
              },
            ],
          },
        },
        expectedVersion: 100,
      },
      idempotencyKey: 'unsafe-content',
      taskId: 'parent',
    }),
    /HTTP\(S\)/,
  );
  await assert.rejects(
    service.mutateTask({
      action: 'task.update',
      auth,
      body: {
        changes: {
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    marks: [
                      {
                        type: 'link',
                        attrs: { href: 'javascript:alert(1)' },
                      },
                    ],
                    text: 'unsafe',
                  },
                ],
              },
            ],
          },
        },
        expectedVersion: 100,
      },
      idempotencyKey: 'unsafe-link',
      taskId: 'parent',
    }),
    /link/,
  );
  await assert.rejects(
    service.mutateTask({
      action: 'task.update',
      auth,
      body: {
        changes: {
          content: {
            type: 'doc',
            content: [{ type: 'doc', content: [] }],
          },
        },
        expectedVersion: 100,
      },
      idempotencyKey: 'nested-document',
      taskId: 'parent',
    }),
    /rich-text node/,
  );
});

test('creates and mutates milestones with entity versions', async () => {
  repository = createRepository();
  const service = createWorkspaceService({
    now: () => 200,
    repository,
  });
  const listed = await service.listMilestones({
    auth,
    includeArchived: false,
    includeTrash: false,
    workspaceId: user.id,
  });
  assert.equal(listed.milestones[0].version, 1);

  const created = await service.mutateMilestone({
    action: 'milestone.create',
    auth,
    body: {
      title: 'Release',
      type: 'countdown',
      dateRule: {
        calendar: 'solar',
        year: 2026,
        month: 10,
        day: 1,
        leapDayPolicy: 'feb-28',
      },
      reminderOffsets: [7, 1, 1],
    },
    idempotencyKey: 'create-milestone',
  });
  assert.equal(created.milestone.version, 1);
  assert.deepEqual(created.milestone.reminderOffsets, [1, 7]);
  const leapFallback = await service.mutateMilestone({
    action: 'milestone.create',
    auth,
    body: {
      title: 'Leap fallback',
      type: 'anniversary',
      dateRule: {
        calendar: 'solar',
        year: 2025,
        month: 2,
        day: 29,
        leapDayPolicy: 'mar-1',
      },
    },
    idempotencyKey: 'leap-fallback',
  });
  assert.equal(leapFallback.milestone.dateRule.day, 29);

  const updated = await service.mutateMilestone({
    action: 'milestone.update',
    auth,
    body: {
      changes: { notes: 'Ship it', pinned: true },
      expectedVersion: 1,
    },
    idempotencyKey: 'update-milestone',
    milestoneId: created.milestone.id,
  });
  assert.equal(updated.milestone.version, 2);
  assert.equal(updated.milestone.pinned, true);
  await assert.rejects(
    service.mutateMilestone({
      action: 'milestone.create',
      auth,
      body: {
        title: 'Invalid reminder',
        type: 'custom',
        dateRule: {
          calendar: 'solar',
          year: 2026,
          month: 10,
          day: 2,
          leapDayPolicy: 'feb-28',
        },
        reminderOffsets: [366],
      },
      idempotencyKey: 'invalid-reminder',
    }),
    /reminder offset/,
  );
  await assert.rejects(
    service.mutateMilestone({
      action: 'milestone.trash',
      auth,
      body: { expectedVersion: 1 },
      idempotencyKey: 'stale-milestone',
      milestoneId: created.milestone.id,
    }),
    /milestone has changed/,
  );
});
