import type { ImageAssets } from "@tablecast/api/schema";
import { createContext, type ReactNode, useContext, useMemo } from "react";

const ImageContext = createContext<{ assets?: ImageAssets; basePath: string }>({
  basePath: "/api/table",
});

/** 同じ部品を店側・客端末・デモの認可済み配信先へ接続する。 */
export function ImageProvider({
  basePath,
  assets,
  children,
}: {
  assets?: ImageAssets;
  basePath: string;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ basePath, assets }), [basePath, assets]);
  return <ImageContext.Provider value={value}>{children}</ImageContext.Provider>;
}

export function useMediaImage(src: string) {
  const { basePath, assets } = useContext(ImageContext);
  const key = src.startsWith("/media/") ? src.slice("/media/".length).split("?")[0] : undefined;
  return { src: key ? `${basePath}/images/${key}` : src, asset: key ? assets?.[key] : undefined };
}

export function useMediaBasePath() {
  return useContext(ImageContext).basePath;
}
