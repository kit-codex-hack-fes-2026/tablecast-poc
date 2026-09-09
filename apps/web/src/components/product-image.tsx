import { Image } from "@unpic/react/base";

function transformImage(src: string | URL, { width = 640 }: { width?: number }) {
  const path = String(src).split("?")[0];
  return `${path}?width=${Math.min(1600, Math.max(1, Math.round(width)))}`;
}

export function ProductImage({
  src,
  alt,
  width,
  height,
  sizes,
  className,
  priority = false,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  sizes?: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      layout="constrained"
      objectFit="cover"
      unstyled
      priority={priority}
      className={className}
      transformer={transformImage}
      breakpoints={[96, 128, 256, 384, 640, 960, 1280, 1600]}
    />
  );
}
