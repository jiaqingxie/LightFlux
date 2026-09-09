const selectOption = async ({ choose, label, options, write }) => {
  if (options.length === 1) {
    write(`${label}: ${options[0].label}\n`);
    return options[0].value;
  }
  return choose(label, options);
};

export const selectWorkspaceContext = async ({
  choose,
  client,
  write = (value) => process.stdout.write(value),
}) => {
  const workspaces = await client.listWorkspaces();
  if (workspaces.length === 0) {
    throw new Error('No Workspace is available for this account.');
  }
  const workspaceId = await selectOption({
    choose,
    label: 'Workspace',
    options: workspaces.map((workspace) => ({
      label: `${workspace.name} (${workspace.kind})`,
      value: workspace.id,
    })),
    write,
  });
  const workspace = workspaces.find((item) => item.id === workspaceId);
  const projects = await client.listProjects(workspaceId);
  if (projects.length === 0) {
    return { workspaceId, workspaceName: workspace?.name };
  }
  const projectId = await selectOption({
    choose,
    label: 'Default Project for task commands',
    options: projects.map((project) => ({
      label: project.name,
      value: project.id,
    })),
    write,
  });
  return {
    workspaceId,
    workspaceName: workspace?.name,
    projectId,
    projectName: projects.find((item) => item.id === projectId)?.name,
  };
};
