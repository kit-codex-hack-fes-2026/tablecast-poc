import type { CastInstruction, InstructionDocument } from "@tablecast/api/schema";

export function instructionDocument(value: CastInstruction): InstructionDocument {
  if (typeof value !== "string") return value.document;
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: value
          .split(/\r\n|\r|\n/)
          .flatMap((text, index) => [
            ...(index ? [{ type: "hardBreak" as const }] : []),
            ...(text ? [{ type: "text" as const, text }] : []),
          ]),
      },
    ],
  };
}

/** template内で取込を制限し、外部画像を含む要素を画面へ接続しない。 */
export function instructionClipboard(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const forbidden = template.content.querySelectorAll(
    "img,picture,svg,object,embed,iframe,video,audio,canvas,script,style,link,meta,base,input,button",
  );
  let omitted = forbidden.length > 0;
  forbidden.forEach((element) => element.remove());
  template.content.querySelectorAll("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      if (/url\s*\(/i.test(attribute.value)) omitted = true;
      if (element.tagName === "OL" && attribute.name === "start" && /^\d+$/.test(attribute.value))
        continue;
      element.removeAttribute(attribute.name);
    }
  });
  return { content: template.content, omitted };
}
