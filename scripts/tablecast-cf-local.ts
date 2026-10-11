import { CliExit, main } from "cf";

// beta.14のlocal D1は処理・dispose後もregistry監視を残す。公開CLI入口の完了後に終了する。
if (process.argv[2] !== "d1" || !process.argv.includes("--local")) {
  throw new Error("この互換入口はcfのlocal D1専用です。");
}
let code = 0;
try {
  await main();
} catch (error) {
  code = error instanceof CliExit ? error.code : 1;
}
await Promise.all([
  new Promise((done) => process.stdout.write("", done)),
  new Promise((done) => process.stderr.write("", done)),
]);
process.exit(code);
