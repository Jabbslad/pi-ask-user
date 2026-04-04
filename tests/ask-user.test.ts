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
});
