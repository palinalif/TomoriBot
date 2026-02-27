/**
 * Random Trigger Timer System
 * Timer-based probabilistic auto-trigger: every N hours, P% chance the bot speaks.
 * Mirrors reminderTimer.ts in structure. Polls every minute for due triggers.
 */

import type { Client } from "discord.js";
import { ChannelType } from "discord.js";
import { log } from "../utils/misc/logger";
import { getDueRandomTriggers } from "../utils/db/dbRead";
import { rescheduleRandomTrigger } from "../utils/db/dbWrite";
import type { RandomTriggerRow, TomoriState } from "../types/db/schema";
import tomoriChat, {
	suppressNextSelfReply,
} from "../events/messageCreate/tomoriChat";
import { getCachedAllPersonas } from "../utils/cache/tomoriStateCache";

/**
 * Class managing the random trigger polling system.
 * Each minute, any trigger whose next_trigger_at has passed is evaluated:
 *   - Dice roll determines whether to fire
 *   - Silence and self-reply guards are applied
 *   - tomoriChat() is invoked, then the trigger is rescheduled
 */
export class RandomTriggerTimer {
	private client: Client;
	private intervalId: NodeJS.Timeout | null = null;
	private isRunning = false;
	private readonly POLL_INTERVAL_MS = 60000; // Check every minute

	constructor(client: Client) {
		this.client = client;
	}

	/**
	 * Starts the random trigger polling timer.
	 */
	public start(): void {
		if (this.isRunning) {
			log.warn("Random trigger timer is already running");
			return;
		}

		log.info("Starting random trigger timer (polling every 60s)");
		this.isRunning = true;

		// Run immediately on start to catch any triggers that fired while offline
		this.checkTriggers().catch((error) => {
			log.error(
				"Error during initial random trigger check on timer start:",
				error,
			);
		});

		// Set up regular polling interval
		this.intervalId = setInterval(() => {
			this.checkTriggers().catch((error) => {
				log.error("Error during scheduled random trigger check:", error);
			});
		}, this.POLL_INTERVAL_MS);

		log.success("Random trigger timer started successfully");
	}

	/**
	 * Stops the random trigger polling timer.
	 */
	public stop(): void {
		if (!this.isRunning) {
			log.warn("Random trigger timer is not running");
			return;
		}

		log.info("Stopping random trigger timer");
		this.isRunning = false;

		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}

