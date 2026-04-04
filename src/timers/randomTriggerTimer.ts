import type { Client } from "discord.js";
import {
  getScheduledWorkStatus,
  initializeScheduledWorkCoordinator,
  runScheduledWorkNow,
  stopScheduledWorkCoordinator,
} from "./scheduledWorkCoordinator";

/**
 * Compatibility wrapper around the shared scheduled work coordinator.
 * Random trigger execution now runs through the coordinator alongside reminders.
 */
export function initializeRandomTriggerTimer(client: Client): void {
  initializeScheduledWorkCoordinator(client);
}

export function stopRandomTriggerTimer(): void {
  stopScheduledWorkCoordinator();
}

export function getRandomTriggerTimerStatus(): {
  isRunning: boolean;
  intervalMs: number;
} | null {
  const status = getScheduledWorkStatus();
  if (!status) {
    return null;
  }

  return {
    isRunning: status.isRunning,
    intervalMs: status.reconcileIntervalMs,
  };
}

export async function checkRandomTriggersManually(): Promise<void> {
  await runScheduledWorkNow("manual-random-trigger-check");
}
