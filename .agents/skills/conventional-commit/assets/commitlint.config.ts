import type { UserConfig } from "@commitlint/types";

const SKILL_HINT =
  "Read the custom Conventional Commit skill before committing: conventional-commit/SKILL.md";

const LEADING_GITMOJI_PATTERN =
  /^[\p{Emoji_Presentation}\p{Extended_Pictographic}](?:\uFE0F|\uFE0E)?/u;

const config: UserConfig = {
  extends: ["@commitlint/config-conventional"],
  ignores: [(message) => /^wip\b/i.test(message)],
  parserPreset: {
    parserOpts: {
      headerPattern: /^(\w*)(?:\((.*)\))?(!)?:\s+(.+)$/,
      headerCorrespondence: ["type", "scope", "breaking", "subject"],
      breakingHeaderPattern: /^(\w*)(?:\((.*)\))?(!):\s+(.+)$/,
      issuePrefixes: ["#"],
      noteKeywords: ["BREAKING CHANGE"],
    },
  },
  plugins: [
    {
      rules: {
        "body-required": (parsed: { body?: string | null }) => [
          typeof parsed.body === "string" && parsed.body.trim().length > 0,
          `Commit body is required. ${SKILL_HINT}`,
        ],
        "gitmoji-required": (parsed: { header?: string | null }) => [
          typeof parsed.header === "string" &&
            /^(\w*)(?:\([^)]*\))?!?:\s+/.test(parsed.header) &&
            LEADING_GITMOJI_PATTERN.test(parsed.header.replace(/^(\w*)(?:\([^)]*\))?!?:\s+/, "")),
          `Commit subject must start with one Gitmoji after "type(scope):". ${SKILL_HINT}`,
        ],
      },
    },
  ],
  rules: {
    "body-empty": [0],
    "body-required": [2, "always"],
    "gitmoji-required": [2, "always"],
    "header-max-length": [2, "always", 100],
    "subject-case": [0],
  },
  helpUrl: "https://github.com/ReoHakase/skills/blob/main/conventional-commit/SKILL.md",
};

export default config;
