# Architecture

## Repository Boundary

`cli/` is a package boundary inside the public LightFlux monorepo. It contains
no application UI, PostgreSQL access, or server implementation and
communicates exclusively through the versioned LightFlux API.

Application source, CLI source, and desktop installers all live in
`little1d/LightFlux`. Desktop tags keep the `desktop-v*` prefix so the updater
contract remains distinct from future npm package tags.

## Product Model

Every authenticated account currently owns one Personal Workspace. Before
sign-in the device state is local-only; after sign-in it becomes
cloud-synchronized. There is no separate Local Workspace in the product model.

Team Workspaces, members, roles, and service accounts remain future work.
Existing LightFlux Groups migrated to Projects while preserving IDs.
Ungrouped tasks migrated to the reserved Inbox Project.

```text
Account
├── Personal Workspace
│   ├── Inbox
│   └── Projects
└── Team Workspaces
    ├── Members
    ├── Projects
    ├── Service Accounts
    └── Audit Log
```

## Public API Dependency

The CLI uses these versioned endpoints:

```text
GET /api/v1/workspaces
GET /api/v1/workspaces/:workspaceId/projects
GET|POST /api/v1/workspaces/:workspaceId/milestones
GET /api/v1/projects/:projectId/tasks
POST /api/v1/projects/:projectId/tasks
GET /api/v1/tasks/:taskId
POST /api/v1/tasks/:taskId/mutations
POST /api/v1/tasks/:taskId/comments
GET /api/v1/milestones/:milestoneId
POST /api/v1/milestones/:milestoneId/mutations
GET /api/v1/workspaces/:workspaceId/audit
POST /api/v1/mutations/:mutationId/undo
POST /api/v1/auth/device
POST /api/v1/auth/device/approve
POST /api/v1/auth/device/token
```

Every mutation carries an expected entity version and idempotency key. Server
responses identify the actor and resulting Workspace change sequence.

The server applies task, subtask, rich-text, and Milestone mutations to the
owner-scoped V12 aggregate under a transaction lock. Idempotency records and
expected entity versions prevent blind retries and stale writes.

## Authentication

The CLI uses a device authorization flow. It displays a short code which the
signed-in user approves in LightFlux Desktop Settings. The resulting token is
stored separately from context in an owner-readable credential file.
`LIGHTFLUX_TOKEN` can override it for development and CI.

CLI device tokens currently receive these Workspace scopes:

```text
projects:read
tasks:read
tasks:write
tasks:complete
milestones:read
milestones:write
comments:write
```

Membership, credential, Workspace deletion, and Project deletion scopes are
not granted by default.

## Skill Boundary

The Skill describes when and how an Agent should use LightFlux. It does not:

- contain credentials;
- access PostgreSQL;
- construct private API payloads;
- duplicate conflict or authorization logic;
- mutate task files directly.

All deterministic behavior remains in the CLI. The canonical Skill is
distributed from the public repository through the open Skills CLI. LightFlux
does not manage Agent-specific installation paths or links itself.

## Release Model

- Repository: `little1d/LightFlux`
- Package directory: `cli/`
- npm package: `lightflux`
- executable: `lightflux`
- Skill installer:
  `npx skills@latest add little1d/LightFlux --skill lightflux`
- package version: independent from the LightFlux application version
- first functional Workspace CLI package: `0.1.0`

The package name was unclaimed in the npm registry when the repository was
initialized. Availability must be checked again immediately before publish.
