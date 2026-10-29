import { and, eq, inArray } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import type { Configuration } from "../configuration/model";
import type { ImageAssets } from "./model";
import { mediaAssets } from "../../db/media-schema";
import { ensure } from "../../platform/errors";

export async function getImageMetadata(services: ApiServices, storeId: string, imageKey: string) {
  const metadata = await services.db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.store_id, storeId), eq(mediaAssets.image_key, imageKey)))
    .get();
  ensure(metadata, "MEDIA_NOT_FOUND", 404);
  return metadata;
}

export function configurationImageKeys(configuration: Configuration): string[] {
  return [
    ...new Set(
      [
        configuration.branding?.logo?.imageKey,
        configuration.branding?.banner?.imageKey,
        configuration.branding?.memberIcon?.imageKey,
        configuration.branding?.membershipCard?.image?.imageKey,
        ...Object.values(configuration.appearance?.assets ?? {}).map((image) => image.imageKey),
        ...(configuration.banners ?? []).map((banner) => banner.image.imageKey),
        ...configuration.products.flatMap((product) => [
          product.imageKey,
          ...product.modifiers.flatMap((group) => group.options.map((option) => option.imageKey)),
        ]),
      ].filter((key): key is string => Boolean(key)),
    ),
  ];
}

/** 表示用HTTP応答だけに付与し、設定JSON・注文計算・MCPのカタログへは保存しない。 */
export async function withImageAssets<T extends { configuration: Configuration; storeId: string }>(
  services: ApiServices,
  value: T,
): Promise<T & { imageAssets: ImageAssets }> {
  const keys = configurationImageKeys(value.configuration);
  if (!keys.length) return { ...value, imageAssets: {} };
  // D1のbind上限内で分割し、画像ごとの往復にはせず同じbatchで取得する。
  const queries = Array.from({ length: Math.ceil(keys.length / 80) }, (_, index) =>
    services.db
      .select()
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.store_id, value.storeId),
          inArray(mediaAssets.image_key, keys.slice(index * 80, (index + 1) * 80)),
        ),
      ),
  );
  const [first, ...rest] = queries;
  if (!first) return { ...value, imageAssets: {} };
  const images = (await services.db.batch([first, ...rest])).flat();
  return {
    ...value,
    imageAssets: Object.fromEntries(
      images.map((image) => [
        image.image_key,
        {
          width: image.width,
          height: image.height,
          blurhash: image.blurhash,
        },
      ]),
    ),
  };
}
