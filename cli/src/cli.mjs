#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

import { createApiClient, LightFluxApiError } from './api.mjs';
import { readConfig, writeConfig } from './config.mjs';
import { loadTaskContent, richTextPreview } from './content.mjs';
import { selectWorkspaceContext } from './context.mjs';
import {
  deleteCredentials,
  readCredentials,
  writeCredentials,
} from './credentials.mjs';
import { openDesktopAuthorization } from './desktop.mjs';
import { milestoneDateRule, reminderOffsets } from './milestone.mjs';

const VERSION = '0.1.0';
const DEFAULT_API_URL = 'https://lightflux.site';
const VALUE_FLAGS = new Set([
  '--date',
  '--color',
  '--content',
  '--content-file',
  '--content-json',
  '--expected-version',
  '--icon',
  '--idempotency-key',
  '--leap-day-policy',
  '--message',
  '--milestone',
  '--missing-leap-month-policy',
  '--notes',
  '--parent',
  '--priority',
  '--project',
  '--reminders',
  '--start-year',
  '--title',
  '--type',
]);

const printHelp = () => {
  process.stdout.write(`LightFlux CLI ${VERSION}

Usage:
  lightflux                         Configure API context
  lightflux login                   Authorize this CLI from Desktop Settings
  lightflux logout                  Revoke the current CLI token
  lightflux context [--json]        Show selected Workspace and Project
  lightflux projects [--json]       List Projects
  lightflux audit [--json]          Show recent CLI mutations
  lightflux undo <mutation-id>      Undo the latest mutation
  lightflux task list [--project <id>] [--parent <id>] [--root] [--all] [--trash] [--json]
  lightflux task show <id> [--json]
  lightflux task create <title> [--date <date>] [--project <id>] [--parent <id>] [--milestone <id>] [content]
  lightflux task update <id> --expected-version <n> [task changes]
  lightflux task complete|reopen <id> --expected-version <n>
  lightflux task trash <id> --expected-version <n> [--yes]
  lightflux task restore <id> --expected-version <n>
  lightflux task comment <id> --message <text>
  lightflux milestone list [--archived] [--trash] [--json]
  lightflux milestone show <id> [--json]
  lightflux milestone create <title> --date <YYYY-MM-DD|MM-DD> [options]
  lightflux milestone update <id> --expected-version <n> [changes]
  lightflux milestone archive|unarchive|trash|restore <id> --expected-version <n>
  lightflux --help
  lightflux --version
`);
};

const createPrompts = () => {
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return {
    ask: async (message, initialValue = '') => {
      const suffix = initialValue ? ` (${initialValue})` : '';
      const answer = (await terminal.question(`${message}${suffix}: `)).trim();
      return answer || initialValue;
    },
    choose: async (message, options) => {
      process.stdout.write(`${message}\n`);
      options.forEach((option, index) => {
        process.stdout.write(`  ${index + 1}. ${option.label}\n`);
      });
      while (true) {
        const answer = Number(
          (
            await terminal.question(`Choose 1-${options.length}: `)
          ).trim(),
        );
        if (Number.isInteger(answer) && options[answer - 1]) {
          return options[answer - 1].value;
        }
        process.stdout.write('Enter one of the listed numbers.\n');
      }
    },
    close: () => terminal.close(),
    confirm: async (message, initialValue = true) => {
      const hint = initialValue ? 'Y/n' : 'y/N';
      const answer = (
        await terminal.question(`${message} (${hint}): `)
      ).trim().toLowerCase();
      return answer ? answer === 'y' || answer === 'yes' : initialValue;
    },
  };
};

const option = (args, name) => {
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  const value = args[index + 1];
  if (value === undefined || (value.startsWith('--') && value !== '-')) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
};

const positionals = (args) => {
  const result = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (VALUE_FLAGS.has(value)) {
      index += 1;
    } else if (!value.startsWith('--')) {
      result.push(value);
    }
  }
  return result;
};

const integerOption = (args, name, required = false) => {
  const value = option(args, name);
  if (value === undefined && !required) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
};

const today = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const output = (value, json, human) => {
  process.stdout.write(
    json ? `${JSON.stringify(value)}\n` : `${human(value)}\n`,
  );
};

const requireConfig = async () => {
  const config = await readConfig();
  if (!config) {
    throw new Error('LightFlux is not configured. Run `lightflux` first.');
  }
  return config;
};

