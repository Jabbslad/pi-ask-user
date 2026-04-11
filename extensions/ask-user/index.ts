/**
 * AskUserQuestion Extension
 *
 * Registers a tool that lets the model ask the user structured
 * multiple-choice questions. Supports single-select, multi-select,
 * freeform "Other" answers, preview panels, annotations (notes),
 * tab-based question navigation, submit review, and "Chat about this".
 *
 * General-purpose — works during normal coding, plan mode, or any context
 * where the model needs user input to proceed.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text, Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
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
	preview: Type.Optional(
		Type.String({
			description:
				"Optional preview content rendered when this option is focused. Use for ASCII mockups of UI layouts, " +
				"code snippets showing different implementations, diagram variations, or configuration examples. " +
				"Multi-line text with newlines is supported. Only supported for single-select questions (not multiSelect).",
		}),
	),
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
	preview?: string;
}

interface Question {
	question: string;
	header: string;
	options: QuestionOption[];
	multiSelect?: boolean;
}

interface Annotation {
	preview?: string;
	notes?: string;
}

interface AskUserQuestionDetails {
	questions: Question[];
	answers: Record<string, string>;
	annotations?: Record<string, Annotation>;
	cancelled: boolean;
	chatAbout?: boolean;
}

// ── Constants ────────────────────────────────────────────────────────

const OTHER_LABEL = "Other (type your own)";
const CHAT_LABEL = "Chat about this";

// Box-drawing characters
const BOX = {
	tl: "┌", tr: "┐", bl: "└", br: "┘",
	h: "─", v: "│",
	// For tab bar
	dot: "○", check: "●", active: "◉",
	// Misc
	arrow: "→", tick: "✓", pointer: "❯",
	divider: "─",
} as const;

// ── Validation ───────────────────────────────────────────────────────

function validateUniqueness(questions: Question[]): string | null {
	const questionTexts = questions.map((q) => q.question);
	if (questionTexts.length !== new Set(questionTexts).size) {
		return "Question texts must be unique.";
	}
	for (const q of questions) {
		const labels = q.options.map((o) => o.label);
		if (labels.length !== new Set(labels).size) {
			return `Option labels must be unique within question "${q.question}".`;
		}
	}
	return null;
}

// ── Rendering helpers ────────────────────────────────────────────────

/** Pad or truncate a string to exactly `w` visible columns */
function pad(s: string, w: number): string {
	return truncateToWidth(s, w, "", true);
}

/** Build a horizontal rule */
function hr(width: number, char = BOX.h): string {
	return char.repeat(width);
}

/** Render tab navigation bar for multi-question flows */
function renderTabBar(
	questions: Question[],
	currentIndex: number,
	answers: Record<string, string>,
	width: number,
	theme: any,
	showSubmit: boolean,
): string {
	const parts: string[] = [];

	// Left arrow
	parts.push(currentIndex > 0 ? theme.fg("text", "← ") : theme.fg("dim", "← "));

	for (let i = 0; i < questions.length; i++) {
		const q = questions[i];
		const isActive = i === currentIndex;
		const isAnswered = !!answers[q.question];
		const icon = isActive ? BOX.active : isAnswered ? BOX.check : BOX.dot;
		const label = truncateToWidth(q.header || `Q${i + 1}`, 10);

		if (isActive) {
			parts.push(theme.fg("accent", `${icon} ${label}`));
		} else if (isAnswered) {
			parts.push(theme.fg("success", `${icon} ${label}`));
		} else {
			parts.push(theme.fg("dim", `${icon} ${label}`));
		}
		parts.push("  ");
	}

	if (showSubmit) {
		const isSubmitActive = currentIndex === questions.length;
		const allAnswered = questions.every((q) => !!answers[q.question]);
		const submitIcon = isSubmitActive ? BOX.active : allAnswered ? BOX.check : BOX.dot;
		if (isSubmitActive) {
			parts.push(theme.fg("accent", `${submitIcon} Submit`));
		} else {
			parts.push(theme.fg("dim", `${submitIcon} Submit`));
		}
	}

	// Right arrow
	const maxIdx = showSubmit ? questions.length : questions.length - 1;
	parts.push(currentIndex < maxIdx ? theme.fg("text", " →") : theme.fg("dim", " →"));

	return truncateToWidth(" " + parts.join(""), width);
}

