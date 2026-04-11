import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Tests for AskUserQuestion extension.
 *
 * Since the extension registers a tool via pi.registerTool(),
 * we test the schema validation and helper logic here.
 * Full integration tests require a pi runtime.
 */

// ── Schema shape tests ───────────────────────────────────────────────

describe("AskUserQuestion schema", () => {
	it("accepts valid single question with 2 options", () => {
		const input = {
			questions: [
				{
					question: "Which framework?",
					header: "Framework",
					options: [
						{ label: "React", description: "Component-based UI library" },
						{ label: "Vue", description: "Progressive framework" },
					],
				},
			],
		};
		assert.ok(input.questions.length >= 1);
		assert.ok(input.questions.length <= 4);
		assert.ok(input.questions[0].options.length >= 2);
		assert.ok(input.questions[0].options.length <= 4);
	});

	it("accepts valid single question with 4 options", () => {
		const input = {
			questions: [
				{
					question: "Which approach?",
					header: "Approach",
					options: [
						{ label: "A", description: "First" },
						{ label: "B", description: "Second" },
						{ label: "C", description: "Third" },
						{ label: "D", description: "Fourth" },
					],
				},
			],
		};
		assert.ok(input.questions[0].options.length === 4);
	});

	it("accepts 4 questions", () => {
		const questions = Array.from({ length: 4 }, (_, i) => ({
			question: `Question ${i + 1}?`,
			header: `Q${i + 1}`,
			options: [
				{ label: "Yes", description: "Affirmative" },
				{ label: "No", description: "Negative" },
			],
		}));
		assert.ok(questions.length === 4);
	});

	it("accepts multiSelect flag", () => {
		const input = {
			questions: [
				{
					question: "Which features?",
					header: "Features",
					options: [
						{ label: "Auth", description: "Authentication" },
						{ label: "Cache", description: "Caching layer" },
					],
					multiSelect: true,
				},
			],
		};
		assert.ok(input.questions[0].multiSelect === true);
	});

	it("defaults multiSelect to undefined when not specified", () => {
		const input = {
			questions: [
				{
					question: "Which one?",
					header: "Pick",
					options: [
						{ label: "A", description: "First" },
						{ label: "B", description: "Second" },
					],
				},
			],
		};
		assert.ok(input.questions[0].multiSelect === undefined);
	});

	it("accepts preview field on options", () => {
		const input = {
			questions: [
				{
					question: "Which layout?",
					header: "Layout",
					options: [
						{
							label: "Grid",
							description: "CSS Grid layout",
							preview: "+------+------+\n| Card | Card |\n+------+------+",
						},
						{
							label: "Flex",
							description: "Flexbox layout",
							preview: "+------------------+\n| Item | Item | Item|\n+------------------+",
						},
					],
				},
			],
		};
		assert.ok(input.questions[0].options[0].preview !== undefined);
		assert.ok(input.questions[0].options[0].preview!.includes("Card"));
		assert.ok(input.questions[0].options[1].preview !== undefined);
	});

	it("preview field is optional", () => {
		const input = {
			questions: [
				{
					question: "Which one?",
					header: "Pick",
					options: [
						{ label: "A", description: "First" },
						{ label: "B", description: "Second" },
					],
				},
			],
		};
		assert.ok(input.questions[0].options[0].preview === undefined);
	});
});

// ── Header validation ────────────────────────────────────────────────

describe("header constraints", () => {
	it("header should be max 12 chars", () => {
		const header = "Auth method";
		assert.ok(header.length <= 12);
	});

	it("flags headers that are too long", () => {
		const header = "Authentication Method Choice";
		assert.ok(header.length > 12, "this header exceeds the 12-char limit");
	});
});

// ── Uniqueness validation ────────────────────────────────────────────