const token = async () =>
  process.env.LIGHTFLUX_TOKEN?.trim() ||
  (await readCredentials())?.token ||
  null;

const authenticatedClient = async () => {
  const config = await requireConfig();
  const accessToken = await token();
  if (!accessToken) {
    throw new Error('LightFlux CLI is not logged in. Run `lightflux login`.');
  }
  return {
    client: createApiClient({ apiUrl: config.apiUrl, token: accessToken }),
    config,
  };
};

const runSetup = async () => {
  if (!process.stdin.isTTY) {
    throw new Error('Interactive setup requires a terminal.');
  }
  const prompts = createPrompts();
  try {
    const existing = await readConfig();
    const apiUrl = (
      await prompts.ask(
        'LightFlux API URL',
        existing?.apiUrl ?? DEFAULT_API_URL,
      )
    ).replace(/\/$/, '');
    const parsedUrl = new URL(apiUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('The API URL must use HTTP or HTTPS.');
    }
    const sameApi = existing?.apiUrl === apiUrl;
    const destination = await writeConfig({
      apiUrl,
      schemaVersion: 1,
      ...(sameApi
        ? {
            workspaceId: existing.workspaceId,
            workspaceName: existing.workspaceName,
            projectId: existing.projectId,
            projectName: existing.projectName,
          }
        : {}),
    });
    process.stdout.write(`Configuration saved: ${destination}\n`);
    if (!(await token())) {
      process.stdout.write('Run `lightflux login` to authorize the CLI.\n');
    }
  } finally {
    prompts.close();
  }
};

const runLogin = async () => {
  if (!process.stdin.isTTY) {
    throw new Error('Device authorization requires a terminal.');
  }
  const prompts = createPrompts();
  try {
    const config = await requireConfig();
    const client = createApiClient({ apiUrl: config.apiUrl });
    const authorization = await client.requestDeviceAuthorization();
    const desktopOpened = openDesktopAuthorization(
      authorization.verificationUri,
    );
    process.stdout.write(
      [
        `Device code: ${authorization.userCode}`,
        desktopOpened
          ? 'Opened LightFlux Desktop.'
          : `Open ${authorization.verificationUri}`,
        'In Desktop Settings, confirm CLI access.',
        'Waiting for approval...',
        '',
      ].join('\n'),
    );
    const deadline = Date.now() + authorization.expiresIn * 1000;
    let result;
    while (Date.now() < deadline) {
      await new Promise((resolve) =>
        setTimeout(resolve, authorization.interval * 1000),
      );
      try {
        result = await client.exchangeDeviceAuthorization(
          authorization.deviceCode,
        );
        break;
      } catch (error) {
        if (
          error instanceof LightFluxApiError &&
          error.code === 'authorization_pending'
        ) {
          continue;
        }
        throw error;
      }
    }
    if (!result?.accessToken) {
      throw new Error('Device authorization expired.');
    }
    const context = await selectWorkspaceContext({
      client: createApiClient({
        apiUrl: config.apiUrl,
        token: result.accessToken,
      }),
      choose: prompts.choose,
    });
    await writeConfig({ ...config, ...context, schemaVersion: 1 });
    await writeCredentials(result.accessToken);
    process.stdout.write('LightFlux CLI authorized.\n');
  } finally {
    prompts.close();
  }
};

const runLogout = async () => {
  const config = await requireConfig();
  const accessToken = await token();
  if (accessToken) {
    await createApiClient({
      apiUrl: config.apiUrl,
      token: accessToken,
    })
      .logout()
      .catch(() => undefined);
  }
  await deleteCredentials();
  process.stdout.write('LightFlux CLI credentials removed.\n');
};

const showContext = async (json) => {
  const config = await requireConfig();
  output(config, json, (value) =>
    [
      `API: ${value.apiUrl}`,
      `Workspace: ${value.workspaceName ?? 'not selected'}`,
      `Project: ${value.projectName ?? 'not selected'}`,
    ].join('\n'),
  );
};

const listProjects = async (args) => {
  const { client, config } = await authenticatedClient();
  if (!config.workspaceId) {
    throw new Error('No Workspace selected. Run `lightflux login`.');
  }
  const projects = await client.listProjects(config.workspaceId);
  output(projects, args.includes('--json'), (items) =>
    items.map((item) => `${item.id}\t${item.name}`).join('\n'),
  );
};

