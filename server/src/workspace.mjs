import {
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { httpError, requireId, publicTask, publicMilestone, requireTask, mutateTaskState, requireMilestone, mutateMilestoneState } from '@lightflux/domain';

import { isCurrentAppState } from './app-state.mjs';

const DEVICE_CODE_TTL_MS = 10 * 60 * 1000;
const API_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const WORKSPACE_API_SCOPES = [
  'projects:read',
  'tasks:read',
  'tasks:write',
  'tasks:complete',
  'milestones:read',
  'milestones:write',
  'comments:write',
];
const USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const hashWorkspaceSecret = (value) =>
  createHash('sha256').update(value).digest('hex');

const requestHash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

const createUserCode = () => {
  const bytes = randomBytes(8);
  const code = Array.from(
    bytes,
    (byte) => USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length],
  ).join('');
  return `${code.slice(0, 4)}-${code.slice(4)}`;
};

const normalizeUserCode = (value) =>
  String(value ?? '').trim().toUpperCase();

const requireIdempotencyKey = (value) => {
  const key = requireId(value, 'Idempotency key');
  if (key.length > 200) {
    throw httpError(400, 'Idempotency key is too long.');
  }
  return key;
};

const requireScope = (auth, scope) => {
  if (!auth?.scopes?.includes(scope)) {
    throw httpError(403, `The ${scope} scope is required.`);
  }
};

const requireWorkspace = (auth, workspaceId) => {
  if (workspaceId !== auth.user.id) {
    throw httpError(404, 'Workspace not found.');
  }
};