/** Render the preview side-by-side layout for a single-select question with previews */
function renderPreviewQuestion(
	q: Question,
	cursor: number,
	selectedValue: string | undefined,
	notes: string,
	isNotesActive: boolean,
	width: number,
	theme: any,
): string[] {
	const lines: string[] = [];
	const add = (s: string) => lines.push(truncateToWidth(s, width));

	// Title
	add(theme.fg("accent", hr(width)));
	add(theme.fg("text", ` ${q.question}`));
	add(theme.fg("accent", hr(width)));
	lines.push("");

	// Calculate panel widths
	const LEFT_W = Math.min(30, Math.floor(width * 0.35));
	const DIVIDER_W = 3; // " │ "
	const RIGHT_W = width - LEFT_W - DIVIDER_W;

	// Build left panel lines (options)
	const leftLines: string[] = [];
	for (let i = 0; i < q.options.length; i++) {
		const opt = q.options[i];
		const isCursor = i === cursor;
		const isSelected = selectedValue === opt.label;
		const prefix = isCursor ? `${BOX.pointer} ` : "  ";
		const num = `${i + 1}. `;
		let optLine: string;
		if (isCursor) {
			optLine = prefix + theme.fg("accent", num + opt.label);
		} else if (isSelected) {
			optLine = prefix + theme.fg("success", num + opt.label + ` ${BOX.tick}`);
		} else {
			optLine = prefix + theme.fg("text", num + opt.label);
		}
		leftLines.push(optLine);
	}

	// Build right panel lines (preview content)
	const previewOpt = q.options[cursor];
	const previewText = previewOpt?.preview || previewOpt?.description || "No preview available";
	const previewWrapped = wrapTextWithAnsi(previewText, RIGHT_W - 4); // 4 for box padding

	// Preview box
	const boxW = RIGHT_W - 2;
	const rightLines: string[] = [];
	rightLines.push(theme.fg("dim", ` ${BOX.tl}${hr(boxW, BOX.h)}${BOX.tr}`));
	for (const pl of previewWrapped) {
		const content = pad(` ${pl}`, boxW);
		rightLines.push(theme.fg("dim", ` ${BOX.v}`) + content + theme.fg("dim", BOX.v));
	}
	rightLines.push(theme.fg("dim", ` ${BOX.bl}${hr(boxW, BOX.h)}${BOX.br}`));

	// Notes line
	rightLines.push("");
	if (isNotesActive) {
		rightLines.push(theme.fg("accent", " Notes: ") + theme.fg("text", notes + "█"));
	} else if (notes) {
		rightLines.push(theme.fg("dim", " Notes: ") + theme.fg("muted", notes));
	} else {
		rightLines.push(theme.fg("dim", " Notes: press n to add notes"));
	}

	// Combine side-by-side
	const maxRows = Math.max(leftLines.length, rightLines.length);
	const divider = theme.fg("dim", ` ${BOX.v} `);

	for (let r = 0; r < maxRows; r++) {
		const left = pad(leftLines[r] ?? "", LEFT_W);
		const right = truncateToWidth(rightLines[r] ?? "", RIGHT_W);
		add(left + divider + right);
	}

	lines.push("");

	// Help text
	if (isNotesActive) {
		add(theme.fg("dim", ` Esc exit notes ${BOX.divider} Enter confirm`));
	} else {
		add(theme.fg("dim", ` Enter select ${BOX.divider} ↑/↓ nav ${BOX.divider} n notes ${BOX.divider} Esc cancel`));
	}
	add(theme.fg("accent", hr(width)));

	return lines;
}

