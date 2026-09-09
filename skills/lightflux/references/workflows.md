# LightFlux Agent Workflows

## Repository Setup

```bash
lightflux
lightflux login
lightflux context --json
```

Credentials stay in the owner-readable LightFlux credential file or the
`LIGHTFLUX_TOKEN` environment variable.

## Discover IDs

```bash
lightflux projects --json
lightflux milestone list --json
lightflux task list --project <project-id> --json
lightflux task show <task-id> --json
```

LightFlux currently exposes one Personal Workspace per account. Every task
belongs to a Project, and Inbox is the reserved fallback Project.

## Create Tasks And Subtasks

```bash
lightflux task create "Prepare release" \
  --project <project-id> \
  --date 2026-09-12 \
  --content-file ./release-notes.txt \
  --json

lightflux task create "Verify artifacts" \
  --parent <parent-task-id> \
  --date 2026-09-12 \
  --json
```

A subtask inherits its parent Project. Use `--no-parent` to detach a task.

## Rich-Text Content

- `--content <text>` converts text to Tiptap paragraphs.
- `--content-file <path>` reads UTF-8 text.
- `--content-json <path>` reads a validated Tiptap JSON document.
- `--content-json -` reads Tiptap JSON from stdin.

Use only one content source per command.

## Milestones

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

lightflux task update <task-id> \
  --expected-version <version> \
  --milestone <milestone-id> \
  --json
```

Milestone mutations require the current milestone `version`. Use
`--no-milestone` to remove a task association.

## Read Before Write

Use the returned task or milestone version for every mutation. If the server
reports a conflict, read the latest entity and decide whether the intended
change still applies.

## Claim And Report Progress

```bash
lightflux task comment <task-id> \
  --message "Implemented the parser; tests pending."
```

LightFlux has no separate assignment state. Use a concise comment only when
another collaborator needs durable status.

## Complete With Evidence

```bash
lightflux task show <task-id> --json
lightflux task comment <task-id> \
  --message "Verified with commit <sha> and npm test."
lightflux task complete <task-id> --expected-version <version>
```

## Audit And Undo

```bash
lightflux audit --json
lightflux undo <latest-mutation-id>
```

Only the latest active Workspace mutation can be undone. Re-read the entity
and audit list after undo before attempting another write.

## Desktop Reconciliation

The authenticated desktop app reconciles CLI changes while visible and when it
regains focus. Allow up to about 15 seconds before treating a missing desktop
update as a synchronization failure. Do not ask the user to quit the app as a
normal synchronization step.
