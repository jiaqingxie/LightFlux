import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DataType, newDb } from 'pg-mem';

import { runMigrations } from '../src/postgres/migrations.mjs';
import { createPostgresRepository } from '../src/postgres/repository.mjs';

let pool;
let repository;

beforeEach(async () => {
  const database = newDb({
    autoCreateForeignKeyIndices: false,
    noAstCoverageCheck: true,
  });
  database.public.registerFunction({
    implementation: (value) =>
      [...value].reduce((hash, character) => {
        return ((hash << 5) - hash + character.charCodeAt(0)) | 0;
      }, 0),
    name: 'hashtext',
    args: [DataType.text],
    returns: DataType.integer,
  });
  database.public.registerFunction({
    implementation: () => null,
    name: 'pg_advisory_xact_lock',
    args: [DataType.integer],
    returns: DataType.integer,
  });
  database.public.registerFunction({
    implementation: (value) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? 'object'
        : Array.isArray(value)
          ? 'array'
          : typeof value,
    name: 'jsonb_typeof',
    args: [DataType.jsonb],
    returns: DataType.text,
  });
  database.public.registerFunction({
    implementation: (value) => value.length,
    name: 'length',
    args: [DataType.text],
    returns: DataType.integer,
  });

  const adapter = database.adapters.createPg();
  pool = new adapter.Pool();
  await runMigrations({
    directory: fileURLToPath(new URL('../migrations/', import.meta.url)),
    pool,
    useAdvisoryLock: false,
  });
  repository = createPostgresRepository({ pool });
});

afterEach(async () => {
  await repository.close();
});

test('links WeChat identities with the same UnionID to one user', async () => {
  const first = await repository.upsertWechatUser('web', {
    appId: 'web-app',
    openId: 'web-open-id',
    unionId: 'shared-union',
    displayName: 'First name',
    avatarUrl: null,
  });
  const second = await repository.upsertWechatUser('mobile', {
    appId: 'mobile-app',
    openId: 'mobile-open-id',
    unionId: 'shared-union',
    displayName: 'Latest name',
    avatarUrl: 'https://example.com/avatar.png',
  });

  assert.equal(second.id, first.id);
  assert.equal(second.displayName, 'Latest name');
  const identities = await pool.query(
    'SELECT user_id FROM auth_identities ORDER BY app_id',
  );
  assert.equal(identities.rowCount, 2);
  assert.deepEqual(
    new Set(identities.rows.map((identity) => identity.user_id)),
    new Set([first.id]),
  );
});

test('maps a verified auth subject to one internal user', async () => {
  const first = await repository.upsertFederatedUser({
    provider: 'better-auth-email',
    subject: 'auth-user-1',
    email: 'person@example.com',
    displayName: 'Person',
    avatarUrl: null,
  });
  const second = await repository.upsertFederatedUser({
    provider: 'better-auth-email',
    subject: 'auth-user-1',
    email: 'PERSON@example.com',
    displayName: 'Updated person',
    avatarUrl: 'https://example.com/person.png',
  });
  const separate = await repository.upsertFederatedUser({
    provider: 'future-provider',
    subject: 'other-auth-user',
    email: 'person@example.com',
    displayName: 'Separate identity',
    avatarUrl: null,
  });

  assert.equal(second.id, first.id);
  assert.equal(second.displayName, 'Updated person');
  assert.notEqual(separate.id, first.id);
  const identity = await pool.query(
    `SELECT verified_email
     FROM federated_identities
     WHERE provider = 'better-auth-email' AND provider_subject = $1`,
    ['auth-user-1'],
  );
  assert.equal(identity.rows[0].verified_email, 'person@example.com');
});

test('re-running migrations is idempotent', async () => {
  await runMigrations({
    directory: fileURLToPath(new URL('../migrations/', import.meta.url)),
    pool,
    useAdvisoryLock: false,
  });

  const applied = await pool.query(
    'SELECT id, name, checksum FROM lightflux_schema_migrations',
  );
  assert.equal(applied.rowCount, 5);
  for (const migration of applied.rows) {
    assert.match(migration.checksum, /^[0-9a-f]{64}$/);
  }
});

test('stores hashed sessions and ignores expired sessions', async () => {
  const user = await repository.upsertWechatUser('web', {
    appId: 'web-app',
    openId: 'session-user',
    unionId: null,
    displayName: 'Session user',
    avatarUrl: null,
  });
  const activeHash = 'a'.repeat(64);
  await repository.createSession({
    id: randomUUID(),
    userId: user.id,
    tokenHash: activeHash,
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  });

  assert.equal(
    (await repository.findSessionByTokenHash(activeHash))?.user.id,
    user.id,
  );
  assert.equal(
    await repository.findSessionByTokenHash('b'.repeat(64)),
    null,
  );
});

