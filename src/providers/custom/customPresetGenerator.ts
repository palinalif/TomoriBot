import { executeTool } from "@/tools/toolRegistry";
import type { ToolContext, ToolResult } from "@/types/tool/interfaces";
import type {
	GeneratePresetParams,
	PresetGenerationResult,
} from "@/types/provider/featureInterfaces";
import { log } from "@/utils/misc/logger";
import {
	sanitizeSampleDialogueText,
} from "@/providers/google/presetGenerator";
import { getCustomToolAdapter } from "@/providers/custom/customToolAdapter";
import {
	callCustomChatCompletions,
	extractCustomResponseText,
	parseCustomJsonResponse,
} from "@/providers/custom/customOpenAICompatibleUtils";

interface CustomPresetGenerationOptions {
	endpointUrl: string;
	model: string;
	temperature?: number;
	tools?: Array<Record<string, unknown>>;
	toolContext?: ToolContext;
	maxToolRounds?: number;
}

type CustomContentPart =
	| { type: "text"; text: string }
	| { type: "image_url"; image_url: { url: string } };

type CustomMessage =
	| { role: "user"; content: string | CustomContentPart[] }
	| {
			role: "assistant";
			content?: string | null;
			tool_calls?: CustomToolCall[];
	  }
	| { role: "tool"; tool_call_id: string; content: string };

interface CustomToolCall {
	id?: string;
	type?: string;
	function?: {
		name?: string;
		arguments?: string;
	};
}

function buildPresetResponseSchema() {
	return {
		type: "object" as const,
		properties: {
			attribute_list: {
				type: "array" as const,
				description:
					"Array containing exactly 6 items describing different facets of the character, in this exact order: 1) {bot}'s Description (core identity and essence), 2) {bot}'s Appearance (physical traits and style), 3) {bot}'s Personality (personality traits, comma-separated), 4) {bot}'s Likes (interests and preferences), 5) {bot}'s Dislikes (aversions and pet peeves), 6) {bot}'s Behavioral Quirks (unique mannerisms and patterns). Each item maximum 2000 characters, in this specific format per array item: \"{bot}'s Description: \"",
				items: {
					type: "string" as const,
					maxLength: 2000,
				},
				minItems: 6,
				maxItems: 6,
			},
			sample_dialogues_in: {
				type: "array" as const,
				description:
					"Array of exactly 5 example user messages. MUST include these 3 guided scenarios in order: 1) Self-introduction request, 2) Emotional/personal scenario, 3) Practical/functional scenario. Then add 2 free dialogue scenarios that showcase unique character traits. Do NOT prepend with speaker names. Each message maximum 2000 characters.",
				items: {
					type: "string" as const,
					maxLength: 2000,
				},
				minItems: 5,
				maxItems: 5,
			},
			sample_dialogues_out: {
				type: "array" as const,
				description:
					"Array of exactly 5 character responses paired with sample_dialogues_in. Should reflect the character's speaking style, personality, and demonstrate their full range across the 3 guided scenarios and 2 free scenarios. Do NOT prepend with speaker names. Each response maximum 2000 characters.",
				items: {
					type: "string" as const,
					maxLength: 2000,
				},
				minItems: 5,
				maxItems: 5,
			},
		},
		required: ["attribute_list", "sample_dialogues_in", "sample_dialogues_out"],
	};
}

