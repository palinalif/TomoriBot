import { z } from "zod";
import {
	buildCustomMessages,
	callCustomChatCompletions,
	extractCustomResponseText,
} from "@/providers/custom/customOpenAICompatibleUtils";
import { callCustomStructuredJSON } from "@/providers/custom/customStructuredOutput";
import type {
	CompactConversationResult,
	CompactRoleplayResult,
	ProviderCompactSummaryRequest as CompactSummaryRequest,
} from "@/types/provider/featureInterfaces";
import { log } from "@/utils/misc/logger";

function buildRoleplaySchema() {
	return {
		type: "object" as const,
		properties: {
			overall_scene_summary: { type: "string" as const },
			characters: {
				type: "array" as const,
				items: {
					type: "object" as const,
					properties: {
						name: { type: "string" as const },
						current_goals: { type: "string" as const },
						emotional_status: { type: "string" as const },
						physical_status: { type: "string" as const },
						appearance_clothing: { type: "string" as const },
						inventory: { type: "string" as const },
					},
					required: [
						"name",
						"current_goals",
						"emotional_status",
						"physical_status",
						"appearance_clothing",
						"inventory",
					],
				},
			},
		},
		required: ["overall_scene_summary", "characters"],
	};
}

const CompactRoleplaySummarySchema = z.object({
	overall_scene_summary: z.string(),
	characters: z.array(
		z.object({
			name: z.string(),
			current_goals: z.string(),
			emotional_status: z.string(),
			physical_status: z.string(),
			appearance_clothing: z.string(),
			inventory: z.string(),
		}),
	),
});

export async function generateConversationSummaryCustom(
	request: CompactSummaryRequest,
): Promise<CompactConversationResult> {
	try {
		const messages = await buildCustomMessages({
			systemPrompt: request.systemPrompt,
			userPrompt: request.userPrompt,
			images: request.images,
		});

		const body: Record<string, unknown> = {
			...(request.model !== "other-model" ? { model: request.model } : {}),
			messages,
			temperature: request.temperature ?? 0.7,
			max_tokens: 4096,
			stream: false,
		};

		const response = await callCustomChatCompletions({
			endpointUrl: request.endpointUrl,
			apiKey: request.apiKey,
			body,
			logLabel: "Custom compact summary",
			messagesForLog: messages as Array<Record<string, unknown>>,
		});

		if (!response.success) {
			log.error(
				"Custom compact summary request failed",
				new Error(response.error.errorBody),
				{
					errorType: "CustomCompactSummaryHttpError",
					metadata: {
						model: request.model,
						status: response.error.status,
						statusText: response.error.statusText,
					},
				},
			);
			return {
				error:
					response.error.status === 0
						? response.error.errorBody
						: `Custom endpoint request failed (${response.error.status}): ${response.error.statusText}`,
			};
		}

		const responseText = extractCustomResponseText(
			response.data.choices?.[0]?.message?.content,
		);
		if (!responseText) {
			return {
				error: "Custom endpoint returned an empty response.",
			};
		}

		return {
			summary: responseText,
		};
	} catch (error) {
		log.error("Custom compact summary failed", error as Error);
		return {
			error:
				error instanceof Error
					? error.message
					: "Unknown custom endpoint error",
		};
	}
}

export async function generateRoleplaySummaryCustom(
	request: CompactSummaryRequest,
): Promise<CompactRoleplayResult> {
	const result = await callCustomStructuredJSON(
		{
			...request,
			systemPrompt: request.systemPrompt ?? "",
			schemaName: "roleplay_summary",
		},
		buildRoleplaySchema(),
		CompactRoleplaySummarySchema,
	);

	if (!result.success) {
		return {
			error: result.error,
		};
	}

	return {
		summary: result.data,
	};
}
