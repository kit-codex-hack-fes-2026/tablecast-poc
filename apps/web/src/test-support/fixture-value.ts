import { assert } from "vitest";

// 配列のfixture不足を、後続の操作より前に検査する。
export function fixtureValue<T>(value: T | undefined): T {
  assert.isDefined(value, "検証に必要なfixtureがありません");
  return value;
}
