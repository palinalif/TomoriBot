import type { Client } from "discord.js";
import {
  getScheduledWorkStatus,
  initializeScheduledWorkCoordinator,
  runScheduledWorkNow,
  stopScheduledWorkCoordinator,
} from "./scheduledWorkCoordinator";

/**
 * Compatibility wrapper around the shared scheduled work coordinator.
 * Reminder execution now runs through the coordinator alongside random triggers.
 */
export function initializeReminderTimer(client: Client): void {
  initializeScheduledWorkCoordinator(client);
}

export function stopReminderTimer(): void {
  stopScheduledWorkCoordinator();
}

export function getReminderTimerStatus(): {
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

export async function checkRemindersManually(): Promise<void> {
  await runScheduledWorkNow("manual-reminder-check");
}
