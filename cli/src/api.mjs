export class LightFluxApiError extends Error {
  constructor(message, status, details = {}) {
    super(message);
    this.status = status;
    this.code = details.code;
    this.currentTask = details.currentTask;
    this.currentMilestone = details.currentMilestone;
  }
}

const request = async ({
  apiUrl,
  body,
  fetchImplementation,
  idempotencyKey,
  method = 'GET',
  path,
  token,
}) => {
  const response = await fetchImplementation(
    `${apiUrl.replace(/\/$/, '')}${path}`,
    {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        'User-Agent': 'lightflux-cli/0.1.0',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    const unavailable =
      response.status === 404
        ? 'The requested LightFlux API resource is not available.'
        : `LightFlux API request failed with status ${response.status}.`;
    throw new LightFluxApiError(
      responseBody.error || unavailable,
      response.status,
      responseBody,
    );
  }
  return responseBody;
};

export const createApiClient = ({
  apiUrl,
  token,
  fetchImplementation = fetch,
}) => {
  const call = (path, options = {}) =>
    request({
      apiUrl,
      fetchImplementation,
      path,
      token,
      ...options,
    });

  return {
    addTaskComment: (taskId, message, idempotencyKey) =>
      call(`/api/v1/tasks/${encodeURIComponent(taskId)}/comments`, {
        body: { message },
        idempotencyKey,
        method: 'POST',
      }),
    createTask: (projectId, task, idempotencyKey) =>
      call(`/api/v1/projects/${encodeURIComponent(projectId)}/tasks`, {
        body: task,
        idempotencyKey,
        method: 'POST',
      }),
    createMilestone: (workspaceId, milestone, idempotencyKey) =>
      call(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/milestones`,
        {
          body: milestone,
          idempotencyKey,
          method: 'POST',
        },
      ),
    exchangeDeviceAuthorization: (deviceCode) =>
      call('/api/v1/auth/device/token', {
        body: { deviceCode },
        method: 'POST',
      }),
    listProjects: async (workspaceId) => {
      const result = await call(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/projects`,
      );
      return result.projects;
    },
    listMilestones: async (
      workspaceId,
      { includeArchived = false, includeTrash = false } = {},
    ) => {
      const query = new URLSearchParams({
        archived: String(includeArchived),
        trash: String(includeTrash),
      });
      return call(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/milestones?${query}`,
      );
    },
    listAudit: async (workspaceId) =>
      call(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/audit`,
      ),
    listTasks: async (
      projectId,
      { includeCompleted = false, includeTrash = false } = {},
    ) => {
      const query = new URLSearchParams({
        completed: String(includeCompleted),
        trash: String(includeTrash),
      });
      const result = await call(
        `/api/v1/projects/${encodeURIComponent(projectId)}/tasks?${query}`,
      );
      return result;
    },
    listWorkspaces: async () => {
      const result = await call('/api/v1/workspaces');
      return result.workspaces;
    },
    logout: () => call('/api/v1/auth/logout', { method: 'POST' }),
    mutateTask: (taskId, mutation, idempotencyKey) =>
      call(`/api/v1/tasks/${encodeURIComponent(taskId)}/mutations`, {
        body: mutation,
        idempotencyKey,
        method: 'POST',
      }),
    mutateMilestone: (milestoneId, mutation, idempotencyKey) =>
      call(
        `/api/v1/milestones/${encodeURIComponent(milestoneId)}/mutations`,
        {
          body: mutation,
          idempotencyKey,
          method: 'POST',
        },
      ),
    requestDeviceAuthorization: () =>
      call('/api/v1/auth/device', { method: 'POST' }),
    showTask: (taskId) =>
      call(`/api/v1/tasks/${encodeURIComponent(taskId)}`),
    showMilestone: (milestoneId) =>
      call(`/api/v1/milestones/${encodeURIComponent(milestoneId)}`),
    undoMutation: (mutationId) =>
      call(
        `/api/v1/mutations/${encodeURIComponent(mutationId)}/undo`,
        { method: 'POST' },
      ),
  };
};
