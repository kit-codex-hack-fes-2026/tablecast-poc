import { type ThemeImage } from "@tablecast/api/schema";

export const emptyImage: ThemeImage = {
  imageKey: "",
  imageKind: "illustration",
  imageSource: { generated: false, description: "" },
  alt: { ja: "", en: "" },
};