function buildPresetPrompt(params: GeneratePresetParams): string {
	let prompt = `You are an expert character creator for a Discord chatbot. Create a detailed character profile based on the following information.

Character Name: ${params.characterName}

Character Description:
${params.characterDescription}

How the Character Speaks:
${params.speechExamples}

Instructions:
- Create a rich, detailed character profile in the structured JSON format
- The character should be interesting and engaging for conversation
- Do NOT prepend the sample dialogues with character names or "User:"/"Character:" prefixes - the chat application will handle that
- Use "{user}" as a placeholder when referring to other people or the conversation partner in dialogues
- Use "{bot}" as a placeholder when referring to the character themselves
- Ensure exactly 5 sample dialogue pairs (sample_dialogues_in paired with sample_dialogues_out)

The attribute_list MUST contain exactly 6 items in this exact order:

1. {bot}'s Description: A comprehensive 2-4 sentence description capturing the character's core identity, essence, and overall vibe. What makes them unique? What's their deal?

2. {bot}'s Appearance: Physical description including hair, eyes, clothing, accessories, and any distinctive features. Be specific and vivid.

3. {bot}'s Personality: A comma-separated list of personality traits that define how they think, act, and interact. Focus on specific, actionable traits.

4. {bot}'s Likes: Things, activities, topics, or concepts the character genuinely enjoys or gravitates toward. Can include brief explanations in parentheses.

5. {bot}'s Dislikes: Things, activities, topics, or concepts the character dislikes, avoids, or finds irritating. Can include brief explanations in parentheses or quotes.

6. {bot}'s Behavioral Quirks: Specific mannerisms, speech patterns, habits, or behaviors that make the character distinctive. How do they express themselves? What are their tells?

The sample_dialogues_in and sample_dialogues_out MUST follow this structure (exactly 5 dialogue pairs):

3 GUIDED SCENARIOS (Required, in this exact order):

1. Self-Introduction Request: User asks {bot} to introduce themselves.
2. Emotional/Personal Scenario: User shares feelings, asks for advice, or engages emotionally.
3. Practical/Functional Scenario: User asks for help, explanation, or practical advice.

2 FREE SCENARIOS (Your creative choice):

4. Free Dialogue #1: Choose a scenario that showcases a unique character trait, interest, or quirk.
5. Free Dialogue #2: Choose another scenario that demonstrates different aspects of the character.`;

	if (params.useWebSearch) {
		prompt += `\n\nWeb Search Instructions:
- Use the available web search tools to gather accurate, up-to-date details when helpful
- If you cannot find reliable information, treat the character as original and rely on the user's description and image
- Do not include citations, URLs, or sources in the JSON output`;
	}

	if (params.additionalInstructions?.trim()) {
		prompt += `\n\nAdditional Instructions: ${params.additionalInstructions.trim()}`;
	}

	prompt += `\n\nIMPORTANT:
- Respond with COMPLETE valid JSON only
- Follow the exact schema provided with strict length limits
- Exactly 6 items in attribute_list in the exact order specified above
- Exactly 5 dialogue pairs in the required order
- No speaker name prefixes in any dialogue
- Use "{user}" placeholder when character refers to other people in their responses
- Use "{bot}" placeholder when character refers to themselves in their responses`;

	return prompt;
}

function buildToolErrorResult(message: string): ToolResult {
	return {
		success: false,
		error: message,
		message,
	};
}

