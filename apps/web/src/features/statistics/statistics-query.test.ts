import { expect, it } from "vitest";
import { statisticsPeriod, statisticsRange, statisticsSearchSchema } from "./statistics-query";

it("7日・30日は今日を含み、月と年の境界を越えて選ぶ", () => {
  expect(statisticsPeriod("week", "2026-01-03")).toEqual({ from: "2025-12-28", to: "2026-01-03" });
  expect(statisticsPeriod("month", "2024-03-01")).toEqual({ from: "2024-02-01", to: "2024-03-01" });
});
it("URLに固定した期間を翌日にも維持し、逆転した期間は取得しない", () => {
  const search = statisticsSearchSchema.parse({
    period: "week",
    from: "2026-10-01",
    to: "2026-10-07",
    view: "products",
  });
  expect(statisticsRange(search, "2026-10-19")).toEqual({ from: "2026-10-01", to: "2026-10-07" });
  expect(statisticsRange({ ...search, from: "2026-10-08" }, "2026-10-19")).toBeNull();
});