export const createWorkspaceService = ({
  now = () => Date.now(),
  repository,
}) => ({
  requestDeviceAuthorization: async () => {
    const deviceCode = randomBytes(32).toString('base64url');
    const userCode = createUserCode();
    const createdAt = now();
    const expiresAt = createdAt + DEVICE_CODE_TTL_MS;
    await repository.createDeviceAuthorization({
      deviceCodeHash: hashWorkspaceSecret(deviceCode),
      userCode,
      createdAt,
      expiresAt,
    });
    return {
      deviceCode,
      userCode,
      verificationUri:
        `lightflux://cli/authorize?code=${encodeURIComponent(userCode)}`,
      expiresIn: DEVICE_CODE_TTL_MS / 1000,
      interval: 3,
    };
  },

  approveDeviceAuthorization: async ({ auth, userCode }) => {
    const normalized = normalizeUserCode(userCode);
    if (!/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(normalized)) {
      throw httpError(400, 'The device code is invalid.');
    }
    const approved = await repository.approveDeviceAuthorization({
      userCode: normalized,
      userId: auth.user.id,
    });
    if (!approved) {
      throw httpError(404, 'The device code is invalid or expired.');
    }
    return { ok: true };
  },

  exchangeDeviceAuthorization: async ({ deviceCode }) => {
    const accessToken = randomBytes(32).toString('base64url');
    const createdAt = now();
    const expiresAt = createdAt + API_TOKEN_TTL_MS;
    const result = await repository.consumeDeviceAuthorization({
      deviceCodeHash: hashWorkspaceSecret(
        requireId(deviceCode, 'Device code'),
      ),
      tokenHash: hashWorkspaceSecret(accessToken),
      tokenId: randomUUID(),
      scopes: WORKSPACE_API_SCOPES,
      createdAt,
      expiresAt,
    });
    if (result.status === 'pending') {
      throw httpError(428, 'Authorization is pending.', {
        code: 'authorization_pending',
      });
    }
    if (result.status !== 'approved') {
      throw httpError(410, 'The device authorization expired or was used.', {
        code: 'expired_token',
      });
    }
    return {
      accessToken,
      expiresIn: API_TOKEN_TTL_MS / 1000,
      scope: WORKSPACE_API_SCOPES.join(' '),
      tokenType: 'Bearer',
    };
  },

  authenticateToken: async (token) => {
    if (!token) return null;
    const session = await repository.findApiTokenByHash(
      hashWorkspaceSecret(token),
    );
    return session ? { ...session, provider: 'cli-token' } : null;
  },

  revokeToken: async (token) => ({
    ok: await repository.revokeApiToken(hashWorkspaceSecret(token)),
  }),

  listWorkspaces: async (auth) => {
    requireScope(auth, 'projects:read');
    return {
      workspaces: [
        {
          id: auth.user.id,
          kind: 'personal',
          name: `${auth.user.displayName || 'Personal'} Workspace`,
        },
      ],
    };
  },

  listProjects: async ({ auth, workspaceId }) => {
    requireScope(auth, 'projects:read');
    requireWorkspace(auth, workspaceId);
    const snapshot = await repository.getAppStateSnapshot(auth.user.id);
    return {
      projects: (snapshot.state?.projects ?? []).map((project) => ({
        ...project,
        workspaceRevision: snapshot.revision,
      })),
      revision: snapshot.revision,
    };
  },

  listTasks: async ({ auth, projectId, includeCompleted, includeTrash }) => {
    requireScope(auth, 'tasks:read');
    const snapshot = await repository.getAppStateSnapshot(auth.user.id);
    if (
      !snapshot.state?.projects?.some((project) => project.id === projectId)
    ) {
      throw httpError(404, 'Project not found.');
    }
    return {
      revision: snapshot.revision,
      tasks: (snapshot.state.todos ?? [])
        .filter((task) => task.projectId === projectId)
        .filter((task) => includeTrash || task.trashedAt === null)
        .filter((task) => includeCompleted || !task.completed)
        .map((task) => publicTask(task, snapshot.revision)),
    };
  },

  showTask: async ({ auth, taskId }) => {
    requireScope(auth, 'tasks:read');
    const snapshot = await repository.getAppStateSnapshot(auth.user.id);
    const task = requireTask(snapshot.state, taskId);
    return {
      task: publicTask(task, snapshot.revision, true),
      comments: await repository.listTaskComments({
        taskId,
        userId: auth.user.id,
      }),
    };
  },

  mutateTask: async ({
    action,
    auth,
    body,
    idempotencyKey,
    taskId,
  }) => {
    requireScope(
      auth,
      action === 'task.complete' || action === 'task.reopen'
        ? 'tasks:complete'
        : 'tasks:write',
    );
    const key = requireIdempotencyKey(idempotencyKey);
    const hash = requestHash({ action, body, taskId: taskId ?? null });
    const changedTaskId =
      taskId ?? (action === 'task.create' ? randomUUID() : null);
    const result = await repository.mutateAppState({
      action,
      actorId: auth.session.id,
      entityKind: 'task',
      entityId: changedTaskId,
      idempotencyKey: key,
      requestHash: hash,
      userId: auth.user.id,
      mutate: (state) => {
        const task = mutateTaskState({
          action,
          body:
            action === 'task.create'
              ? { ...body, generatedTaskId: changedTaskId }
              : body,
          state,
          taskId,
          now: now(),
        });
        return state;
      },
    });
    return {
      mutationId: result.mutationId,
      replayed: result.replayed,
      revision: result.revision,
      task: publicTask(result.entity, result.revision, true),
    };
  },

  listMilestones: async ({
    auth,
    includeArchived,
    includeTrash,
    workspaceId,
  }) => {
    requireScope(auth, 'milestones:read');
    requireWorkspace(auth, workspaceId);
    const snapshot = await repository.getAppStateSnapshot(auth.user.id);
    return {
      milestones: (snapshot.state?.milestones ?? [])
        .filter(
          (milestone) =>
            includeTrash || milestone.trashedAt === null,
        )
        .filter(
          (milestone) =>
            includeArchived ||
            milestone.archivedAt === null ||
            milestone.trashedAt !== null,
        )
        .map((milestone) => publicMilestone(milestone, snapshot.revision)),
      revision: snapshot.revision,
    };
  },

  showMilestone: async ({ auth, milestoneId }) => {
    requireScope(auth, 'milestones:read');
    const snapshot = await repository.getAppStateSnapshot(auth.user.id);
    return {
      milestone: publicMilestone(
        requireMilestone(snapshot.state, milestoneId),
        snapshot.revision,
      ),
    };
  },

  mutateMilestone: async ({
    action,
    auth,
    body,
    idempotencyKey,
    milestoneId,
  }) => {
    requireScope(auth, 'milestones:write');
    const key = requireIdempotencyKey(idempotencyKey);
    const hash = requestHash({ action, body, milestoneId: milestoneId ?? null });
    const changedMilestoneId =
      milestoneId ?? (action === 'milestone.create' ? randomUUID() : null);
    const result = await repository.mutateAppState({
      action,
      actorId: auth.session.id,
      entityKind: 'milestone',
      entityId: changedMilestoneId,
      idempotencyKey: key,
      requestHash: hash,
      userId: auth.user.id,
      mutate: (state) => {
        mutateMilestoneState({
          action,
          body:
            action === 'milestone.create'
              ? { ...body, generatedMilestoneId: changedMilestoneId }
              : body,
          milestoneId,
          now: now(),
          state,
        });
        return state;
      },
    });
    return {
      milestone: publicMilestone(result.entity, result.revision),
      mutationId: result.mutationId,
      replayed: result.replayed,
      revision: result.revision,
    };
  },

  addTaskComment: async ({
    auth,
    body,
    idempotencyKey,
    taskId,
  }) => {
    requireScope(auth, 'comments:write');
    const message = String(body.message ?? '').trim();
    if (!message || message.length > 10_000) {
      throw httpError(400, 'Comment must contain 1 to 10000 characters.');
    }
    const snapshot = await repository.getAppStateSnapshot(auth.user.id);
    requireTask(snapshot.state, taskId);
    return {
      comment: await repository.addTaskComment({
        body: message,
        idempotencyKey: requireIdempotencyKey(idempotencyKey),
        requestHash: requestHash({ message, taskId }),
        taskId,
        userId: auth.user.id,
      }),
    };
  },

  listAudit: async ({ auth, workspaceId }) => {
    requireScope(auth, 'tasks:read');
    requireWorkspace(auth, workspaceId);
    return {
      mutations: await repository.listWorkspaceMutations({
        userId: auth.user.id,
      }),
    };
  },

  undoMutation: async ({ auth, mutationId }) => {
    requireScope(auth, 'tasks:write');
    const result = await repository.undoWorkspaceMutation({
      mutationId,
      userId: auth.user.id,
    });
    return {
      ok: true,
      revision: result.revision,
      state: result.state,
    };
  },
});
