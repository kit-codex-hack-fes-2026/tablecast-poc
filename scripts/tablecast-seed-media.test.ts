import { expect, it } from "vitest";
import { imageKey } from "./tablecast-seed-media";
it("画像内容が同じならキーを再利用し、差し替えた内容だけ別キーになる", () => {
  // Given: 同じ内容と変更した内容の画像。
  const original = new TextEncoder().encode("tablecast-image");
  // When / Then: 内容に基づいてURLのidentityを決定する。
  expect(imageKey(original)).toMatch(/^tablecast\/images\/[a-f0-9]{64}\.png$/);
  expect(imageKey(original)).toBe(imageKey(original.slice()));
  expect(imageKey(original)).not.toBe(imageKey(new TextEncoder().encode("replacement")));
});