const showAudit = async (args) => {
  const { client, config } = await authenticatedClient();
  if (!config.workspaceId) {
    throw new Error('No Workspace selected. Run `lightflux login`.');
  }
  const result = await client.listAudit(config.workspaceId);
  output(result, args.includes('--json'), (value) =>
    value.mutations
      .map(
        (mutation) =>
          `${mutation.id}\t${mutation.action}\t${mutation.undoneAt ? 'undone' : 'active'}\t${mutation.createdAt}`,
      )
      .join('\n'),
  );
};

const undoMutation = async (args) => {
  const mutationId = requireId(positionals(args)[0], 'Mutation ID');
  if (!args.includes('--yes')) {
    if (!process.stdin.isTTY) {
      throw new Error('Mutation undo requires --yes in non-interactive mode.');
    }
    const prompts = createPrompts();
    try {
      if (
        !(await prompts.confirm(
          `Undo Workspace mutation ${mutationId}?`,
          false,
        ))
      ) {
        return;
      }
    } finally {
      prompts.close();
    }
  }
  const { client } = await authenticatedClient();
  const result = await client.undoMutation(mutationId);
  output(result, args.includes('--json'), (value) =>
    `Mutation undone at Workspace revision ${value.revision}.`,
  );
};

const requireProjectId = (args, config) => {
  const projectId = option(args, '--project') ?? config.projectId;
  if (!projectId) {
    throw new Error('A Project is required. Pass --project or run login.');
  }
  return projectId;
};

const taskContent = (args) =>
  loadTaskContent({
    content: option(args, '--content'),
    contentFile: option(args, '--content-file'),
    contentJson: option(args, '--content-json'),
  });

