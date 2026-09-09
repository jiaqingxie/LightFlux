CREATE TABLE cli_device_authorizations (
  device_code_hash text PRIMARY KEY CHECK (length(device_code_hash) = 64),
  user_code text NOT NULL UNIQUE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL
    CHECK (status IN ('pending', 'approved', 'consumed')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  approved_at timestamptz,
  consumed_at timestamptz
);

CREATE INDEX cli_device_authorizations_expires_at_idx
  ON cli_device_authorizations (expires_at);

CREATE TABLE api_tokens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  scopes text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX api_tokens_user_id_idx ON api_tokens (user_id);
CREATE INDEX api_tokens_expires_at_idx ON api_tokens (expires_at);

CREATE TABLE workspace_mutations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  action text NOT NULL,
  entity_id text,
  before_state jsonb NOT NULL,
  result_entity jsonb NOT NULL,
  base_revision bigint NOT NULL CHECK (base_revision >= 0),
  result_revision bigint NOT NULL CHECK (result_revision > 0),
  created_at timestamptz NOT NULL,
  undone_at timestamptz,
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX workspace_mutations_user_created_idx
  ON workspace_mutations (user_id, created_at DESC);

CREATE TABLE task_comments (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  body text NOT NULL CHECK (length(body) > 0),
  created_at timestamptz NOT NULL,
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX task_comments_user_task_idx
  ON task_comments (user_id, task_id, created_at);
