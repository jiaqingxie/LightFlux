declare module "@lightflux/domain" {
  export function mutateTaskState(options: unknown): import("./todo").Todo;
  export function mutateMilestoneState(
    options: unknown,
  ): import("./todo").Milestone;
  export function publicTask(
    task: unknown,
    revision: number,
    content?: boolean,
  ): Record<string, unknown>;
  export function publicMilestone(
    milestone: unknown,
    revision: number,
  ): Record<string, unknown>;
  export function mutateProjectState(
    options: unknown,
  ): import("./todo").Project;
  export function publicProject(
    project: unknown,
    revision: number,
  ): Record<string, unknown>;
  export function httpError(
    status: number,
    message: string,
    details?: object,
  ): Error & { status: number };
}