/** Render the submit review view */
function renderSubmitReview(
	questions: Question[],
	answers: Record<string, string>,
	submitCursor: number,
	width: number,
	theme: any,
): string[] {
	const lines: string[] = [];
	const add = (s: string) => lines.push(truncateToWidth(s, width));

	add(theme.fg("accent", hr(width)));
	add(theme.fg("text", " Review your answers"));
	add(theme.fg("accent", hr(width)));
	lines.push("");

	const allAnswered = questions.every((q) => !!answers[q.question]);
	if (!allAnswered) {
		add(theme.fg("warning", ` ⚠ You have not answered all questions`));
		lines.push("");
	}

	for (const q of questions) {
		const answer = answers[q.question];
		if (answer) {
			add(theme.fg("muted", `   ${BOX.dot} ${q.question}`));
			add(theme.fg("success", `     ${BOX.arrow} ${answer}`));
		} else {
			add(theme.fg("dim", `   ${BOX.dot} ${q.question}`));
			add(theme.fg("dim", `     (no answer)`));
		}
		lines.push("");
	}

	add(theme.fg("text", " Ready to submit?"));
	lines.push("");

	const submitOptions = ["Submit answers", "Cancel"];
	for (let i = 0; i < submitOptions.length; i++) {
		const isCursor = i === submitCursor;
		const prefix = isCursor ? ` ${BOX.pointer} ` : "   ";
		if (isCursor) {
			add(prefix + theme.fg("accent", submitOptions[i]));
		} else {
			add(prefix + theme.fg("text", submitOptions[i]));
		}
	}

	lines.push("");
	add(theme.fg("dim", ` Enter select ${BOX.divider} ←/→ questions ${BOX.divider} Esc cancel`));
	add(theme.fg("accent", hr(width)));

	return lines;
}

// ── Extension ────────────────────────────────────────────────────────

