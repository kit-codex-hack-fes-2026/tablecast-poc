/** 言語と通貨で共通の装飾用国旗。 */
export function Flag({ src }: { src: string }) {
  return (
    <img
      src={src}
      width={18}
      height={14}
      className="h-3.5 w-4.5 shrink-0 rounded-xs object-contain"
      alt=""
      aria-hidden="true"
    />
  );
}
