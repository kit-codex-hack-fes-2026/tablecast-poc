import { getPixels } from "@unpic/pixels";
import { encode } from "blurhash";
import type { ImageAsset } from "./model";
import { byteStream } from "../../platform/streams";

/** 保存済みの向き・縦横比に合わせて、取込時に一度だけBlurHashを生成する。 */
export async function generateImageAsset(
  images: TablecastEnv["TABLECAST_IMAGES"],
  bytes: ArrayBuffer,
): Promise<ImageAsset> {
  const source = new Blob([bytes]);
  const info = await images.info(byteStream(source.stream()));
  if (!("width" in info) || !("height" in info)) throw new Error("画像の寸法がありません");
  const small = await images
    .input(byteStream(source.stream()))
    .transform({ width: 32, height: 32, fit: "scale-down" })
    .output({ format: "image/png", anim: false });
  const pixels = await getPixels(await small.response().arrayBuffer());
  return {
    width: info.width,
    height: info.height,
    blurhash: encode(Uint8ClampedArray.from(pixels.data), pixels.width, pixels.height, 6, 4),
  };
}