test('restores and deletes active Better Auth sessions by raw token', async () => {
  const authUserId = randomUUID();
  const activeSessionId = randomUUID();
  const expiredSessionId = randomUUID();
  const now = new Date();
  await pool.query(
    `INSERT INTO email_auth_users (
       id, name, email, email_verified, image, created_at, updated_at
     ) VALUES ($1, $2, $3, true, $4, $5, $5)`,
    [
      authUserId,
      'Desktop user',
      'desktop@example.com',
      'https://example.com/avatar.png',
      now,
    ],
  );
  await pool.query(
    `INSERT INTO email_auth_sessions (
       id, auth_user_id, token, expires_at, created_at, updated_at
     ) VALUES
       ($1, $2, $3, $4, $6, $6),
       ($5, $2, $7, $8, $6, $6)`,
    [
      activeSessionId,
      authUserId,
      'active-desktop-token',
      new Date(now.getTime() + 60_000),
      expiredSessionId,
      now,
      'expired-desktop-token',
      new Date(now.getTime() - 60_000),
    ],
  );

  assert.deepEqual(
    await repository.findEmailSessionByToken('active-desktop-token'),
    {
      session: {
        id: activeSessionId,
        userId: authUserId,
        expiresAt: new Date(now.getTime() + 60_000),
      },
      user: {
        id: authUserId,
        email: 'desktop@example.com',
        name: 'Desktop user',
        image: 'https://example.com/avatar.png',
      },
    },
  );
  assert.equal(
    await repository.findEmailSessionByToken('expired-desktop-token'),
    null,
  );

  await repository.deleteEmailSession(activeSessionId);
  assert.equal(
    await repository.findEmailSessionByToken('active-desktop-token'),
    null,
  );
});

test('approves one-time device codes and revokes issued API tokens', async () => {
  const user = await repository.upsertFederatedUser({
    provider: 'better-auth-email',
    subject: 'device-auth-user',
    email: 'device@example.com',
    displayName: 'Device user',
    avatarUrl: null,
  });
  const deviceCodeHash = 'd'.repeat(64);
  await repository.createDeviceAuthorization({
    deviceCodeHash,
    userCode: 'ABCD-2345',
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  });
  assert.equal(
    await repository.approveDeviceAuthorization({
      userCode: 'ABCD-2345',
      userId: user.id,
    }),
    true,
  );

  const tokenHash = 'e'.repeat(64);
  const consumed = await repository.consumeDeviceAuthorization({
    deviceCodeHash,
    tokenHash,
    tokenId: randomUUID(),
    scopes: ['tasks:read'],
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  });
  assert.equal(consumed.status, 'approved');
  assert.deepEqual(
    (await repository.findApiTokenByHash(tokenHash))?.scopes,
    ['tasks:read'],
  );
  assert.equal(await repository.revokeApiToken(tokenHash), true);
  assert.equal(await repository.findApiTokenByHash(tokenHash), null);
});

test('uses revision CAS and returns the current snapshot on conflict', async () => {
  const user = await repository.upsertWechatUser('web', {
    appId: 'web-app',
    openId: 'state-user',
    unionId: null,
    displayName: 'State user',
    avatarUrl: null,
  });
  const currentState = {
    schemaVersion: 12,
    updatedAt: 200,
    todos: [],
    projects: [],
  };
  const staleState = {
    schemaVersion: 12,
    updatedAt: 100,
    todos: [{ id: 'stale' }],
    projects: [],
  };

  const firstWrite = await repository.putAppState(
    user.id,
    currentState,
    0,
  );
  assert.equal(firstWrite.updated, true);
  assert.equal(firstWrite.revision, 1);
  const staleResult = await repository.putAppState(
    user.id,
    staleState,
    0,
  );
  assert.deepEqual(staleResult, {
    conflict: true,
    currentRevision: 1,
    currentState,
    updated: false,
  });
  assert.deepEqual(await repository.getAppStateSnapshot(user.id), {
    revision: 1,
    state: currentState,
  });
});

