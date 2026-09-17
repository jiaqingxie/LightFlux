import { Project, Todo } from '../../types/todo';
import { ProjectProgress } from './projectProgressStats';

export interface ProjectSection {
  id: string;
  name: string;
  color: string;
  kind: Project['kind'];
  sortOrder: number;
  todos: Todo[];
  progress: ProjectProgress;
}

export interface InlineComposerState {
  anchorId: string;
  projectId: string;
  parentId: string | null;
  renderAfterId: string;
  scheduledDate: string;
}
