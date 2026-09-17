import { INBOX_PROJECT_ID, Todo } from '../../types/todo';

export interface ProjectProgress {
  completed: number;
  total: number;
  ratio: number;
}

const emptyProgress: ProjectProgress = { completed: 0, total: 0, ratio: 0 };

// UI-only projection of completion per project. Only non-trashed todos count:
// completed and active tasks share the denominator, trashed tasks are excluded
// to match the active-task surfaces. Subtasks count individually.
export const buildProjectProgress = (
  nonTrashedTodos: Todo[],
): Map<string, ProjectProgress> => {
  const totals = new Map<string, { completed: number; total: number }>();

  nonTrashedTodos.forEach((todo) => {
    if (todo.trashedAt !== null) {
      return;
    }
    const projectId = todo.projectId ?? INBOX_PROJECT_ID;
    const current = totals.get(projectId) ?? { completed: 0, total: 0 };
    current.total += 1;
    if (todo.completed) {
      current.completed += 1;
    }
    totals.set(projectId, current);
  });

  return new Map(
    Array.from(totals.entries()).map(([projectId, { completed, total }]) => [
      projectId,
      {
        completed,
        total,
        ratio: total === 0 ? 0 : Math.min(1, Math.max(0, completed / total)),
      },
    ]),
  );
};

export const getProjectProgress = (
  progressByProject: Map<string, ProjectProgress>,
  projectId: string,
): ProjectProgress => progressByProject.get(projectId) ?? emptyProgress;

export const progressPercent = (ratio: number): number =>
  Math.round(Math.min(1, Math.max(0, ratio)) * 100);

// Project colors are stored as #RRGGBB; the track reuses the same hue at low
// opacity so every project reads as "its own color" without new tokens.
export const withAlpha = (hex: string, alpha: number): string => {
  const normalized = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(103, 89, 232, ${alpha})`;
  }
  const channels = [0, 2, 4].map((offset) =>
    parseInt(normalized.slice(offset, offset + 2), 16),
  );
  return `rgba(${channels.join(', ')}, ${alpha})`;
};
