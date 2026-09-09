<p align="center">
  <img src="assets/brand-mark.png" width="96" height="96" alt="LightFlux">
</p>

<h1 align="center">LightFlux CLI</h1>

<p align="center">
  Connect coding agents to LightFlux workspaces, projects, and tasks.
</p>

<p align="center">
  <a href="https://github.com/little1d/LightFlux/actions/workflows/cli-ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/little1d/LightFlux/cli-ci.yml?branch=main&style=flat-square&label=CLI%20CI" alt="CLI CI"></a>
  <img src="https://img.shields.io/badge/Node.js-22-339933?style=flat-square" alt="Node.js 22">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-111827?style=flat-square" alt="MIT License"></a>
</p>

The CLI is the public, scriptable integration layer for Claude Code, Codex,
and other coding agents. It lives in the main LightFlux monorepo while keeping
its API boundary independent from application internals and database access.

## Status

Version `0.1.0` provides device authorization, Personal Workspace discovery,
Project reads, task/subtask and Milestone mutations, rich-text task content,
comments, audit, undo, and Agent Skill integration.

## Capabilities

- Configure a LightFlux API origin.
- Authorize the CLI with a one-time code confirmed in Desktop Settings.
- Print the selected Workspace and Project as stable JSON.
- List Projects, tasks, subtasks, and Milestones with stable JSON.
- Create or reparent subtasks and bind tasks to Milestones.
- Read and update task content as plain text or validated Tiptap JSON.
- Create, update, archive, restore, and trash Milestones.
- Complete, reopen, trash, restore, and comment on tasks.
- Protect writes with expected versions and idempotency keys.
- Keep credentials separate from non-secret context with owner-only file
  permissions. `LIGHTFLUX_TOKEN` remains available for development.

## Workspace And Project Model

- Each signed-in account currently has exactly one Personal Workspace.
- Team Workspaces, membership, roles, and Workspace switching are not
  implemented yet.
- Every task belongs to a Project. The reserved Inbox Project is the fallback
  for tasks that do not belong to a user-created Project and cannot be deleted.
- Login stores a default Project only as a CLI convenience. Pass
  `--project <id>` to `task list`, `task create`, or `task update` to override
  it. When the account has only one Workspace or Project, the CLI selects it
  automatically instead of showing a numbered prompt.

## Usage

Install the CLI and Agent Skill together from the public repository:

```bash
curl -fsSL \
  https://raw.githubusercontent.com/little1d/LightFlux/main/cli/scripts/install.sh |
  bash
```

For CLI development from a local checkout:

```bash
cd cli
npm install
npm link
lightflux
```

After the npm package is published:

```bash
npm install --global lightflux
lightflux
```

Run `lightflux login` to authorize from Desktop Settings. A single Workspace
or Project is selected automatically. When several are available, `Choose
1-N` means enter the numbered list position, not a Workspace or Project ID.

Available commands:

```text
lightflux
lightflux login
lightflux logout
lightflux context
lightflux context --json
lightflux projects --json
lightflux audit --json
lightflux undo <mutation-id>
lightflux task list --json
lightflux task show <task-id> --json
lightflux task create "Ship release" --date 2026-09-08
lightflux task create "Verify artifacts" --parent <task-id>
lightflux task update <task-id> --expected-version <version> --title "New title"
lightflux task update <task-id> --expected-version <version> --content-file ./notes.txt
lightflux task complete <task-id> --expected-version <version>
lightflux task comment <task-id> --message "Verification passed."
lightflux milestone list --json
lightflux milestone create "Launch" --type countdown --date 2026-10-01
lightflux milestone update <milestone-id> --expected-version <version> --pinned
lightflux --help
lightflux --version
```

Common queries:

```bash
lightflux context --json
lightflux projects --json
lightflux task list --json
lightflux task list --project <project-id> --all --json
lightflux task show <task-id> --json
lightflux audit --json
```

Create or reschedule a task on a specific date:

```bash
lightflux task create "Prepare release" \
  --date 2026-09-12 \
  --project <project-id> \
  --json

lightflux task update <task-id> \
  --expected-version <version> \
  --date 2026-09-15 \
  --json
```

Create a subtask or update rich-text content:

```bash
lightflux task create "Verify artifacts" \
  --parent <parent-task-id> \
  --date 2026-09-12 \
  --json

lightflux task update <task-id> \
  --expected-version <version> \
  --content-file ./task-notes.txt \
  --json
```

Use `--content` for inline text or `--content-json <path|->` for a Tiptap JSON
document. Use `--no-parent` or `--no-milestone` to clear relationships.

Create solar or lunar Milestones:

```bash
lightflux milestone create "Launch" \
  --type countdown \
  --date 2026-10-01 \
  --reminders 7,1,0 \
  --json

lightflux milestone create "Birthday" \
  --type birthday \
  --date 08-15 \
  --yearly \
  --lunar \
  --json
```

The interactive setup stores non-secret context in
`~/.config/lightflux/config.json` on macOS and Linux, or the corresponding
application-data directory on Windows. Device authorization stores its token
in a separate owner-readable `credentials.json`; `config.json` never contains
credentials.

## Synchronization

Desktop changes are saved locally first and then synchronized to the Personal
Workspace. While the authenticated desktop app is visible, it reconciles
external CLI changes within about 15 seconds and also refreshes immediately
when its window regains focus. This is polling plus revision-based merge, not a
push subscription.

The public Expo Web application is not a maintained product surface. It shares
the Project UI used by Tauri, but Desktop and CLI are the supported integration
targets.

## Current Boundaries

The CLI can list Workspaces and Projects, and can list, inspect, create,
reparent/reschedule/reprioritize/move, complete, reopen, trash, restore,
comment on, audit, and undo task mutations. It also manages Milestones and
validated rich-text task content.

Not implemented yet:

- Project creation, rename, reorder, or deletion through the CLI;
- task search and server-side filters beyond Project/completed/trash;
- Team Workspace membership and service-account administration;
- push-based live updates.

## Agent Skill

The canonical Skill source is at the repository root:

```text
../skills/lightflux/
├── SKILL.md
└── references/
    └── workflows.md
```

Install it with the open Skills CLI, which handles project or global scope,
Agent detection, updates, and removal:

```bash
npx skills@latest add little1d/LightFlux --skill lightflux --global
```

The LightFlux CLI does not write Agent-specific Skill directories itself.

## Development

Node.js 22 or newer is required.

```bash
cd cli
npm ci
npm run check
npm pack --dry-run
```

See [docs/architecture.md](docs/architecture.md) for the Workspace model,
authentication plan, API contract, and mutation safety requirements.

## License

[MIT](LICENSE)
