import { type Product } from "@tablecast/api/schema";

export type ImageValue = Pick<Product, "imageKey" | "imageKind" | "imageSource">;

export type ImageStagedChange = (id: string, staged: boolean) => void;

export type ImageMetadata = Pick<Product, "imageKind"> & {
  imageSource: NonNullable<Product["imageSource"]>;
};

export type ImageInput = {
  candidate: null | { file: File; url: string };
  error:
    | "editor_image_invalid_file"
    | "editor_image_invalid_key"
    | "editor_image_source_required"
    | null;
  imageKey: string;
  metadata: ImageMetadata;
  staged: boolean;
};

export const emptyMetadata = {
  imageKind: "illustration" as const,
  imageSource: { generated: false, description: "" },
};

export function imageInput(value: ImageValue): ImageInput {
  return {
    candidate: null,
    imageKey: value.imageKey ?? "",
    metadata: {
      imageKind: value.imageKind,
      imageSource: value.imageSource ?? emptyMetadata.imageSource,
    },
    staged: false,
    error: null,
  };
}
