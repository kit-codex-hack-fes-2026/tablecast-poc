import type { CastInstruction, InstructionBlock } from "@tablecast/api/schema";
import { createElement, type ReactNode } from "react";

function instructionBlock(node: InstructionBlock, path: string): ReactNode {
  if (node.type === "bulletList" || node.type === "orderedList") {
    return createElement(
      node.type === "bulletList" ? "ul" : "ol",
      {
        key: path,
        className: node.type === "bulletList" ? "list-disc pl-6" : "list-decimal pl-6",
        ...(node.type === "orderedList" ? { start: node.attrs?.start ?? 1 } : {}),
      },
      node.content.map((item, index) =>
        createElement(
          "li",
          { key: `${path}-${index}` },
          item.content.map((child, childIndex) =>
            instructionBlock(child, `${path}-${index}-${childIndex}`),
          ),
        ),
      ),
    );
  }
  const children = node.content?.map((item, index) => {
    const key = `${path}-${index}`;
    if (item.type === "hardBreak") return createElement("br", { key });
    let text: ReactNode = item.text;
    if (item.marks?.some((mark) => mark.type === "bold"))
      text = createElement("strong", { key }, text);
    if (item.marks?.some((mark) => mark.type === "italic"))
      text = createElement("em", { key }, text);
    return text;
  });
  if (node.type === "paragraph")
    return createElement("p", { key: path, className: "min-h-6" }, children);
  const tag = node.attrs.level === 1 ? "h3" : node.attrs.level === 2 ? "h4" : "h5";
  return createElement(
    tag,
    {
      key: path,
      className: node.attrs.level === 1 ? "text-xl font-semibold" : "text-lg font-semibold",
    },
    children,
  );
}
export function InstructionView({ value }: { value: CastInstruction }) {
  return (
    <div className="space-y-3 whitespace-pre-wrap wrap-anywhere leading-relaxed">
      {typeof value === "string" ? (
        <p>{value}</p>
      ) : (
        value.document.content.map((node, index) => instructionBlock(node, String(index)))
      )}
    </div>
  );
}