		log.success("Random trigger timer stopped successfully");
	}

	/**
	 * Polls for due triggers and processes each one.
	 * A "due" trigger has next_trigger_at <= NOW().
	 */
	public async checkTriggers(): Promise<void> {
		try {
			const dueTriggers = await getDueRandomTriggers();

			if (!dueTriggers || dueTriggers.length === 0) {
				// No due triggers — normal operation, no log needed
				return;
			}

			log.info(`Processing ${dueTriggers.length} due random trigger(s)`);

			// Process each trigger sequentially to avoid flooding
			for (const trigger of dueTriggers) {
				await this.executeTrigger(trigger);
			}
		} catch (error) {
			log.error("Error checking for due random triggers:", error);
		}
	}

	/**
	 * Evaluates and potentially executes a single random trigger.
	 * Always reschedules at the end, regardless of whether it fired.
	 *
	 * @param trigger - The due RandomTriggerRow to process
	 */
	private async executeTrigger(trigger: RandomTriggerRow): Promise<void> {
		const triggerId = trigger.trigger_id ?? 0;

		try {
			log.info(
				`Evaluating random trigger ${triggerId} (channel=${trigger.channel_disc_id}, chance=${trigger.chance_percent}%)`,
			);

			// ── Step 1: Dice roll ────────────────────────────────────────────────
			// Fire when random number [0, 100) < chance_percent
			const roll = Math.random() * 100;
			if (roll >= trigger.chance_percent) {
				log.info(
					`Random trigger ${triggerId} missed the roll (${roll.toFixed(1)} >= ${trigger.chance_percent}) — rescheduling`,
				);
				await this.rescheduleTrigger(triggerId, trigger.timer_hours);
				return;
			}

			// ── Step 2: Fetch and validate target channel ────────────────────────
			const rawChannel = await this.client.channels
				.fetch(trigger.channel_disc_id)
				.catch(() => null);

			if (!rawChannel) {
				log.warn(
					`Random trigger ${triggerId}: channel ${trigger.channel_disc_id} not found — rescheduling`,
				);
				await this.rescheduleTrigger(triggerId, trigger.timer_hours);
				return;
			}

			// Must be a text-based guild channel to proceed
			if (
				!rawChannel.isTextBased() ||
				rawChannel.type === ChannelType.DM ||
				rawChannel.type === ChannelType.GroupDM
			) {
				log.warn(
					`Random trigger ${triggerId}: channel ${trigger.channel_disc_id} is not a guild text channel — rescheduling`,
				);
				await this.rescheduleTrigger(triggerId, trigger.timer_hours);
				return;
			}

			// ── Step 3: Silence guard ────────────────────────────────────────────
			// If silence_threshold_hours is set, skip if the channel had recent activity
			let lastMessage: import("discord.js").Message | undefined;
			if ("messages" in rawChannel) {
				try {
					const messages = await rawChannel.messages.fetch({ limit: 1 });
					lastMessage = messages.first();
				} catch {
					log.warn(
						`Random trigger ${triggerId}: failed to fetch last message from channel`,
					);
				}
			}

			if (trigger.silence_threshold_hours !== null && trigger.silence_threshold_hours !== undefined) {
				if (lastMessage) {
					const ageMs = Date.now() - lastMessage.createdTimestamp;
					const ageHours = ageMs / (1000 * 60 * 60);
					if (ageHours < trigger.silence_threshold_hours) {
						log.info(
							`Random trigger ${triggerId}: channel active ${ageHours.toFixed(2)}h ago, threshold is ${trigger.silence_threshold_hours}h — skipping & rescheduling`,
						);
						await this.rescheduleTrigger(triggerId, trigger.timer_hours);
						return;
					}
				}
			}

			// ── Step 4: Select persona ───────────────────────────────────────────
			// NULL tomori_id means "Random" — pick from all server personas
			let chosenPersona: TomoriState | null = null;

			if (!("guild" in rawChannel) || !rawChannel.guild) {
				log.warn(
					`Random trigger ${triggerId}: channel has no guild reference — rescheduling`,
				);
				await this.rescheduleTrigger(triggerId, trigger.timer_hours);
				return;
			}

			const guildDiscId = rawChannel.guild.id;
			const allPersonas = await getCachedAllPersonas(guildDiscId);

			if (allPersonas.length === 0) {
				log.warn(
					`Random trigger ${triggerId}: no personas found for guild ${guildDiscId} — rescheduling`,
				);
				await this.rescheduleTrigger(triggerId, trigger.timer_hours);
				return;
			}

			if (trigger.tomori_id === null || trigger.tomori_id === undefined) {
				// Random selection: pick uniformly from all personas
				const randomIndex = Math.floor(Math.random() * allPersonas.length);
				chosenPersona = allPersonas[randomIndex] ?? null;
			} else {
				// Named persona: look up by tomori_id
				chosenPersona =
					allPersonas.find((p) => p.tomori_id === trigger.tomori_id) ?? null;
			}

			if (!chosenPersona) {
				log.warn(
					`Random trigger ${triggerId}: could not resolve persona (tomori_id=${trigger.tomori_id}) — rescheduling`,
				);
				await this.rescheduleTrigger(triggerId, trigger.timer_hours);
				return;
			}

			// ── Step 5: Self-reply guard ─────────────────────────────────────────
			// If respond_to_self = false, skip if the chosen persona spoke last
			if (!trigger.respond_to_self && lastMessage) {
				// Webhook-based persona messages: check username against persona nickname
				const isPersonaLastSpeaker =
					lastMessage.webhookId !== null &&
					lastMessage.author.username === chosenPersona.tomori_nickname;

				if (isPersonaLastSpeaker) {
					log.info(
						`Random trigger ${triggerId}: persona "${chosenPersona.tomori_nickname}" spoke last, respond_to_self=false — skipping & rescheduling`,
					);
					await this.rescheduleTrigger(triggerId, trigger.timer_hours);
					return;
				}
			}

			// ── Step 6: Seed placeholder if channel is empty ─────────────────────
			// tomoriChat requires a last message as context anchor
			if (!lastMessage) {
				if ("send" in rawChannel) {
					try {
						lastMessage = await rawChannel.send({
							content: "\u2800", // Braille blank: invisible but counts as content
						});
						log.info(
							`Seeded placeholder message in channel ${trigger.channel_disc_id} for random trigger ${triggerId}`,
						);
					} catch (sendError) {
						log.warn(
							`Failed to seed placeholder in channel ${trigger.channel_disc_id} for random trigger ${triggerId}:`,
							sendError,
						);
					}
				}
			}

			// If still no message, we cannot drive tomoriChat
			if (!lastMessage) {
				log.warn(
					`Random trigger ${triggerId}: no messages in channel and seeding failed — rescheduling`,
				);
				await this.rescheduleTrigger(triggerId, trigger.timer_hours);
				return;
			}

			// ── Step 7: Suppress self-reply suppressor so the trigger fires freely ─
			suppressNextSelfReply(rawChannel.id);

			log.info(
				`Random trigger ${triggerId}: firing for persona "${chosenPersona.tomori_nickname}" in channel ${trigger.channel_disc_id}`,
			);

			// ── Step 8: Call tomoriChat ──────────────────────────────────────────
			await tomoriChat(
				this.client,
				lastMessage,
				false, // isFromQueue
				true, // isManuallyTriggered
				false, // forceReason
				undefined, // reasoningQuery
				undefined, // llmOverrideCodename
				false, // isStopResponse
				0, // retryCount
				false, // skipLock
				undefined, // reminderRecipientID
				undefined, // reminderContext (reminder_purpose, etc.)
				chosenPersona.tomori_id, // selectedPersonaId
				false, // isPersonaJob
				false, // isUserImpersonation
				undefined, // impersonatedUserId
				trigger.custom_prompt ?? undefined, // manualSystemPrompt
			);

			log.success(
				`Random trigger ${triggerId} fired successfully for persona "${chosenPersona.tomori_nickname}"`,
			);
		} catch (error) {
			log.error(
				`Error executing random trigger ${triggerId}:`,
				error,
			);
		} finally {
			// ── Step 9: Always reschedule after processing (hit or miss) ──────────
			await this.rescheduleTrigger(triggerId, trigger.timer_hours);
		}
	}

	/**
	 * Advances next_trigger_at by timer_hours from now.
	 *
	 * @param triggerId - The trigger_id to reschedule
	 * @param timerHours - The configured interval
	 */
	private async rescheduleTrigger(
		triggerId: number,
		timerHours: number,
	): Promise<void> {
		const rescheduled = await rescheduleRandomTrigger(triggerId, timerHours);
		if (!rescheduled) {
			log.error(
				`Failed to reschedule random trigger ${triggerId} — it may fire repeatedly until rescheduled`,
			);
		}
	}

	/**
	 * Returns the current running status and poll interval.
	 */
	public getStatus(): { isRunning: boolean; intervalMs: number } {
		return {
			isRunning: this.isRunning,
			intervalMs: this.POLL_INTERVAL_MS,
		};
	}
}

