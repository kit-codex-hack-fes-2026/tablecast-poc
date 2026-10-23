// @types/css-treeが未提供の公式subpathに、同じ公開関数の型を対応させる。
declare module "css-tree/parser" {
  export { parse as default } from "css-tree";
}
declare module "css-tree/generator" {
  export { generate as default } from "css-tree";
}