const runTask = async (args) => {
  const action = args[0];
  const values = positionals(args.slice(1));
  const json = args.includes('--json');
  const { client, config } = await authenticatedClient();

  if (action === 'list') {
    if (args.includes('--root') && option(args, '--parent') !== undefined) {
      throw new Error('Use either --root or --parent, not both.');
    }
    const parentId = option(args, '--parent');
    let projectId = option(args, '--project');
    if (parentId && !projectId) {
      projectId = (await client.showTask(parentId)).task.projectId;
    }
    const result = await client.listTasks(
      projectId ?? requireProjectId(args, config),
      {
        includeCompleted: args.includes('--all'),
        includeTrash: args.includes('--trash'),
      },
    );
    const filtered = {
      ...result,
      tasks: result.tasks.filter(
        (task) =>
          (parentId === undefined || task.parentId === parentId) &&
          (!args.includes('--root') || task.parentId === null),
      ),
    };
    output(filtered, json, (value) =>
      value.tasks
        .map(
          (task) =>
            `${task.id}\tv${task.version}\t${task.completed ? 'done' : 'open'}\t${task.parentId ? 'subtask' : 'root'}\t${task.title}`,
        )
        .join('\n'),
    );
    return;
  }

  if (action === 'show') {
    const taskId = requireId(values[0], 'Task ID');
    const result = await client.showTask(taskId);
    output(result, json, (value) => [
      `${value.task.id}\tv${value.task.version}\t${value.task.title}`,
      `Project: ${value.task.projectId}`,
      `Parent: ${value.task.parentId ?? 'none'}`,
      `Milestone: ${value.task.milestoneId ?? 'none'}`,
      `Content: ${richTextPreview(value.task.content) || 'empty'}`,
    ].join('\n'),
    );
    return;
  }

  const idempotencyKey =
    option(args, '--idempotency-key') ?? randomUUID();
  if (action === 'create') {
    const title = requireId(values.join(' '), 'Task title');
    const parentId = option(args, '--parent');
    let projectId = option(args, '--project');
    if (parentId) {
      const parent = await client.showTask(parentId);
      if (projectId && projectId !== parent.task.projectId) {
        throw new Error('A subtask must use its parent Project.');
      }
      projectId = parent.task.projectId;
    }
    const content = await taskContent(args);
    const result = await client.createTask(
      projectId ?? requireProjectId(args, config),
      {
        title,
        scheduledDate: option(args, '--date') ?? today(),
        priority: option(args, '--priority') ?? 'none',
        ...(parentId ? { parentId } : {}),
        ...(option(args, '--milestone') !== undefined
          ? { milestoneId: option(args, '--milestone') }
          : {}),
        ...(content === undefined ? {} : { content }),
      },
      idempotencyKey,
    );
    output(result, json, (value) =>
      `Created ${value.task.id}: ${value.task.title}`,
    );
    return;
  }

  const taskId = requireId(values[0], 'Task ID');
  if (action === 'comment') {
    const message = requireId(option(args, '--message'), 'Comment message');
    const result = await client.addTaskComment(
      taskId,
      message,
      idempotencyKey,
    );
    output(result, json, () => `Comment added to ${taskId}.`);
    return;
  }

  const expectedVersion = integerOption(args, '--expected-version', true);
  let mutation;
  if (action === 'update') {
    if (option(args, '--parent') !== undefined && args.includes('--no-parent')) {
      throw new Error('Use either --parent or --no-parent, not both.');
    }
    if (
      option(args, '--milestone') !== undefined &&
      args.includes('--no-milestone')
    ) {
      throw new Error('Use either --milestone or --no-milestone, not both.');
    }
    const content = await taskContent(args);
    const changes = {
      ...(option(args, '--title') !== undefined
        ? { title: option(args, '--title') }
        : {}),
      ...(option(args, '--date') !== undefined
        ? { scheduledDate: option(args, '--date') }
        : {}),
      ...(option(args, '--priority') !== undefined
        ? { priority: option(args, '--priority') }
        : {}),
      ...(option(args, '--project') !== undefined
        ? { projectId: option(args, '--project') }
        : {}),
      ...(option(args, '--parent') !== undefined
        ? { parentId: option(args, '--parent') }
        : args.includes('--no-parent')
          ? { parentId: null }
          : {}),
      ...(option(args, '--milestone') !== undefined
        ? { milestoneId: option(args, '--milestone') }
        : args.includes('--no-milestone')
          ? { milestoneId: null }
          : {}),
      ...(content === undefined ? {} : { content }),
    };
    if (Object.keys(changes).length === 0) {
      throw new Error('Task update requires at least one change.');
    }
    mutation = { action: 'task.update', changes, expectedVersion };
  } else if (
    ['complete', 'reopen', 'restore', 'trash'].includes(action)
  ) {
    if (action === 'trash' && !args.includes('--yes')) {
      if (!process.stdin.isTTY) {
        throw new Error('Task trash requires --yes in non-interactive mode.');
      }
      const prompts = createPrompts();
      try {
        if (!(await prompts.confirm(`Move task ${taskId} to trash?`, false))) {
          return;
        }
      } finally {
        prompts.close();
      }
    }
    mutation = { action: `task.${action}`, expectedVersion };
  } else {
    throw new Error(`Unknown task command: ${action ?? ''}`);
  }
  const result = await client.mutateTask(
    taskId,
    mutation,
    idempotencyKey,
  );
  output(result, json, (value) =>
    `Updated ${value.task.id} to v${value.task.version}.`,
  );
};

const milestoneChanges = (args, dateRequired = false) => {
  const date = option(args, '--date');
  if (dateRequired && date === undefined) {
    throw new Error('--date is required for milestone creation.');
  }
  if (args.includes('--pinned') && args.includes('--unpinned')) {
    throw new Error('Use either --pinned or --unpinned, not both.');
  }
  const reminders = reminderOffsets(option(args, '--reminders'));
  return {
    ...(option(args, '--title') !== undefined
      ? { title: option(args, '--title') }
      : {}),
    ...(option(args, '--type') !== undefined
      ? { type: option(args, '--type') }
      : {}),
    ...(date !== undefined
      ? {
          dateRule: milestoneDateRule({
            date,
            leapDayPolicy: option(args, '--leap-day-policy'),
            leapMonth: args.includes('--leap-month'),
            lunar: args.includes('--lunar'),
            missingLeapMonthPolicy: option(
              args,
              '--missing-leap-month-policy',
            ),
            yearly: args.includes('--yearly'),
          }),
        }
      : {}),
    ...(option(args, '--start-year') !== undefined
      ? { startYear: integerOption(args, '--start-year') }
      : args.includes('--no-start-year')
        ? { startYear: null }
        : {}),
    ...(reminders === undefined ? {} : { reminderOffsets: reminders }),
    ...(option(args, '--notes') !== undefined
      ? { notes: option(args, '--notes') }
      : {}),
    ...(option(args, '--icon') !== undefined
      ? { icon: option(args, '--icon') }
      : {}),
    ...(option(args, '--color') !== undefined
      ? { color: option(args, '--color') }
      : {}),
    ...(args.includes('--pinned')
      ? { pinned: true }
      : args.includes('--unpinned')
        ? { pinned: false }
        : {}),
  };
};

