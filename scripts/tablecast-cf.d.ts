// cf beta.14の公開CLI入口は型定義を同梱しない。利用する公開exportだけを宣言する。
declare module "cf" {
  export function main(): Promise<void>;
  export class CliExit extends Error {
    readonly code: number;
  }
}