// ─── Module-Level Instance ────────────────────────────────────────────────────

/** Singleton timer instance */
let randomTriggerTimerInstance: RandomTriggerTimer | null = null;

/**
 * Initializes and starts the random trigger timer system.
 * Safe to call multiple times — subsequent calls are no-ops.
 *
 * @param client - The Discord client
 */
export function initializeRandomTriggerTimer(client: Client): void {
	if (randomTriggerTimerInstance) {
		log.warn("Random trigger timer already initialized");
		return;
	}

	randomTriggerTimerInstance = new RandomTriggerTimer(client);
	randomTriggerTimerInstance.start();
	log.success("Random trigger timer system initialized");
}

/**
 * Stops and destroys the random trigger timer system.
 */
export function stopRandomTriggerTimer(): void {
	if (randomTriggerTimerInstance) {
		randomTriggerTimerInstance.stop();
		randomTriggerTimerInstance = null;
		log.success("Random trigger timer system stopped");
	}
}

/**
 * Returns the current status of the random trigger timer.
 * Returns null if the timer has not been initialized.
 */
export function getRandomTriggerTimerStatus(): {
	isRunning: boolean;
	intervalMs: number;
} | null {
	return randomTriggerTimerInstance
		? randomTriggerTimerInstance.getStatus()
		: null;
}

/**
 * Manually triggers a check for due random triggers (useful for testing).
 */
export async function checkRandomTriggersManually(): Promise<void> {
	if (!randomTriggerTimerInstance) {
		throw new Error("Random trigger timer not initialized");
	}
	await randomTriggerTimerInstance.checkTriggers();
}