export async function generatePresetFromPromptCustom(
	apiKey: string,
	params: GeneratePresetParams,
	_optionsLocale: string,
	options: CustomPresetGenerationOptions,
): Promise<PresetGenerationResult> {
	const customAdapter = getCustomToolAdapter();
	const tools = options.tools ?? [];
	const toolContext = options.toolContext;
	const toolsEnabled = tools.length > 0 && toolContext;

	const responseFormat = {
		type: "json_schema" as const,
		json_schema: {
			name: "preset_export_data",
			description: "Structured persona preset data",
			schema: buildPresetResponseSchema(),
		},
	};

	const prompt = buildPresetPrompt(params);
	const contentParts: CustomContentPart[] = [{ type: "text", text: prompt }];

	if (params.imageBase64 && params.imageMimeType) {
		contentParts.push({
			type: "image_url",
			image_url: {
				url: `data:${params.imageMimeType};base64,${params.imageBase64}`,
			},
		});
		log.info("Custom preset generation: image included in prompt");
	}

	const userContent =
		contentParts.length === 1 && contentParts[0].type === "text"
			? contentParts[0].text
			: contentParts;

	const messages: CustomMessage[] = [
		{
			role: "user",
			content: userContent,
		},
	];

	const maxToolRounds = options.maxToolRounds ?? 3;
	let toolRounds = 0;

	while (true) {
		const body: Record<string, unknown> = {
			...(options.model !== "other-model" ? { model: options.model } : {}),
			messages,
			temperature: options.temperature ?? 1.0,
			max_tokens: 8192,
			response_format: responseFormat,
			stream: false,
		};

		if (toolsEnabled) {
			body.tools = tools;
			body.tool_choice = "auto";
		}

		const response = await callCustomChatCompletions({
			endpointUrl: options.endpointUrl,
			apiKey,
			body,
			logLabel: "Custom preset generation",
			messagesForLog: messages as Array<Record<string, unknown>>,
		});

		if (!response.success) {
			log.error(
				"Custom preset generation request failed",
				new Error(response.error.errorBody),
				{
					errorType: "CustomPresetGenerationHttpError",
					metadata: {
						model: options.model,
						status: response.error.status,
						errorBody: response.error.errorBody,
					},
				},
			);
			return {
				error:
					response.error.status === 0
						? response.error.errorBody
						: `Custom endpoint request failed (${response.error.status}): ${response.error.statusText}`,
				errorType: "CONNECTION",
			};
		}

		const message = response.data.choices?.[0]?.message as
			| {
					content?: unknown;
					tool_calls?: CustomToolCall[];
			  }
			| undefined;

		if (!message) {
			return {
				error: "Custom endpoint returned an empty response.",
				errorType: "EMPTY_RESPONSE",
			};
		}

		const toolCalls = message.tool_calls ?? [];
		if (toolCalls.length > 0) {
			if (!toolsEnabled || !toolContext) {
				return {
					error: "Custom endpoint requested tool calls but tools are not available.",
					errorType: "MODEL_ERROR",
				};
			}

			toolRounds += 1;
			if (toolRounds > maxToolRounds) {
				return {
					error: "Custom endpoint tool call loop exceeded limit.",
					errorType: "TIMEOUT",
				};
			}

			const normalizedToolCalls = toolCalls.map((toolCall, index) => ({
				...toolCall,
				id: toolCall.id ?? `tool_call_${toolRounds}_${index}`,
			}));

			messages.push({
				role: "assistant",
				content:
					typeof message.content === "string" ? message.content : null,
				tool_calls: normalizedToolCalls,
			});

			for (const toolCall of normalizedToolCalls) {
				const functionName = toolCall.function?.name;
				const rawArgs = toolCall.function?.arguments ?? "";

				let toolResult: ToolResult | undefined;
				let parsedArgs: Record<string, unknown> = {};

				if (!functionName) {
					toolResult = buildToolErrorResult(
						"Tool call missing function name",
					);
				} else {
					if (rawArgs) {
						try {
							parsedArgs = JSON.parse(rawArgs);
						} catch (parseError) {
							log.warn(
								`Custom tool call args parse failed for ${functionName}: ${rawArgs}`,
								parseError as Error,
							);
							toolResult = buildToolErrorResult(
								`Invalid tool arguments for ${functionName}`,
							);
						}
					}

					if (!toolResult) {
						log.info(
							`Executing custom preset-generation tool call: ${functionName} with args: ${JSON.stringify(parsedArgs)}`,
						);
						toolResult = await executeTool(
							functionName,
							parsedArgs,
							toolContext,
						);
					}
				}

				const convertedResult = customAdapter.convertResult(
					toolResult ?? buildToolErrorResult("Tool execution failed"),
				);
				const resultContent =
					typeof convertedResult.content === "string"
						? convertedResult.content
						: JSON.stringify(convertedResult.content);
				const toolCallId = toolCall.id ?? "tool_call_unknown";

				messages.push({
					role: "tool",
					tool_call_id: toolCallId,
					content: resultContent,
				});
			}

			continue;
		}

		const responseText = extractCustomResponseText(message.content);
		if (!responseText) {
			return {
				error: "Custom endpoint returned an empty response.",
				errorType: "EMPTY_RESPONSE",
			};
		}

		let parsedResponse: {
			attribute_list?: string[];
			sample_dialogues_in?: string[];
			sample_dialogues_out?: string[];
		};

		try {
			parsedResponse = parseCustomJsonResponse(responseText) as {
				attribute_list?: string[];
				sample_dialogues_in?: string[];
				sample_dialogues_out?: string[];
			};
		} catch (parseError) {
			log.error(
				"Custom preset generation JSON parse failed",
				parseError as Error,
			);
			return {
				error: "Invalid JSON response from custom endpoint.",
				errorType: "INVALID_JSON",
			};
		}

		if (
			!parsedResponse.attribute_list ||
			!parsedResponse.sample_dialogues_in ||
			!parsedResponse.sample_dialogues_out
		) {
			return {
				error: "Generated character data is incomplete. Please try again.",
				errorType: "INVALID_JSON",
			};
		}

		if (
			!Array.isArray(parsedResponse.attribute_list) ||
			parsedResponse.attribute_list.length !== 6
		) {
			return {
				error:
					"Generated attribute list must contain exactly 6 items. Please try again.",
				errorType: "VALIDATION_ERROR",
			};
		}

		if (
			!Array.isArray(parsedResponse.sample_dialogues_in) ||
			parsedResponse.sample_dialogues_in.length !== 5
		) {
			return {
				error: "Generated sample dialogues must contain exactly 5 user inputs.",
				errorType: "VALIDATION_ERROR",
			};
		}

		if (
			!Array.isArray(parsedResponse.sample_dialogues_out) ||
			parsedResponse.sample_dialogues_out.length !== 5
		) {
			return {
				error:
					"Generated sample dialogues must contain exactly 5 character responses.",
				errorType: "VALIDATION_ERROR",
			};
		}

		const sanitizedDialoguesIn = parsedResponse.sample_dialogues_in.map(
			sanitizeSampleDialogueText,
		);
		const sanitizedDialoguesOut = parsedResponse.sample_dialogues_out.map(
			sanitizeSampleDialogueText,
		);

		const preset = {
			tomori_nickname: params.characterName,
			trigger_words: [params.characterName],
			attribute_list: parsedResponse.attribute_list,
			sample_dialogues_in: sanitizedDialoguesIn,
			sample_dialogues_out: sanitizedDialoguesOut,
		};

		log.success(
			`Custom preset generation successful for ${params.characterName}`,
		);
		return { preset };
	}
}
