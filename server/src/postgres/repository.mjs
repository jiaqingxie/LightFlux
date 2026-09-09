import { randomUUID } from 'node:crypto';

const asDate = (timestamp) => new Date(timestamp);

const mapUser = (row) => ({
  id: row.id,
  displayName: row.display_name,
  avatarUrl: row.avatar_url,
});

const transaction = async (pool, operation) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const createPostgresRepository = ({ pool }) => {
  if (!pool) {
    throw new Error('A PostgreSQL pool is required.');
  }

  const healthcheck = async () => {
    await pool.query(
      `SELECT checksum
       FROM lightflux_schema_migrations
       WHERE id = 1`,
    );
  };

  const upsertWechatUser = async (platform, profile) =>
    transaction(pool, async (client) => {
      const identityKey = `wechat:openid:${profile.appId}:${profile.openId}`;
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        identityKey,
      ]);
      if (profile.unionId) {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `wechat:union:${profile.unionId}`,
        ]);
      }

      const identityResult = await client.query(
        `SELECT DISTINCT user_id
         FROM auth_identities
         WHERE provider = 'wechat'
           AND (
             ($1::text IS NOT NULL AND union_id = $1)
             OR (app_id = $2 AND open_id = $3)
           )`,
        [profile.unionId, profile.appId, profile.openId],
      );
      if (identityResult.rows.length > 1) {
        const error = new Error(
          'WeChat identity belongs to multiple LightFlux users.',
        );
        error.status = 409;
        throw error;
      }
      const timestamp = new Date();
      let userId = identityResult.rows[0]?.user_id;

      if (!userId) {
        userId = randomUUID();
        await client.query(
          `INSERT INTO users (
             id, display_name, avatar_url, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $4)`,
          [userId, profile.displayName, profile.avatarUrl, timestamp],
        );
      } else {
        await client.query(
          `UPDATE users
           SET display_name = COALESCE($2, display_name),
               avatar_url = COALESCE($3, avatar_url),
               updated_at = $4
           WHERE id = $1`,
          [
            userId,
            profile.displayName || null,
            profile.avatarUrl,
            timestamp,
          ],
        );
      }

      await client.query(
        `INSERT INTO auth_identities (
           id, user_id, provider, platform, app_id, open_id, union_id,
           created_at, updated_at
         ) VALUES ($1, $2, 'wechat', $3, $4, $5, $6, $7, $7)
         ON CONFLICT (provider, app_id, open_id) DO UPDATE
         SET platform = EXCLUDED.platform,
             union_id = COALESCE(EXCLUDED.union_id, auth_identities.union_id),
             updated_at = EXCLUDED.updated_at`,
        [
          randomUUID(),
          userId,
          platform,
          profile.appId,
          profile.openId,
          profile.unionId,
          timestamp,
        ],
      );
      const linkedIdentity = await client.query(
        `SELECT user_id
         FROM auth_identities
         WHERE provider = 'wechat' AND app_id = $1 AND open_id = $2`,
        [profile.appId, profile.openId],
      );
      if (linkedIdentity.rows[0]?.user_id !== userId) {
        const error = new Error(
          'WeChat identity is already linked to another LightFlux user.',
        );
        error.status = 409;
        throw error;
      }

      const userResult = await client.query(
        `SELECT id, display_name, avatar_url
         FROM users
         WHERE id = $1`,
        [userId],
      );
      return mapUser(userResult.rows[0]);
    });

  const upsertFederatedUser = async ({
    provider,
    subject,
    email,
    displayName,
    avatarUrl,
  }) =>
    transaction(pool, async (client) => {
      const identityKey = `${provider}:${subject}`;
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        identityKey,
      ]);

      const identityResult = await client.query(
        `SELECT user_id
         FROM federated_identities
         WHERE provider = $1 AND provider_subject = $2`,
        [provider, subject],
      );
      const timestamp = new Date();
      let userId = identityResult.rows[0]?.user_id;

      if (!userId) {
        userId = randomUUID();
        await client.query(
          `INSERT INTO users (
             id, display_name, avatar_url, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $4)`,
          [
            userId,
            displayName || email?.split('@')[0] || 'LightFlux user',
            avatarUrl ?? null,
            timestamp,
          ],
        );
        await client.query(
          `INSERT INTO federated_identities (
             id, user_id, provider, provider_subject, verified_email,
             created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $6)`,
          [
            randomUUID(),
            userId,
            provider,
            subject,
            email?.trim().toLowerCase() || null,
            timestamp,
          ],
        );
      } else {
        await client.query(
          `UPDATE users
           SET display_name = COALESCE($2, display_name),
               avatar_url = COALESCE($3, avatar_url),
               updated_at = $4
           WHERE id = $1`,
          [userId, displayName || null, avatarUrl ?? null, timestamp],
        );
        await client.query(
          `UPDATE federated_identities
           SET verified_email = COALESCE($3, verified_email),
               updated_at = $4
           WHERE provider = $1 AND provider_subject = $2`,
          [
            provider,
            subject,
            email?.trim().toLowerCase() || null,
            timestamp,
          ],
        );
      }

      const userResult = await client.query(
        `SELECT id, display_name, avatar_url
         FROM users
         WHERE id = $1`,
        [userId],
      );
      return mapUser(userResult.rows[0]);
    });

  const createSession = async ({
    id,
    userId,
    tokenHash,
    createdAt,
    expiresAt,
  }) =>
    transaction(pool, async (client) => {
      await client.query('DELETE FROM sessions WHERE expires_at <= now()');
      await client.query(
        `INSERT INTO sessions (
           id, user_id, token_hash, created_at, expires_at
         ) VALUES ($1, $2, $3, $4, $5)`,
        [id, userId, tokenHash, asDate(createdAt), asDate(expiresAt)],
      );
    });

  const findSessionByTokenHash = async (hash) => {
    const result = await pool.query(
      `SELECT
         s.id AS session_id,
         s.user_id,
         s.expires_at,
         u.display_name,
         u.avatar_url
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1
         AND s.expires_at > now()
       LIMIT 1`,
      [hash],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      session: {
        id: row.session_id,
        userId: row.user_id,
        expiresAt: row.expires_at,
      },
      user: {
        id: row.user_id,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
      },
    };
  };

  const deleteSession = async (sessionId) => {
    await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
  };

  const createDeviceAuthorization = async ({
    deviceCodeHash,
    userCode,
    createdAt,
    expiresAt,
  }) => {
    await pool.query(
      'DELETE FROM cli_device_authorizations WHERE expires_at <= now()',
    );
    await pool.query(
      'DELETE FROM api_tokens WHERE expires_at <= now() OR revoked_at IS NOT NULL',
    );
    await pool.query(
      `INSERT INTO cli_device_authorizations (
         device_code_hash, user_code, status, created_at, expires_at
       ) VALUES ($1, $2, 'pending', $3, $4)`,
      [
        deviceCodeHash,
        userCode,
        asDate(createdAt),
        asDate(expiresAt),
      ],
    );
  };

  const approveDeviceAuthorization = async ({ userCode, userId }) => {
    const result = await pool.query(
      `UPDATE cli_device_authorizations
       SET user_id = $2, status = 'approved', approved_at = now()
       WHERE user_code = $1
         AND status = 'pending'
         AND expires_at > now()
       RETURNING user_code`,
      [userCode, userId],
    );
    return result.rowCount === 1;
  };

  const consumeDeviceAuthorization = async ({
    deviceCodeHash,
    tokenHash,
    tokenId,
    scopes,
    createdAt,
    expiresAt,
  }) =>
    transaction(pool, async (client) => {
      const authorization = await client.query(
        `SELECT user_id, status, expires_at
         FROM cli_device_authorizations
         WHERE device_code_hash = $1
         FOR UPDATE`,
        [deviceCodeHash],
      );
      const row = authorization.rows[0];
      if (!row || new Date(row.expires_at).getTime() <= Date.now()) {
        return { status: 'expired' };
      }
      if (row.status === 'pending') {
        return { status: 'pending' };
      }
      if (row.status !== 'approved' || !row.user_id) {
        return { status: 'consumed' };
      }

      await client.query(
        `INSERT INTO api_tokens (
           id, user_id, token_hash, scopes, created_at, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          tokenId,
          row.user_id,
          tokenHash,
          scopes.join(' '),
          asDate(createdAt),
          asDate(expiresAt),
        ],
      );
      await client.query(
        `UPDATE cli_device_authorizations
         SET status = 'consumed', consumed_at = now()
         WHERE device_code_hash = $1`,
        [deviceCodeHash],
      );
      return { status: 'approved', userId: row.user_id };
    });

  const findApiTokenByHash = async (hash) => {
    const result = await pool.query(
      `SELECT
         t.id AS token_id,
         t.user_id,
         t.scopes,
         t.expires_at,
         u.display_name,
         u.avatar_url
       FROM api_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = $1
         AND t.expires_at > now()
         AND t.revoked_at IS NULL
       LIMIT 1`,
      [hash],
    );
    const row = result.rows[0];
    return row
      ? {
          scopes: String(row.scopes).split(' ').filter(Boolean),
          session: {
            id: row.token_id,
            userId: row.user_id,
            expiresAt: row.expires_at,
          },
          user: {
            id: row.user_id,
            displayName: row.display_name,
            avatarUrl: row.avatar_url,
          },
        }
      : null;
  };

  const revokeApiToken = async (hash) => {
    const result = await pool.query(
      `UPDATE api_tokens
       SET revoked_at = now()
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [hash],
    );
    return result.rowCount > 0;
  };

  const findEmailSessionByToken = async (token) => {
    const result = await pool.query(
      `SELECT
         s.id AS session_id,
         s.auth_user_id,
         s.expires_at,
         u.email,
         u.name,
         u.image
       FROM email_auth_sessions s
       JOIN email_auth_users u ON u.id = s.auth_user_id
       WHERE s.token = $1 AND s.expires_at > now()
       LIMIT 1`,
      [token],
    );
    const row = result.rows[0];
    return row
      ? {
          session: {
            id: row.session_id,
            userId: row.auth_user_id,
            expiresAt: row.expires_at,
          },
          user: {
            id: row.auth_user_id,
            email: row.email,
            name: row.name,
            image: row.image,
          },
        }
      : null;
  };

  const deleteEmailSession = async (sessionId) => {
    await pool.query('DELETE FROM email_auth_sessions WHERE id = $1', [
      sessionId,
    ]);
  };

  const getAppStateSnapshot = async (userId) => {
    const result = await pool.query(
      'SELECT state, revision FROM app_states WHERE user_id = $1',
      [userId],
    );
    const row = result.rows[0];
    return row
      ? { state: row.state, revision: Number(row.revision) }
      : { state: null, revision: 0 };
  };

  const getAppState = async (userId) =>
    (await getAppStateSnapshot(userId)).state;

  const putAppState = async (userId, state, baseRevision) => {
    const stateUpdatedAt = Number(state?.updatedAt);
    if (
      !Number.isFinite(stateUpdatedAt) ||
      stateUpdatedAt < 0 ||
      !Number.isSafeInteger(stateUpdatedAt)
    ) {
      const error = new Error('App state has an invalid updatedAt value.');
      error.status = 400;
      throw error;
    }
    if (
      baseRevision !== undefined &&
      (!Number.isSafeInteger(baseRevision) || baseRevision < 0)
    ) {
      const error = new Error('App state has an invalid baseRevision value.');
      error.status = 400;
      throw error;
    }

    return transaction(pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `app-state:${userId}`,
      ]);
      const current = await client.query(
        `SELECT state, state_updated_at, revision
         FROM app_states
         WHERE user_id = $1
         FOR UPDATE`,
        [userId],
      );
      const currentUpdatedAt =
        current.rowCount > 0
          ? Number(current.rows[0].state_updated_at)
          : null;
      const currentRevision =
        current.rowCount > 0 ? Number(current.rows[0].revision) : 0;
      if (
        baseRevision !== undefined &&
        baseRevision !== currentRevision
      ) {
        return {
          conflict: true,
          currentRevision,
          currentState: current.rows[0]?.state ?? null,
          updated: false,
        };
      }
      if (
        baseRevision === undefined &&
        currentUpdatedAt !== null &&
        currentUpdatedAt > stateUpdatedAt
      ) {
        return {
          conflict: true,
          currentRevision,
          currentState: current.rows[0]?.state ?? null,
          currentUpdatedAt,
          updated: false,
        };
      }

      const nextRevision = currentRevision + 1;
      if (currentUpdatedAt === null) {
        await client.query(
          `INSERT INTO app_states (
             user_id, state, state_updated_at, revision, updated_at
           ) VALUES ($1, $2::jsonb, $3, $4, now())`,
          [userId, JSON.stringify(state), stateUpdatedAt, nextRevision],
        );
      } else {
        await client.query(
          `UPDATE app_states
           SET state = $2::jsonb,
               state_updated_at = $3,
               revision = $4,
               updated_at = now()
           WHERE user_id = $1`,
          [userId, JSON.stringify(state), stateUpdatedAt, nextRevision],
        );
      }
      return {
        conflict: false,
        currentUpdatedAt: stateUpdatedAt,
        revision: nextRevision,
        updated: true,
      };
    });
  };

  const mutateAppState = async ({
    action,
    actorId,
    entityKind = 'task',
    entityId,
    idempotencyKey,
    mutate,
    requestHash,
    userId,
  }) =>
    transaction(pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `app-state:${userId}`,
      ]);
      const replay = await client.query(
        `SELECT request_hash, result_entity, result_revision, id, entity_id
         FROM workspace_mutations
         WHERE user_id = $1 AND idempotency_key = $2`,
        [userId, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestHash) {
          const error = new Error(
            'The idempotency key was already used for another request.',
          );
          error.status = 409;
          throw error;
        }
        return {
          entityId: replay.rows[0].entity_id,
          mutationId: replay.rows[0].id,
          replayed: true,
          revision: Number(replay.rows[0].result_revision),
          entity: replay.rows[0].result_entity,
        };
      }

      const current = await client.query(
        `SELECT state, revision
         FROM app_states
         WHERE user_id = $1
         FOR UPDATE`,
        [userId],
      );
      if (!current.rows[0]) {
        const error = new Error(
          'No synchronized desktop state exists for this Workspace.',
        );
        error.status = 409;
        throw error;
      }
      const beforeState = current.rows[0].state;
      const baseRevision = Number(current.rows[0].revision);
      const afterState = await mutate(structuredClone(beforeState));
      const entities =
        entityKind === 'milestone'
          ? afterState.milestones
          : afterState.todos;
      const resultEntity = entities?.find((item) => item.id === entityId);
      if (!resultEntity) {
        throw new Error('Workspace mutation did not produce its entity.');
      }
      const nextRevision = baseRevision + 1;
      await client.query(
        `UPDATE app_states
         SET state = $2::jsonb,
             state_updated_at = $3,
             revision = $4,
             updated_at = now()
         WHERE user_id = $1`,
        [
          userId,
          JSON.stringify(afterState),
          Number(afterState.updatedAt),
          nextRevision,
        ],
      );
      const mutationId = randomUUID();
      await client.query(
        `INSERT INTO workspace_mutations (
           id, user_id, actor_id, idempotency_key, request_hash, action, entity_id,
           before_state, result_entity, base_revision, result_revision,
           created_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, now()
         )`,
        [
          mutationId,
          userId,
          actorId,
          idempotencyKey,
          requestHash,
          action,
          entityId ?? null,
          JSON.stringify(beforeState),
          JSON.stringify(resultEntity),
          baseRevision,
          nextRevision,
        ],
      );
      return {
        entityId: entityId ?? null,
        entity: resultEntity,
        mutationId,
        replayed: false,
        revision: nextRevision,
      };
    });

  const addTaskComment = async ({
    body,
    idempotencyKey,
    requestHash,
    taskId,
    userId,
  }) =>
    transaction(pool, async (client) => {
      const replay = await client.query(
        `SELECT id, task_id, body, created_at, request_hash
         FROM task_comments
         WHERE user_id = $1 AND idempotency_key = $2`,
        [userId, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestHash) {
          const error = new Error(
            'The idempotency key was already used for another request.',
          );
          error.status = 409;
          throw error;
        }
        return {
          id: replay.rows[0].id,
          taskId: replay.rows[0].task_id,
          body: replay.rows[0].body,
          createdAt: new Date(replay.rows[0].created_at).toISOString(),
          replayed: true,
        };
      }
      const id = randomUUID();
      const createdAt = new Date();
      await client.query(
        `INSERT INTO task_comments (
           id, user_id, task_id, idempotency_key, request_hash, body,
           created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          userId,
          taskId,
          idempotencyKey,
          requestHash,
          body,
          createdAt,
        ],
      );
      return {
        id,
        taskId,
        body,
        createdAt: createdAt.toISOString(),
        replayed: false,
      };
    });

  const listTaskComments = async ({ taskId, userId }) => {
    const result = await pool.query(
      `SELECT id, task_id, body, created_at
       FROM task_comments
       WHERE user_id = $1 AND task_id = $2
       ORDER BY created_at, id`,
      [userId, taskId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      body: row.body,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  };

  const listWorkspaceMutations = async ({ limit = 20, userId }) => {
    const result = await pool.query(
      `SELECT
         id, actor_id, action, entity_id, base_revision, result_revision,
         created_at, undone_at
       FROM workspace_mutations
       WHERE user_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [userId, limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      actorId: row.actor_id,
      action: row.action,
      entityId: row.entity_id,
      baseRevision: Number(row.base_revision),
      resultRevision: Number(row.result_revision),
      createdAt: new Date(row.created_at).toISOString(),
      undoneAt: row.undone_at
        ? new Date(row.undone_at).toISOString()
        : null,
    }));
  };

  const undoWorkspaceMutation = async ({ mutationId, userId }) =>
    transaction(pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `app-state:${userId}`,
      ]);
      const mutationResult = await client.query(
        `SELECT before_state, result_revision, undone_at
         FROM workspace_mutations
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [mutationId, userId],
      );
      const mutation = mutationResult.rows[0];
      if (!mutation) {
        const error = new Error('Mutation not found.');
        error.status = 404;
        throw error;
      }
      if (mutation.undone_at) {
        const error = new Error('Mutation was already undone.');
        error.status = 409;
        throw error;
      }
      const currentResult = await client.query(
        `SELECT state, revision
         FROM app_states
         WHERE user_id = $1
         FOR UPDATE`,
        [userId],
      );
      const current = currentResult.rows[0];
      if (
        !current ||
        Number(current.revision) !== Number(mutation.result_revision)
      ) {
        const error = new Error(
          'Only the latest Workspace mutation can be undone.',
        );
        error.status = 409;
        throw error;
      }
      const state = structuredClone(mutation.before_state);
      state.updatedAt = Math.max(
        Date.now(),
        Number(current.state?.updatedAt ?? 0) + 1,
      );
      const revision = Number(current.revision) + 1;
      await client.query(
        `UPDATE app_states
         SET state = $2::jsonb,
             state_updated_at = $3,
             revision = $4,
             updated_at = now()
         WHERE user_id = $1`,
        [userId, JSON.stringify(state), state.updatedAt, revision],
      );
      await client.query(
        `UPDATE workspace_mutations
         SET undone_at = now()
         WHERE id = $1`,
        [mutationId],
      );
      return { revision, state };
    });

  const importLegacySnapshot = async (snapshot) =>
    transaction(pool, async (client) => {
      if (
        snapshot?.schemaVersion !== 1 ||
        !Array.isArray(snapshot.users) ||
        !Array.isArray(snapshot.identities) ||
        !Array.isArray(snapshot.sessions)
      ) {
        throw new Error('Legacy auth snapshot is invalid.');
      }

      for (const user of snapshot.users) {
        await client.query(
          `INSERT INTO users (
             id, display_name, avatar_url, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE
           SET display_name = CASE
                 WHEN users.updated_at <= EXCLUDED.updated_at
                   THEN EXCLUDED.display_name
                 ELSE users.display_name
               END,
               avatar_url = CASE
                 WHEN users.updated_at <= EXCLUDED.updated_at
                   THEN EXCLUDED.avatar_url
                 ELSE users.avatar_url
               END,
               updated_at = CASE
                 WHEN users.updated_at > EXCLUDED.updated_at
                   THEN users.updated_at
                 ELSE EXCLUDED.updated_at
               END`,
          [
            user.id,
            user.displayName,
            user.avatarUrl ?? null,
            asDate(user.createdAt),
            asDate(user.updatedAt),
          ],
        );
        if (user.appState) {
          const stateUpdatedAt = Number(
            user.appState.updatedAt ?? user.updatedAt,
          );
          const currentState = await client.query(
            'SELECT state_updated_at FROM app_states WHERE user_id = $1',
            [user.id],
          );
          if (
            currentState.rowCount === 0 ||
            Number(currentState.rows[0].state_updated_at) <= stateUpdatedAt
          ) {
            await client.query(
              `INSERT INTO app_states (
                 user_id, state, state_updated_at, updated_at
               ) VALUES ($1, $2::jsonb, $3, $4)
               ON CONFLICT (user_id) DO UPDATE
               SET state = EXCLUDED.state,
                   state_updated_at = EXCLUDED.state_updated_at,
                   updated_at = EXCLUDED.updated_at`,
              [
                user.id,
                JSON.stringify(user.appState),
                stateUpdatedAt,
                asDate(user.updatedAt),
              ],
            );
          }
        }
      }

      for (const identity of snapshot.identities) {
        await client.query(
          `INSERT INTO auth_identities (
             id, user_id, provider, platform, app_id, open_id, union_id,
             created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
           ON CONFLICT (provider, app_id, open_id) DO NOTHING`,
          [
            identity.id,
            identity.userId,
            identity.provider,
            identity.platform,
            identity.appId,
            identity.openId,
            identity.unionId ?? null,
            asDate(identity.createdAt),
          ],
        );
      }

      for (const session of snapshot.sessions) {
        await client.query(
          `INSERT INTO sessions (
             id, user_id, token_hash, created_at, expires_at
           ) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO NOTHING`,
          [
            session.id,
            session.userId,
            session.tokenHash,
            asDate(session.createdAt),
            asDate(session.expiresAt),
          ],
        );
      }
    });

  return {
    addTaskComment,
    approveDeviceAuthorization,
    close: () => pool.end(),
    consumeDeviceAuthorization,
    createDeviceAuthorization,
    createSession,
    deleteEmailSession,
    deleteSession,
    findApiTokenByHash,
    findEmailSessionByToken,
    findSessionByTokenHash,
    getAppState,
    getAppStateSnapshot,
    healthcheck,
    importLegacySnapshot,
    listTaskComments,
    listWorkspaceMutations,
    mutateAppState,
    putAppState,
    revokeApiToken,
    undoWorkspaceMutation,
    upsertFederatedUser,
    upsertWechatUser,
  };
};
