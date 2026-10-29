import { resolveText } from "@tablecast/api/localization";
import {
  type CartLine,
  cartLineSchema,
  type PricedLine,
  type Product,
} from "@tablecast/api/schema";
import { z } from "zod";

export const cartSubmissionSchema = z.object({
  change: z.discriminatedUnion("type", [
    z.object({ type: z.enum(["add", "edit"]), line: cartLineSchema }),
    z.object({
      type: z.literal("quantity"),
      id: z.string(),
      quantity: z.number().int().min(1).max(20),
    }),
    z.object({ type: z.literal("remove"), id: z.string() }),
  ]),
  configVersion: z.number().int(),
  dismissProductId: z.string().optional(),
});

export type CartSubmission = z.infer<typeof cartSubmissionSchema> & {
  addition?: { from: DOMRect; imageKey: string };
};

/** 数量は絶対値、追加は固定した行IDとし、受理済みの応答にも二重適用しない。 */
export function applyCartChange(lines: CartLine[], { change }: CartSubmission): CartLine[] {
  if (change.type === "add")
    return [...lines.filter((line) => line.id !== change.line.id), change.line];
  if (change.type === "edit")
    return lines.map((line) => (line.id === change.line.id ? change.line : line));
  if (change.type === "remove") return lines.filter((line) => line.id !== change.id);
  if (change.type === "quantity")
    return lines.map((line) =>
      line.id === change.id ? { ...line, quantity: change.quantity } : line,
    );
  return lines;
}

/** 金額や適用条件は計算せず、未確定行はAPI由来の名称・選択肢と操作値だけを表示する。 */
export function pendingCartLines(
  confirmed: PricedLine[],
  submissions: CartSubmission[],
  products: Product[],
) {
  if (!submissions.length) return confirmed;
  const touched = new Set(
    submissions.map(({ change }) => ("line" in change ? change.line.id : change.id)),
  );
  return submissions.reduce<CartLine[]>(applyCartChange, confirmed).map((line) => {
    const previous = confirmed.find((item) => item.id === line.id);
    if (previous && !touched.has(line.id)) return previous;
    const product = products.find((item) => item.id === line.productId);
    return {
      ...line,
      name: previous?.name ?? {
        ja: product?.text.ja.displayName ?? "商品",
        en: (product ? resolveText(product.text, "en").displayName : undefined) ?? "Item",
      },
      speechName: previous?.speechName ?? {
        ja: product?.text.ja.speechName ?? "商品",
        en: (product ? resolveText(product.text, "en").speechName : undefined) ?? "Item",
      },
      options: line.selections.flatMap((selection) => {
        const option = product?.modifiers
          .flatMap((group) => group.options)
          .find((item) => item.id === selection.optionId);
        if (!option) return [];
        return [
          {
            id: option.id,
            name: {
              ja: option.text.ja.displayName,
              en: resolveText(option.text, "en").displayName,
            },
            speechName: {
              ja: option.text.ja.speechName,
              en: resolveText(option.text, "en").speechName,
            },
            quantity: selection.quantity,
            priceDelta: option.priceDelta,
          },
        ];
      }),
      missing: [],
    };
  });
}
