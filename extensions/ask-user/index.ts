/**
 * AskUserQuestion Extension
 *
 * Registers a tool that lets the model ask the user structured
 * multiple-choice questions. Supports single-select, multi-select,
 * and freeform "Other" answers.
 *
 * General-purpose — works during normal coding, plan mode, or any context
 * where the model needs user input to proceed.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text, Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

// ── Schema ───────────────────────────────────────────────────────────

const MAX_HEADER_CHARS = 12;

const QuestionOptionSchema = Type.Object({
	label: Type.String({
		description:
			"The display text for this option. Should be concise (1-5 words) and clearly describe the choice.",
	}),
	description: Type.String({
		description:
			"Explanation of what this option means or what will happen if chosen. Useful for providing context about trade-offs or implications.",
	}),
});

const QuestionSchema = Type.Object({
	question: Type.String({
		description:
			'The complete question to ask the user. Should be clear, specific, and end with a question mark. Example: "Which library should we use for date formatting?"',
	}),
	header: Type.String({
		description: `Very short label displayed as a chip/tag (max ${MAX_HEADER_CHARS} chars). Examples: "Auth method", "Library", "Approach".`,
	}),
	options: Type.Array(QuestionOptionSchema, {
		minItems: 2,
		maxItems: 4,
		description:
			"The available choices for this question. Must have 2-4 options. Each option should be a distinct choice. An 'Other' option is provided automatically.",
	}),
	multiSelect: Type.Optional(
		Type.Boolean({
			description:
				"Set to true to allow the user to select multiple options instead of just one. Use when choices are not mutually exclusive.",
			default: false,
		}),
	),
});

const AskUserQuestionParams = Type.Object({
	questions: Type.Array(QuestionSchema, {
		minItems: 1,
		maxItems: 4,
		description: "Questions to ask the user (1-4 questions)",
	}),
});

// ── Types ────────────────────────────────────────────────────────────

interface QuestionOption {
	label: string;
	description: string;
}

interface Question {
	question: string;
	header: string;
	options: QuestionOption[];
	multiSelect?: boolean;
}

interface AskUserQuestionDetails {
	questions: Question[];
	answers: Record<string, string>;
	cancelled: boolean;
}

// ── Other option constant ────────────────────────────────────────────

const OTHER_LABEL = "Other (type your own)";

// ── Extension ────────────────────────────────────────────────────────

export default function askUserExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "AskUserQuestion",
		label: "Ask User",
		description:
			"Ask the user multiple-choice questions to gather information, clarify ambiguity, " +
			"understand preferences, or offer implementation choices. Users can always select " +
			"'Other' to provide custom text input.",
		promptSnippet: "Ask the user structured multiple-choice questions",
		promptGuidelines: [
			"Use AskUserQuestion when you need to clarify ambiguous requirements, gather user preferences, or offer implementation choices.",
			"Do NOT use AskUserQuestion for yes/no questions — just ask in text. Use it when there are 2-4 distinct options to choose from.",
			"If you recommend a specific option, make it the first option and add '(Recommended)' to the label.",
		],
		parameters: AskUserQuestionParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!ctx.hasUI) {
				return {
					content: [{ type: "text", text: "Error: UI not available (running in non-interactive mode)" }],
					details: {
						questions: params.questions,
						answers: {},
						cancelled: true,
					} as AskUserQuestionDetails,
				};
			}

			const answers: Record<string, string> = {};

			for (const q of params.questions) {
				const isMulti = q.multiSelect === true;
				const optionLabels = q.options.map((o) => o.label);

				if (isMulti) {
					// ── Multi-select: custom checkbox UI ──
					const result = await ctx.ui.custom<string[] | null>((tui, theme, _kb, done) => {
						const selected = new Set<number>();
						let cursor = 0;
						const allOptions = [...q.options, { label: OTHER_LABEL, description: "Type a custom answer" }];
						let cachedLines: string[] | undefined;

						function refresh() {
							cachedLines = undefined;
							tui.requestRender();
						}

						function handleInput(data: string) {
							if (matchesKey(data, Key.up)) {
								cursor = Math.max(0, cursor - 1);
								refresh();
							} else if (matchesKey(data, Key.down)) {
								cursor = Math.min(allOptions.length - 1, cursor + 1);
								refresh();
							} else if (matchesKey(data, " ")) {
								// Toggle selection
								if (selected.has(cursor)) {
									selected.delete(cursor);
								} else {
									selected.add(cursor);
								}
								refresh();
							} else if (matchesKey(data, Key.enter)) {
								// Submit selections
								const results: string[] = [];
								for (const idx of Array.from(selected).sort()) {
									if (idx < q.options.length) {
										results.push(q.options[idx].label);
									}
								}
								// Check if "Other" was selected
								if (selected.has(allOptions.length - 1)) {
									results.push("__OTHER__");
								}
								done(results.length > 0 ? results : null);
							} else if (matchesKey(data, Key.escape)) {
								done(null);
							}
						}

						function render(width: number): string[] {
							if (cachedLines) return cachedLines;
							const lines: string[] = [];
							const add = (s: string) => lines.push(truncateToWidth(s, width));

							add(theme.fg("accent", "─".repeat(width)));
							add(theme.fg("text", ` ${q.question}`));
							add(theme.fg("dim", ` (Space to toggle, Enter to submit)`));
							lines.push("");

							for (let i = 0; i < allOptions.length; i++) {
								const opt = allOptions[i];
								const isCursor = i === cursor;
								const isSelected = selected.has(i);
								const checkbox = isSelected ? "[✓]" : "[ ]";
								const prefix = isCursor ? "> " : "  ";

								if (isCursor) {
									add(prefix + theme.fg("accent", `${checkbox} ${opt.label}`));
								} else {
									add(`  ${isSelected ? theme.fg("success", checkbox) : theme.fg("dim", checkbox)} ${theme.fg("text", opt.label)}`);
								}
								if (opt.description) {
									add(`       ${theme.fg("muted", opt.description)}`);
								}
							}

							lines.push("");
							add(theme.fg("dim", " Space toggle • Enter submit • Esc cancel"));
							add(theme.fg("accent", "─".repeat(width)));
							cachedLines = lines;
							return lines;
						}

						return { render, invalidate: () => { cachedLines = undefined; }, handleInput };
					});

					if (result === null) {
						// Cancelled
						return {
							content: [{ type: "text", text: "User cancelled the questions." }],
							details: { questions: params.questions, answers, cancelled: true } as AskUserQuestionDetails,
						};
					}

					// Check if "Other" was in the selections
					const hasOther = result.includes("__OTHER__");
					const normalSelections = result.filter((r) => r !== "__OTHER__");

					if (hasOther) {
						const custom = await ctx.ui.input(`${q.header} — custom answer:`, "Type your answer...");
						if (custom) normalSelections.push(custom);
					}

					answers[q.question] = normalSelections.join(", ");
				} else {
					// ── Single-select: use ctx.ui.select with descriptions ──
					const selectOptions = [...optionLabels, OTHER_LABEL];
					const choice = await ctx.ui.select(`${q.question}`, selectOptions);

					if (choice === undefined) {
						// Cancelled
						return {
							content: [{ type: "text", text: "User cancelled the questions." }],
							details: { questions: params.questions, answers, cancelled: true } as AskUserQuestionDetails,
						};
					}

					if (choice === OTHER_LABEL) {
						const custom = await ctx.ui.input(`${q.header} — custom answer:`, "Type your answer...");
						answers[q.question] = custom ?? "No answer provided";
					} else {
						answers[q.question] = choice;
					}
				}
			}

			// Format answers for the model
			const answersText = Object.entries(answers)
				.map(([question, answer]) => `"${question}" → "${answer}"`)
				.join("\n");

			return {
				content: [
					{
						type: "text",
						text: `User has answered your questions:\n${answersText}\n\nYou can now continue with the user's answers in mind.`,
					},
				],
				details: { questions: params.questions, answers, cancelled: false } as AskUserQuestionDetails,
			};
		},

		// ── Custom rendering ─────────────────────────────────────────

		renderCall(args, theme, _context) {
			const questions = Array.isArray(args.questions) ? args.questions : [];
			if (questions.length === 0) {
				return new Text(theme.fg("toolTitle", theme.bold("AskUserQuestion")), 0, 0);
			}

			let text = theme.fg("toolTitle", theme.bold("AskUserQuestion"));
			for (const q of questions) {
				const qObj = q as Question;
				text += "\n  " + theme.fg("accent", `[${(qObj.header ?? "").slice(0, MAX_HEADER_CHARS)}]`);
				text += " " + theme.fg("text", qObj.question ?? "");
				if (Array.isArray(qObj.options)) {
					const opts = [...qObj.options.map((o) => o.label), OTHER_LABEL];
					text += "\n    " + theme.fg("dim", opts.map((o, i) => `${i + 1}. ${o}`).join("  "));
				}
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme, _context) {
			const details = result.details as AskUserQuestionDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			if (details.cancelled) {
				return new Text(theme.fg("warning", "Cancelled"), 0, 0);
			}

			let text = "";
			for (const [question, answer] of Object.entries(details.answers)) {
				if (text) text += "\n";
				text += theme.fg("success", "✓ ") + theme.fg("muted", question) + " → " + theme.fg("accent", answer);
			}
			return new Text(text || theme.fg("dim", "No answers"), 0, 0);
		},
	});
}
