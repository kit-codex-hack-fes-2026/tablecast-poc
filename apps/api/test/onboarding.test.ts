import { expect, it } from "vitest";
import { storeOnboarding } from "../src/modules/configuration/onboarding";
import { configuration } from "./configuration-fixture";

it("未登録の設定は進捗へ加算せず、任意のゲームを分母から外して不足のメニューへ案内する", () => {
  const value = storeOnboarding(
    { ...configuration, categories: [], products: [] },
    "tablecast-store",
    1,
  );
  expect(value.progress).toEqual({
    configured: 0,
    invalid: 0,
    missing: 2,
    optional: 1,
    review: 6,
    total: 8,
    nextStepId: "menu",
  });
  expect(value.steps.find((step) => step.id === "rewards")?.count).toBeNull();
  expect(value.steps.find((step) => step.id === "games")?.count).toBeNull();
});

it("登録された店舗名・メニュー・有効な資料を数え、人による確認は完了扱いしない", () => {
  const value = storeOnboarding(
    {
      ...configuration,
      storeName: "こもれび",
      cast: {
        ...configuration.cast,
        skills: [
          {
            id: "restaurant",
            files: [
              {
                path: "SKILL.md",
                content: "---\nname: restaurant\ndescription: 店舗資料\n---\n# 営業案内",
              },
            ],
          },
        ],
      },
    },
    "tablecast-store",
    7,
    "tablecast-draft",
  );
  expect(value.progress).toEqual({
    configured: 3,
    invalid: 0,
    missing: 0,
    optional: 1,
    review: 5,
    total: 8,
    nextStepId: "options",
  });
  expect(value.steps.find((step) => step.id === "publication")?.status).toBe("review");
  expect(value.steps.find((step) => step.id === "options")?.href).toBe(
    "/admin/stores/tablecast-store/menu/changes/tablecast-draft/plans",
  );
});

it("資料の不正を不足や確認待ちより優先し、修正後は進捗と次の設定先を再集計する", () => {
  const current = structuredClone(configuration);
  current.products = [];
  current.cast.skills = [
    { id: "restaurant", files: [{ path: "SKILL.md", content: "# 不正な資料" }] },
  ];
  const invalid = storeOnboarding(current, "tablecast-store", 1);
  expect(invalid.progress.invalid).toBe(2);
  expect(invalid.progress.nextStepId).toBe("knowledge");
  current.cast.skills = [
    {
      id: "restaurant",
      files: [
        {
          path: "SKILL.md",
          content: "---\nname: restaurant\ndescription: 店舗資料\n---\n# 営業案内",
        },
      ],
    },
  ];
  const fixed = storeOnboarding(current, "tablecast-store", 2);
  expect(fixed.progress.invalid).toBe(0);
  expect(fixed.progress.configured).toBe(1);
  expect(fixed.progress.nextStepId).toBe("menu");
});
