import { describe, expect, it } from 'vitest';

import {
  buildProjectProgress,
  getProjectProgress,
  progressPercent,
  withAlpha,
} from '../components/projects/projectProgressStats';
import { Todo } from '../types/todo';

const todo = (overrides: Partial<Todo>): Todo =>
  ({
    id: 'id',
    title: 'task',
    completed: false,
    completedAt: null,
    createdAt: 1,
    updatedAt: 1,
    scheduledDate: '2026-09-17',
    projectId: 'inbox',
    milestoneId: null,
    parentId: null,
    priority: 'none',
    sortOrder: 0,
    trashedAt: null,
    content: { type: 'doc', content: [] },
    ...overrides,
  }) as Todo;

describe('buildProjectProgress', () => {
  it('counts completed over all non-trashed tasks including subtasks', () => {
    const progress = buildProjectProgress([
      todo({ id: 'a', projectId: 'p1', completed: true }),
      todo({ id: 'b', projectId: 'p1' }),
      todo({ id: 'c', projectId: 'p1', parentId: 'b' }),
    ]);
    expect(getProjectProgress(progress, 'p1')).toEqual({
      completed: 1,
      total: 3,
      ratio: 1 / 3,
    });
  });

  it('excludes trashed tasks and reports 100% when everything is done', () => {
    const progress = buildProjectProgress([
      todo({ id: 'a', projectId: 'p1', completed: true }),
      todo({ id: 'b', projectId: 'p1', completed: true, trashedAt: 9 }),
    ]);
    const project = getProjectProgress(progress, 'p1');
    expect(project.total).toBe(1);
    expect(project.ratio).toBe(1);
    expect(progressPercent(project.ratio)).toBe(100);
  });

  it('defaults missing projects and unassigned tasks to inbox', () => {
    const progress = buildProjectProgress([
      todo({ id: 'a', projectId: undefined }),
      todo({ id: 'b', projectId: undefined, completed: true }),
    ]);
    expect(getProjectProgress(progress, 'inbox').ratio).toBe(0.5);
    expect(getProjectProgress(progress, 'missing')).toEqual({
      completed: 0,
      total: 0,
      ratio: 0,
    });
  });

  it('rounds percentages and converts project hex colors to rgba', () => {
    expect(progressPercent(1 / 3)).toBe(33);
    expect(progressPercent(2 / 3)).toBe(67);
    expect(withAlpha('#55B9A5', 0.14)).toBe('rgba(85, 185, 165, 0.14)');
    expect(withAlpha('invalid', 0.2)).toBe('rgba(103, 89, 232, 0.2)');
  });
});
