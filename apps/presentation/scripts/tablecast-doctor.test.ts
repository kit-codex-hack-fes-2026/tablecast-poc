import { expect, test } from "vitest";
import { openScreenResult } from "./tablecast-doctor";

test("OpenScreenの複数行の応答から正常完了だけを取り出す", () => {
  const done = { event: "done", success: true, sources: { windows: [] } };
  expect(
    openScreenResult(
      `OpenScreen CLI\r\n{"event":"progress","percentage":20}\r\n${JSON.stringify(done)}\r\n`,
    ),
  ).toEqual(done);
});

test("開始・進捗だけの終了や失敗イベントを成功扱いしない", () => {
  for (const output of [
    "",
    '{"event":"progress","percentage":100}',
    '{"event":"done","success":false}',
    '{"event":"done","success":true}\n{"event":"done","success":false}',
  ])
    expect(() => openScreenResult(output)).toThrow("正常完了イベント");
});
