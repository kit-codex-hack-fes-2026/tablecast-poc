import type { OptionCondition, Product } from "@tablecast/api/schema";
import { resolveText } from "@tablecast/api/localization";
import { useI18n } from "../i18n/locale";

/**
 * 選択条件を読み取る短い説明。
 * expressionはAPIのOptionCondition、productがあるとIDを日英の商品選択肢名へ解決する。
 * 条件の編集・判定の正本はAPI。
 * 演算子だけをアイコンにせず、文字で関係を伝える。
 */
export function ConditionSummary({
  expression,
  product,
}: {
  expression: OptionCondition;
  product?: Product;
}) {
  const { locale, t } = useI18n();
  const names = new Map(
    product?.modifiers.flatMap((group) =>
      group.options.map(
        (option) =>
          [
            option.id,
            `${resolveText(group.text, locale).displayName} / ${resolveText(option.text, locale).displayName}`,
          ] as const,
      ),
    ),
  );
  const describe = (node: OptionCondition): string => {
    if (node.kind === "option")
      return names.get(node.optionId) ?? (node.optionId || t("condition_choose"));
    if (node.kind === "not") return `${t("condition_not")} (${describe(node.child)})`;
    return `(${node.children.map(describe).join(` ${t(node.kind === "and" ? "condition_and" : "condition_or")} `)})`;
  };
  return <span className="wrap-anywhere">{describe(expression)}</span>;
}