test('records and safely undoes the latest Workspace mutation', async () => {
  const user = await repository.upsertFederatedUser({
    provider: 'better-auth-email',
    subject: 'mutation-user',
    email: 'mutation@example.com',
    displayName: 'Mutation user',
    avatarUrl: null,
  });
  const initial = {
    schemaVersion: 12,
    updatedAt: 100,
    todos: [{ id: 'task', title: 'Before', updatedAt: 100 }],
    projects: [],
  };
  await repository.putAppState(user.id, initial, 0);
  const mutation = await repository.mutateAppState({
    action: 'task.update',
    actorId: 'test-token',
    entityId: 'task',
    idempotencyKey: 'update-task',
    requestHash: 'f'.repeat(64),
    userId: user.id,
    mutate: (state) => {
      state.todos[0].title = 'After';
      state.todos[0].updatedAt = 200;
      state.updatedAt = 200;
      return state;
    },
  });
  assert.equal(mutation.revision, 2);
  const replay = await repository.mutateAppState({
    action: 'task.update',
    actorId: 'test-token',
    entityId: 'task',
    idempotencyKey: 'update-task',
    requestHash: 'f'.repeat(64),
    userId: user.id,
    mutate: () => {
      throw new Error('Replay must not execute the mutation again.');
    },
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.entity.title, 'After');
  assert.equal(
    (await repository.listWorkspaceMutations({ userId: user.id }))[0]
      .action,
    'task.update',
  );

  const undone = await repository.undoWorkspaceMutation({
    mutationId: mutation.mutationId,
    userId: user.id,
  });
  assert.equal(undone.revision, 3);
  assert.equal(undone.state.todos[0].title, 'Before');
  await assert.rejects(
    repository.undoWorkspaceMutation({
      mutationId: mutation.mutationId,
      userId: user.id,
    }),
    /already undone/,
  );
});

test('records milestone entities in Workspace mutations', async () => {
  const user = await repository.upsertFederatedUser({
    provider: 'better-auth-email',
    subject: 'milestone-mutation-user',
    email: 'milestone-mutation@example.com',
    displayName: 'Milestone mutation user',
    avatarUrl: null,
  });
  await repository.putAppState(
    user.id,
    {
      schemaVersion: 12,
      updatedAt: 100,
      todos: [],
      projects: [],
      milestones: [{ id: 'launch', title: 'Before', revision: 1 }],
    },
    0,
  );

  const mutation = await repository.mutateAppState({
    action: 'milestone.update',
    actorId: 'test-token',
    entityKind: 'milestone',
    entityId: 'launch',
    idempotencyKey: 'update-milestone',
    requestHash: 'a'.repeat(64),
    userId: user.id,
    mutate: (state) => {
      state.milestones[0].title = 'After';
      state.milestones[0].revision = 2;
      state.updatedAt = 200;
      return state;
    },
  });

  assert.equal(mutation.entity.title, 'After');
  assert.equal(mutation.entity.revision, 2);
});

test('keeps updatedAt protection for clients without baseRevision', async () => {
  const user = await repository.upsertWechatUser('web', {
    appId: 'web-app',
    openId: 'legacy-state-user',
    unionId: null,
    displayName: 'Legacy state user',
    avatarUrl: null,
  });
  const currentState = {
    schemaVersion: 12,
    updatedAt: 200,
    todos: [],
    projects: [],
  };
  const staleState = { ...currentState, updatedAt: 100 };

  await repository.putAppState(user.id, currentState);
  const staleResult = await repository.putAppState(user.id, staleState);
  assert.equal(staleResult.updated, false);
  assert.equal(staleResult.currentUpdatedAt, 200);
});

test('imports the legacy JSON snapshot idempotently', async () => {
  const userId = randomUUID();
  const identityId = randomUUID();
  const sessionId = randomUUID();
  const snapshot = {
    schemaVersion: 1,
    users: [
      {
        id: userId,
        displayName: 'Legacy user',
        avatarUrl: null,
        appState: {
          schemaVersion: 12,
          updatedAt: 300,
          todos: [],
          projects: [],
        },
        createdAt: 100,
        updatedAt: 300,
      },
    ],
    identities: [
      {
        id: identityId,
        provider: 'wechat',
        platform: 'web',
        appId: 'legacy-app',
        openId: 'legacy-open-id',
        unionId: null,
        userId,
        createdAt: 100,
      },
    ],
    sessions: [
      {
        id: sessionId,
        userId,
        tokenHash: 'c'.repeat(64),
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      },
    ],
  };

  await repository.importLegacySnapshot(snapshot);
  await repository.importLegacySnapshot(snapshot);
  await repository.upsertWechatUser('web', {
    appId: 'legacy-app',
    openId: 'legacy-open-id',
    unionId: null,
    displayName: 'Current profile',
    avatarUrl: 'https://example.com/current.png',
  });
  await repository.importLegacySnapshot(snapshot);

  assert.equal((await pool.query('SELECT id FROM users')).rowCount, 1);
  assert.equal(
    (await pool.query('SELECT id FROM auth_identities')).rowCount,
    1,
  );
  assert.equal((await pool.query('SELECT id FROM sessions')).rowCount, 1);
  assert.equal((await repository.getAppState(userId)).updatedAt, 300);
  const profile = await pool.query(
    'SELECT display_name, avatar_url FROM users WHERE id = $1',
    [userId],
  );
  assert.deepEqual(profile.rows[0], {
    display_name: 'Current profile',
    avatar_url: 'https://example.com/current.png',
  });
});
