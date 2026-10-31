import { defineConfig } from "vitest/config";

const unitTests = [
  "scripts/tablecast-fixtures.test.ts",
  "scripts/tablecast-catalog*.test.ts",
  "scripts/tablecast-seed-template.test.ts",
  "scripts/tablecast-preview-comment.test.ts",
  "scripts/tablecast-test-selection.test.ts",
];

export default defineConfig({
  test: {
    maxWorkers: 2,
    projects: [
      {
        test: {
          name: "scripts-unit",
          include: unitTests,
        },
      },
      {
        test: {
          name: "scripts-runtime",
          include: ["scripts/**/*.test.ts"],
          exclude: unitTests,
        },
      },
    ],
  },
});
