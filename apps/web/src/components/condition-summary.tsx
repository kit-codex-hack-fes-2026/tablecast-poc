import type { OptionCondition, Product } from "@tablecast/api/schema";
import { useI18n } from "../i18n/locale";

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
            `${group.text[locale].displayName} / ${option.text[locale].displayName}`,
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
