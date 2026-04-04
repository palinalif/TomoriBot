type ScheduledWorkNudgeHandler = (reason?: string) => void;

let scheduledWorkNudgeHandler: ScheduledWorkNudgeHandler | null = null;

export function registerScheduledWorkNudgeHandler(handler: ScheduledWorkNudgeHandler): void {
  scheduledWorkNudgeHandler = handler;
}

export function clearScheduledWorkNudgeHandler(): void {
  scheduledWorkNudgeHandler = null;
}

export function emitScheduledWorkNudge(reason?: string): void {
  scheduledWorkNudgeHandler?.(reason);
}
