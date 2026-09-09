import type { UserConfig } from "@commitlint/types";

const config: UserConfig = {
  extends: ["@commitlint/config-conventional"],
  ignores: [(message) => /^wip\b/i.test(message)],
  plugins: [
    {
      rules: {
        "gitmoji-required": ({ subject }) => [
          typeof subject === "string" &&
            /^[\p{Emoji_Presentation}\p{Extended_Pictographic}](?:\uFE0F|\uFE0E)? /u.test(subject),
          "件名の先頭にGitmojiと空白が必要。.agents/skills/conventional-commit/SKILL.mdを参照。",
        ],
      },
    },
  ],
  rules: {
    "body-empty": [2, "never"],
    "gitmoji-required": [2, "always"],
    "header-max-length": [2, "always", 100],
    "subject-case": [0],
  },
};

export default config;