const runMilestone = async (args) => {
  const action = args[0];
  const values = positionals(args.slice(1));
  const json = args.includes('--json');
  const { client, config } = await authenticatedClient();
  if (!config.workspaceId) {
    throw new Error('No Workspace selected. Run `lightflux login`.');
  }

  if (action === 'list') {
    const result = await client.listMilestones(config.workspaceId, {
      includeArchived: args.includes('--archived'),
      includeTrash: args.includes('--trash'),
    });
    output(result, json, (value) =>
      value.milestones
        .map(
          (milestone) =>
            `${milestone.id}\tv${milestone.version}\t${milestone.type}\t${milestone.title}`,
        )
        .join('\n'),
    );
    return;
  }
  if (action === 'show') {
    const milestoneId = requireId(values[0], 'Milestone ID');
    const result = await client.showMilestone(milestoneId);
    output(result, json, (value) =>
      `${value.milestone.id}\tv${value.milestone.version}\t${value.milestone.type}\t${value.milestone.title}`,
    );
    return;
  }

  const idempotencyKey =
    option(args, '--idempotency-key') ?? randomUUID();
  if (action === 'create') {
    const title = requireId(values.join(' '), 'Milestone title');
    const result = await client.createMilestone(
      config.workspaceId,
      {
        ...milestoneChanges(args, true),
        title,
        type: option(args, '--type') ?? 'custom',
      },
      idempotencyKey,
    );
    output(result, json, (value) =>
      `Created milestone ${value.milestone.id}: ${value.milestone.title}`,
    );
    return;
  }

  const milestoneId = requireId(values[0], 'Milestone ID');
  const expectedVersion = integerOption(args, '--expected-version', true);
  let mutation;
  if (action === 'update') {
    const changes = milestoneChanges(args);
    if (Object.keys(changes).length === 0) {
      throw new Error('Milestone update requires at least one change.');
    }
    mutation = { action: 'milestone.update', changes, expectedVersion };
  } else if (
    ['archive', 'restore', 'trash', 'unarchive'].includes(action)
  ) {
    if (action === 'trash' && !args.includes('--yes')) {
      if (!process.stdin.isTTY) {
        throw new Error(
          'Milestone trash requires --yes in non-interactive mode.',
        );
      }
      const prompts = createPrompts();
      try {
        if (
          !(await prompts.confirm(
            `Move milestone ${milestoneId} to trash?`,
            false,
          ))
        ) {
          return;
        }
      } finally {
        prompts.close();
      }
    }
    mutation = {
      action: `milestone.${action}`,
      expectedVersion,
    };
  } else {
    throw new Error(`Unknown milestone command: ${action ?? ''}`);
  }
  const result = await client.mutateMilestone(
    milestoneId,
    mutation,
    idempotencyKey,
  );
  output(result, json, (value) =>
    `Updated milestone ${value.milestone.id} to v${value.milestone.version}.`,
  );
};

const requireId = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
};

const main = async () => {
  const args = process.argv.slice(2);
  const command = args[0];
  if (command === '--help' || command === '-h' || command === 'help') {
    printHelp();
  } else if (command === '--version' || command === '-v') {
    process.stdout.write(`${VERSION}\n`);
  } else if (command === 'login') {
    await runLogin();
  } else if (command === 'logout') {
    await runLogout();
  } else if (command === 'context') {
    await showContext(args.includes('--json'));
  } else if (command === 'projects') {
    await listProjects(args.slice(1));
  } else if (command === 'audit') {
    await showAudit(args.slice(1));
  } else if (command === 'undo') {
    await undoMutation(args.slice(1));
  } else if (command === 'task') {
    await runTask(args.slice(1));
  } else if (command === 'milestone') {
    await runMilestone(args.slice(1));
  } else if (args.length > 0) {
    throw new Error(`Unknown command: ${args.join(' ')}`);
  } else {
    await runSetup();
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`LightFlux: ${message}\n`);
  process.exitCode = 1;
});