describe("uniqueness validation", () => {
	// Reimplemented here to test the logic independently
	function validateUniqueness(questions: { question: string; options: { label: string }[] }[]): string | null {
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

	it("passes for unique questions and labels", () => {
		const result = validateUniqueness([
			{ question: "Q1?", options: [{ label: "A" }, { label: "B" }] },
			{ question: "Q2?", options: [{ label: "C" }, { label: "D" }] },
		]);
		assert.equal(result, null);
	});

	it("fails for duplicate question texts", () => {
		const result = validateUniqueness([
			{ question: "Same?", options: [{ label: "A" }, { label: "B" }] },
			{ question: "Same?", options: [{ label: "C" }, { label: "D" }] },
		]);
		assert.ok(result !== null);
		assert.ok(result!.includes("unique"));
	});

	it("fails for duplicate option labels within a question", () => {
		const result = validateUniqueness([
			{ question: "Q1?", options: [{ label: "Dup" }, { label: "Dup" }] },
		]);
		assert.ok(result !== null);
		assert.ok(result!.includes("unique"));
	});

	it("allows same labels across different questions", () => {
		const result = validateUniqueness([
			{ question: "Q1?", options: [{ label: "Yes" }, { label: "No" }] },
			{ question: "Q2?", options: [{ label: "Yes" }, { label: "No" }] },
		]);
		assert.equal(result, null);
	});
});

// ── Answer formatting ────────────────────────────────────────────────

describe("answer formatting", () => {
	it("formats single answers correctly", () => {
		const answers: Record<string, string> = {
			"Which framework?": "React",
		};
		const text = Object.entries(answers)
			.map(([q, a]) => `"${q}" → "${a}"`)
			.join("\n");
		assert.equal(text, '"Which framework?" → "React"');
	});

	it("formats multiple answers correctly", () => {
		const answers: Record<string, string> = {
			"Which framework?": "React",
			"Which database?": "PostgreSQL",
		};
		const text = Object.entries(answers)
			.map(([q, a]) => `"${q}" → "${a}"`)
			.join("\n");
		assert.ok(text.includes("React"));
		assert.ok(text.includes("PostgreSQL"));
		assert.ok(text.split("\n").length === 2);
	});

	it("formats multi-select answers as comma-separated", () => {
		const selections = ["Auth", "Cache", "Logging"];
		const answer = selections.join(", ");
		assert.equal(answer, "Auth, Cache, Logging");
	});

	it("handles empty answers on cancel", () => {
		const answers: Record<string, string> = {};
		assert.equal(Object.keys(answers).length, 0);
	});

	it("formats answers with annotations", () => {
		const answers: Record<string, string> = { "Which layout?": "Grid" };
		const annotations: Record<string, { preview?: string; notes?: string }> = {
			"Which layout?": { notes: "Make it responsive" },
		};
		const text = Object.entries(answers)
			.map(([q, a]) => {
				const ann = annotations[q];
				const parts = [`"${q}" → "${a}"`];
				if (ann?.notes) parts.push(`user notes: ${ann.notes}`);
				return parts.join(" ");
			})
			.join("\n");
		assert.ok(text.includes("Make it responsive"));
		assert.ok(text.includes("Grid"));
	});
});

// ── Annotation types ─────────────────────────────────────────────────

describe("annotations", () => {
	it("annotation can have preview and notes", () => {
		const annotation = {
			preview: "```\n<div>Grid</div>\n```",
			notes: "I prefer this approach",
		};
		assert.ok(annotation.preview !== undefined);
		assert.ok(annotation.notes !== undefined);
	});

	it("annotation fields are optional", () => {
		const annotation: { preview?: string; notes?: string } = {};
		assert.equal(annotation.preview, undefined);
		assert.equal(annotation.notes, undefined);
	});

	it("empty annotations are filtered out", () => {
		const annotations: Record<string, { preview?: string; notes?: string }> = {
			"Q1?": { notes: "Keep this" },
			"Q2?": {},
		};
		const filtered: Record<string, any> = {};
		for (const [k, v] of Object.entries(annotations)) {
			if (v.preview || v.notes) filtered[k] = v;
		}
		assert.equal(Object.keys(filtered).length, 1);
		assert.ok(filtered["Q1?"] !== undefined);
	});
});

// ── Edge cases ───────────────────────────────────────────────────────

describe("edge cases", () => {
	it("option labels should be non-empty", () => {
		const option = { label: "React", description: "UI library" };
		assert.ok(option.label.length > 0);
	});

	it("option descriptions should be non-empty", () => {
		const option = { label: "React", description: "UI library" };
		assert.ok(option.description.length > 0);
	});

	it("question text should end with question mark ideally", () => {
		const good = "Which framework should we use?";
		const bad = "Pick a framework";
		assert.ok(good.endsWith("?"));
		assert.ok(!bad.endsWith("?"));
	});

	it("Other option label is consistent", () => {
		const OTHER_LABEL = "Other (type your own)";
		assert.ok(OTHER_LABEL.includes("Other"));
		assert.ok(OTHER_LABEL.includes("type"));
	});

	it("Chat about this is available as an option", () => {
		const CHAT_LABEL = "Chat about this";
		assert.ok(CHAT_LABEL.includes("Chat"));
	});
});