export default function askUserExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "AskUserQuestion",
		label: "Ask User",
		description:
			"Ask the user multiple-choice questions to gather information, clarify ambiguity, " +
			"understand preferences, or offer implementation choices. Users can always select " +
			"'Other' to provide custom text input. Options can include a 'preview' field for " +
			"side-by-side comparison of code snippets, mockups, or diagrams.",
		promptSnippet: "Ask the user structured multiple-choice questions",
		promptGuidelines: [
			"Use AskUserQuestion when you need to clarify ambiguous requirements, gather user preferences, or offer implementation choices.",
			"Do NOT use AskUserQuestion for yes/no questions — just ask in text. Use it when there are 2-4 distinct options to choose from.",
			"If you recommend a specific option, make it the first option and add '(Recommended)' to the label.",
			"Use the optional 'preview' field on options when presenting concrete artifacts that users need to visually compare: " +
				"ASCII mockups of UI layouts, code snippets showing different implementations, diagram variations, or configuration examples. " +
				"Previews are only supported for single-select questions (not multiSelect).",
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

			// ── Validate uniqueness ──
			const validationError = validateUniqueness(params.questions as Question[]);
			if (validationError) {
				return {
					content: [{ type: "text", text: `Validation error: ${validationError}` }],
					details: {
						questions: params.questions,
						answers: {},
						cancelled: true,
					} as AskUserQuestionDetails,
				};
			}

			const questions = params.questions as Question[];
			const isSingleQuestion = questions.length === 1;
			const answers: Record<string, string> = {};
			const annotations: Record<string, Annotation> = {};

			// ── Multi-question flow with tab navigation ──
			if (!isSingleQuestion) {
				const result = await ctx.ui.custom<{ answers: Record<string, string>; annotations: Record<string, Annotation>; chatAbout?: boolean } | null>(
					(tui, theme, _kb, done) => {
						let currentTab = 0;
						const showSubmit = true;
						const maxTab = questions.length; // last tab = submit
						const questionAnswers: Record<string, string> = {};
						const questionAnnotations: Record<string, Annotation> = {};
						const questionCursors: number[] = questions.map(() => 0);
						const questionNotes: string[] = questions.map(() => "");
						let submitCursor = 0;
						let cachedLines: string[] | undefined;

						function refresh() {
							cachedLines = undefined;
							tui.requestRender();
						}

						function handleInput(data: string) {
							const isSubmitView = currentTab === questions.length;

							// Tab navigation: left/right arrows
							if (matchesKey(data, Key.left)) {
								if (currentTab > 0) { currentTab--; refresh(); }
								return;
							}
							if (matchesKey(data, Key.right)) {
								if (currentTab < maxTab) { currentTab++; refresh(); }
								return;
							}

							if (isSubmitView) {
								if (matchesKey(data, Key.up)) {
									submitCursor = Math.max(0, submitCursor - 1); refresh();
								} else if (matchesKey(data, Key.down)) {
									submitCursor = Math.min(1, submitCursor + 1); refresh();
								} else if (matchesKey(data, Key.enter)) {
									if (submitCursor === 0) {
										// Submit
										done({ answers: questionAnswers, annotations: questionAnnotations });
									} else {
										// Cancel
										done(null);
									}
								} else if (matchesKey(data, Key.escape)) {
									done(null);
								}
								return;
							}

							const q = questions[currentTab];
							const isMulti = q.multiSelect === true;

							if (isMulti) {
								handleMultiSelectInput(data, q, currentTab, questionAnswers, questionCursors, refresh, () => {
									// Advance to next tab
									if (currentTab < maxTab) { currentTab++; refresh(); }
								}, () => done(null));
							} else {
								handleSingleSelectInput(data, q, currentTab, questionAnswers, questionAnnotations, questionCursors, questionNotes, refresh, () => {
									// Advance to next tab
									if (currentTab < maxTab) { currentTab++; refresh(); }
								}, () => done(null), () => done({ answers: questionAnswers, annotations: questionAnnotations, chatAbout: true }));
							}
						}

						// ── Multi-select input handling for tabbed flow ──
						const multiSelections: Map<number, Set<number>> = new Map();

						function handleMultiSelectInput(
							data: string,
							q: Question,
							tabIdx: number,
							qAnswers: Record<string, string>,
							qCursors: number[],
							onRefresh: () => void,
							onAdvance: () => void,
							onCancel: () => void,
						) {
							const allOptions = [...q.options, { label: OTHER_LABEL, description: "Type a custom answer" }];
							if (!multiSelections.has(tabIdx)) multiSelections.set(tabIdx, new Set());
							const selected = multiSelections.get(tabIdx)!;

							if (matchesKey(data, Key.up)) {
								qCursors[tabIdx] = Math.max(0, qCursors[tabIdx] - 1); onRefresh();
							} else if (matchesKey(data, Key.down)) {
								qCursors[tabIdx] = Math.min(allOptions.length, qCursors[tabIdx] + 1); onRefresh();
							} else if (matchesKey(data, " ")) {
								const c = qCursors[tabIdx];
								if (c < allOptions.length) {
									if (selected.has(c)) selected.delete(c); else selected.add(c);
									onRefresh();
								}
							} else if (matchesKey(data, Key.enter)) {
								const results: string[] = [];
								for (const idx of Array.from(selected).sort()) {
									if (idx < q.options.length) results.push(q.options[idx].label);
								}
								qAnswers[q.question] = results.join(", ");
								onAdvance();
							} else if (matchesKey(data, Key.escape)) {
								onCancel();
							}
						}

						// ── Single-select input handling for tabbed flow ──
						function handleSingleSelectInput(
							data: string,
							q: Question,
							tabIdx: number,
							qAnswers: Record<string, string>,
							qAnnotations: Record<string, Annotation>,
							qCursors: number[],
							qNotes: string[],
							onRefresh: () => void,
							onAdvance: () => void,
							onCancel: () => void,
							onChatAbout: () => void,
						) {
							const hasPreview = q.options.some((o) => o.preview);
							const totalItems = q.options.length + 1; // +1 for "Chat about this"
							const chatIdx = q.options.length;

							if (matchesKey(data, Key.up)) {
								qCursors[tabIdx] = Math.max(0, qCursors[tabIdx] - 1); onRefresh();
							} else if (matchesKey(data, Key.down)) {
								qCursors[tabIdx] = Math.min(totalItems - 1, qCursors[tabIdx] + 1); onRefresh();
							} else if (matchesKey(data, "n") && hasPreview) {
								// Notes not implemented in tabbed non-preview mode — only preview
								// For preview: handled in the preview-specific flow
								// (notes editing would require a sub-mode; keeping simple for now)
							} else if (matchesKey(data, Key.enter)) {
								const c = qCursors[tabIdx];
								if (c === chatIdx) {
									onChatAbout();
								} else if (c < q.options.length) {
									const selected = q.options[c];
									qAnswers[q.question] = selected.label;
									if (qNotes[tabIdx] || selected.preview) {
										qAnnotations[q.question] = {
											...(selected.preview && { preview: selected.preview }),
											...(qNotes[tabIdx] && { notes: qNotes[tabIdx] }),
										};
									}
									onAdvance();
								}
							} else if (matchesKey(data, Key.escape)) {
								onCancel();
							}
						}

						function render(width: number): string[] {
							if (cachedLines) return cachedLines;
							const lines: string[] = [];
							const add = (s: string) => lines.push(truncateToWidth(s, width));

							// Tab bar
							add(renderTabBar(questions, currentTab, questionAnswers, width, theme, showSubmit));
							lines.push("");

							if (currentTab === questions.length) {
								// Submit review view
								lines.push(...renderSubmitReview(questions, questionAnswers, submitCursor, width, theme));
							} else {
								const q = questions[currentTab];
								const isMulti = q.multiSelect === true;
								const hasPreview = !isMulti && q.options.some((o) => o.preview);

								if (hasPreview) {
									lines.push(...renderPreviewQuestion(
										q, questionCursors[currentTab],
										questionAnswers[q.question],
										questionNotes[currentTab],
										false, width, theme,
									));
								} else if (isMulti) {
									// Multi-select rendering
									const allOptions = [...q.options, { label: OTHER_LABEL, description: "Type a custom answer" }];
									if (!multiSelections.has(currentTab)) multiSelections.set(currentTab, new Set());
									const selected = multiSelections.get(currentTab)!;

									add(theme.fg("accent", hr(width)));
									add(theme.fg("text", ` ${q.question}`));
									add(theme.fg("dim", ` (Space to toggle, Enter to submit)`));
									lines.push("");

									for (let i = 0; i < allOptions.length; i++) {
										const opt = allOptions[i];
										const isCursor = i === questionCursors[currentTab];
										const isSelected = selected.has(i);
										const checkbox = isSelected ? "[✓]" : "[ ]";
										const prefix = isCursor ? `${BOX.pointer} ` : "  ";
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
									add(theme.fg("dim", ` Space toggle ${BOX.divider} Enter submit ${BOX.divider} ←/→ questions ${BOX.divider} Esc cancel`));
									add(theme.fg("accent", hr(width)));
								} else {
									// Standard single-select rendering with "Chat about this"
									add(theme.fg("accent", hr(width)));
									add(theme.fg("text", ` ${q.question}`));
									lines.push("");

									for (let i = 0; i < q.options.length; i++) {
										const opt = q.options[i];
										const isCursor = i === questionCursors[currentTab];
										const prefix = isCursor ? ` ${BOX.pointer} ` : "   ";
										if (isCursor) {
											add(prefix + theme.fg("accent", `${i + 1}. ${opt.label}`));
										} else {
											add(prefix + theme.fg("text", `${i + 1}. ${opt.label}`));
										}
										add(`      ${theme.fg("muted", opt.description)}`);
									}

									// Divider before "Chat about this"
									lines.push("");
									add(theme.fg("dim", ` ${BOX.divider.repeat(Math.min(40, width - 2))}`));
									const chatCursor = questionCursors[currentTab] === q.options.length;
									const chatPrefix = chatCursor ? ` ${BOX.pointer} ` : "   ";
									if (chatCursor) {
										add(chatPrefix + theme.fg("accent", CHAT_LABEL));
									} else {
										add(chatPrefix + theme.fg("dim", CHAT_LABEL));
									}

									lines.push("");
									add(theme.fg("dim", ` Enter select ${BOX.divider} ↑/↓ nav ${BOX.divider} ←/→ questions ${BOX.divider} Esc cancel`));
									add(theme.fg("accent", hr(width)));
								}
							}

							cachedLines = lines;
							return lines;
						}

						return { render, invalidate: () => { cachedLines = undefined; }, handleInput };
					},
				);

				if (result === null) {
					return {
						content: [{ type: "text", text: "User cancelled the questions." }],
						details: { questions, answers: {}, cancelled: true } as AskUserQuestionDetails,
					};
				}

				if (result.chatAbout) {
					const questionsText = questions.map((q) => {
						const answer = result.answers[q.question];
						return answer
							? `- "${q.question}"\n  Answer: ${answer}`
							: `- "${q.question}"\n  (No answer provided)`;
					}).join("\n");

					return {
						content: [{
							type: "text",
							text: `The user wants to discuss these questions rather than pick options.\n` +
								`Ask them what they'd like to clarify.\n\nQuestions:\n${questionsText}`,
						}],
						details: { questions, answers: result.answers, cancelled: false, chatAbout: true } as AskUserQuestionDetails,
					};
				}

				// Collect annotations
				const finalAnnotations: Record<string, Annotation> = {};
				for (const [k, v] of Object.entries(result.annotations)) {
					if (v.preview || v.notes) finalAnnotations[k] = v;
				}

				const answersText = Object.entries(result.answers)
					.map(([question, answer]) => {
						const ann = finalAnnotations[question];
						const parts = [`"${question}" ${BOX.arrow} "${answer}"`];
						if (ann?.notes) parts.push(`user notes: ${ann.notes}`);
						return parts.join(" ");
					})
					.join("\n");

				return {
					content: [{
						type: "text",
						text: `User has answered your questions:\n${answersText}\n\nYou can now continue with the user's answers in mind.`,
					}],
					details: {
						questions,
						answers: result.answers,
						...(Object.keys(finalAnnotations).length > 0 && { annotations: finalAnnotations }),
						cancelled: false,
					} as AskUserQuestionDetails,
				};
			}

			// ── Single question flow ──
			const q = questions[0];
			const isMulti = q.multiSelect === true;
			const hasPreview = !isMulti && q.options.some((o) => o.preview);

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
							cursor = Math.max(0, cursor - 1); refresh();
						} else if (matchesKey(data, Key.down)) {
							cursor = Math.min(allOptions.length - 1, cursor + 1); refresh();
						} else if (matchesKey(data, " ")) {
							if (selected.has(cursor)) selected.delete(cursor); else selected.add(cursor);
							refresh();
						} else if (matchesKey(data, Key.enter)) {
							const results: string[] = [];
							for (const idx of Array.from(selected).sort()) {
								if (idx < q.options.length) results.push(q.options[idx].label);
							}
							if (selected.has(allOptions.length - 1)) results.push("__OTHER__");
							done(results.length > 0 ? results : null);
						} else if (matchesKey(data, Key.escape)) {
							done(null);
						}
					}

					function render(width: number): string[] {
						if (cachedLines) return cachedLines;
						const lines: string[] = [];
						const add = (s: string) => lines.push(truncateToWidth(s, width));

						add(theme.fg("accent", hr(width)));
						add(theme.fg("text", ` ${q.question}`));
						add(theme.fg("dim", ` (Space to toggle, Enter to submit)`));
						lines.push("");

						for (let i = 0; i < allOptions.length; i++) {
							const opt = allOptions[i];
							const isCursor = i === cursor;
							const isSelected = selected.has(i);
							const checkbox = isSelected ? "[✓]" : "[ ]";
							const prefix = isCursor ? `${BOX.pointer} ` : "  ";

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
						add(theme.fg("dim", ` Space toggle ${BOX.divider} Enter submit ${BOX.divider} Esc cancel`));
						add(theme.fg("accent", hr(width)));
						cachedLines = lines;
						return lines;
					}

					return { render, invalidate: () => { cachedLines = undefined; }, handleInput };
				});

				if (result === null) {
					return {
						content: [{ type: "text", text: "User cancelled the questions." }],
						details: { questions, answers, cancelled: true } as AskUserQuestionDetails,
					};
				}

				const hasOther = result.includes("__OTHER__");
				const normalSelections = result.filter((r) => r !== "__OTHER__");

				if (hasOther) {
					const custom = await ctx.ui.input(`${q.header} — custom answer:`, "Type your answer...");
					if (custom) normalSelections.push(custom);
				}

				answers[q.question] = normalSelections.join(", ");

			} else if (hasPreview) {
				// ── Single-select with preview: side-by-side custom UI ──
				const result = await ctx.ui.custom<{ answer: string; notes: string; annotation?: Annotation; chatAbout?: boolean } | null>(
					(tui, theme, _kb, done) => {
						let cursor = 0;
						let notes = "";
						let isNotesActive = false;
						const totalItems = q.options.length + 1; // +1 for "Chat about this"
						const chatIdx = q.options.length;
						let selectedValue: string | undefined;
						let cachedLines: string[] | undefined;

						function refresh() {
							cachedLines = undefined;
							tui.requestRender();
						}

						function handleInput(data: string) {
							if (isNotesActive) {
								if (matchesKey(data, Key.escape) || matchesKey(data, Key.enter)) {
									isNotesActive = false; refresh();
								} else if (matchesKey(data, Key.backspace)) {
									notes = notes.slice(0, -1); refresh();
								} else if (data.length === 1 && data >= " ") {
									notes += data; refresh();
								}
								return;
							}

							if (matchesKey(data, Key.up)) {
								cursor = Math.max(0, cursor - 1); refresh();
							} else if (matchesKey(data, Key.down)) {
								cursor = Math.min(totalItems - 1, cursor + 1); refresh();
							} else if (matchesKey(data, "n")) {
								isNotesActive = true; refresh();
							} else if (matchesKey(data, Key.enter)) {
								if (cursor === chatIdx) {
									done({ answer: "", notes, chatAbout: true });
								} else if (cursor < q.options.length) {
									const opt = q.options[cursor];
									selectedValue = opt.label;
									const annotation: Annotation = {};
									if (opt.preview) annotation.preview = opt.preview;
									if (notes) annotation.notes = notes;
									done({ answer: opt.label, notes, annotation: Object.keys(annotation).length > 0 ? annotation : undefined });
								}
							} else if (matchesKey(data, Key.escape)) {
								done(null);
							} else if (data >= "1" && data <= "9") {
								const idx = parseInt(data, 10) - 1;
								if (idx < q.options.length) {
									cursor = idx; refresh();
								}
							}
						}

						function render(width: number): string[] {
							if (cachedLines) return cachedLines;
							const lines: string[] = [];

							// Preview question renders the main area
							lines.push(...renderPreviewQuestion(
								q, cursor, selectedValue, notes, isNotesActive, width, theme,
							));

							// Remove the last help line and hr to append chat option
							// Actually, let's insert "Chat about this" before the help text
							// We'll rebuild: pop last 3 lines (blank + help + hr), add chat, re-add
							const hrLine = lines.pop()!;
							const helpLine = lines.pop()!;
							const blankLine = lines.pop()!;

							if (!isNotesActive) {
								lines.push("");
								lines.push(truncateToWidth(theme.fg("dim", ` ${BOX.divider.repeat(Math.min(40, width - 2))}`), width));
								const isChatCursor = cursor === chatIdx;
								const chatPrefix = isChatCursor ? ` ${BOX.pointer} ` : "   ";
								if (isChatCursor) {
									lines.push(truncateToWidth(chatPrefix + theme.fg("accent", CHAT_LABEL), width));
								} else {
									lines.push(truncateToWidth(chatPrefix + theme.fg("dim", CHAT_LABEL), width));
								}
							}

							lines.push(blankLine);
							lines.push(helpLine);
							lines.push(hrLine);

							cachedLines = lines;
							return lines;
						}

						return { render, invalidate: () => { cachedLines = undefined; }, handleInput };
					},
				);

				if (result === null) {
					return {
						content: [{ type: "text", text: "User cancelled the questions." }],
						details: { questions, answers, cancelled: true } as AskUserQuestionDetails,
					};
				}

				if (result.chatAbout) {
					return {
						content: [{
							type: "text",
							text: `The user wants to discuss this question rather than pick an option.\n` +
								`Ask them what they'd like to clarify.\n\nQuestion: "${q.question}"`,
						}],
						details: { questions, answers: {}, cancelled: false, chatAbout: true } as AskUserQuestionDetails,
					};
				}

				answers[q.question] = result.answer;
				if (result.annotation) {
					annotations[q.question] = result.annotation;
				}

			} else {
				// ── Single-select with auto-submit: custom UI with "Chat about this" ──
				const result = await ctx.ui.custom<{ answer: string; chatAbout?: boolean } | null>(
					(tui, theme, _kb, done) => {
						let cursor = 0;
						const totalItems = q.options.length + 2; // +1 Other, +1 Chat
						const otherIdx = q.options.length;
						const chatIdx = q.options.length + 1;
						let cachedLines: string[] | undefined;

						function refresh() {
							cachedLines = undefined;
							tui.requestRender();
						}

						function handleInput(data: string) {
							if (matchesKey(data, Key.up)) {
								cursor = Math.max(0, cursor - 1); refresh();
							} else if (matchesKey(data, Key.down)) {
								cursor = Math.min(totalItems - 1, cursor + 1); refresh();
							} else if (matchesKey(data, Key.enter)) {
								if (cursor === chatIdx) {
									done({ answer: "", chatAbout: true });
								} else if (cursor === otherIdx) {
									done({ answer: "__OTHER__" });
								} else if (cursor < q.options.length) {
									done({ answer: q.options[cursor].label });
								}
							} else if (matchesKey(data, Key.escape)) {
								done(null);
							} else if (data >= "1" && data <= "9") {
								const idx = parseInt(data, 10) - 1;
								if (idx < q.options.length) {
									cursor = idx; refresh();
								}
							}
						}

						function render(width: number): string[] {
							if (cachedLines) return cachedLines;
							const lines: string[] = [];
							const add = (s: string) => lines.push(truncateToWidth(s, width));

							add(theme.fg("accent", hr(width)));
							add(theme.fg("text", ` ${q.question}`));
							lines.push("");

							for (let i = 0; i < q.options.length; i++) {
								const opt = q.options[i];
								const isCursor = i === cursor;
								const prefix = isCursor ? ` ${BOX.pointer} ` : "   ";
								if (isCursor) {
									add(prefix + theme.fg("accent", `${i + 1}. ${opt.label}`));
								} else {
									add(prefix + theme.fg("text", `${i + 1}. ${opt.label}`));
								}
								add(`      ${theme.fg("muted", opt.description)}`);
							}

							// Other option
							const isOtherCursor = cursor === otherIdx;
							const otherPrefix = isOtherCursor ? ` ${BOX.pointer} ` : "   ";
							if (isOtherCursor) {
								add(otherPrefix + theme.fg("accent", `${q.options.length + 1}. ${OTHER_LABEL}`));
							} else {
								add(otherPrefix + theme.fg("text", `${q.options.length + 1}. ${OTHER_LABEL}`));
							}
							add(`      ${theme.fg("muted", "Type a custom answer")}`);

							// Divider + Chat about this
							lines.push("");
							add(theme.fg("dim", ` ${BOX.divider.repeat(Math.min(40, width - 2))}`));
							const isChatCursor = cursor === chatIdx;
							const chatPrefix = isChatCursor ? ` ${BOX.pointer} ` : "   ";
							if (isChatCursor) {
								add(chatPrefix + theme.fg("accent", CHAT_LABEL));
							} else {
								add(chatPrefix + theme.fg("dim", CHAT_LABEL));
							}

							lines.push("");
							add(theme.fg("dim", ` Enter select ${BOX.divider} ↑/↓ nav ${BOX.divider} Esc cancel`));
							add(theme.fg("accent", hr(width)));
							cachedLines = lines;
							return lines;
						}

						return { render, invalidate: () => { cachedLines = undefined; }, handleInput };
					},
				);

				if (result === null) {
					return {
						content: [{ type: "text", text: "User cancelled the questions." }],
						details: { questions, answers, cancelled: true } as AskUserQuestionDetails,
					};
				}

				if (result.chatAbout) {
					return {
						content: [{
							type: "text",
							text: `The user wants to discuss this question rather than pick an option.\n` +
								`Ask them what they'd like to clarify.\n\nQuestion: "${q.question}"`,
						}],
						details: { questions, answers: {}, cancelled: false, chatAbout: true } as AskUserQuestionDetails,
					};
				}

				if (result.answer === "__OTHER__") {
					const custom = await ctx.ui.input(`${q.header} — custom answer:`, "Type your answer...");
					answers[q.question] = custom ?? "No answer provided";
				} else {
					answers[q.question] = result.answer;
				}
			}

			// Format answers for the model
			const answersText = Object.entries(answers)
				.map(([question, answer]) => {
					const ann = annotations[question];
					const parts = [`"${question}" ${BOX.arrow} "${answer}"`];
					if (ann?.preview) parts.push(`selected preview:\n${ann.preview}`);
					if (ann?.notes) parts.push(`user notes: ${ann.notes}`);
					return parts.join(" ");
				})
				.join("\n");

			return {
				content: [{
					type: "text",
					text: `User has answered your questions:\n${answersText}\n\nYou can now continue with the user's answers in mind.`,
				}],
				details: {
					questions,
					answers,
					...(Object.keys(annotations).length > 0 && { annotations }),
					cancelled: false,
				} as AskUserQuestionDetails,
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
					const opts = [...qObj.options.map((o: QuestionOption) => o.label), OTHER_LABEL];
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

			if (details.chatAbout) {
				return new Text(theme.fg("accent", "↩ User wants to discuss this"), 0, 0);
			}

			let text = "";
			for (const [question, answer] of Object.entries(details.answers)) {
				if (text) text += "\n";
				text += theme.fg("success", `${BOX.tick} `) + theme.fg("muted", question) + ` ${BOX.arrow} ` + theme.fg("accent", answer);
				const ann = details.annotations?.[question];
				if (ann?.notes) {
					text += "\n   " + theme.fg("dim", `notes: ${ann.notes}`);
				}
			}
			return new Text(text || theme.fg("dim", "No answers"), 0, 0);
		},
	});
}
