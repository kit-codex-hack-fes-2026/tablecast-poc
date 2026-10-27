import type { VoiceReference } from "@tablecast/api/schema";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ExternalLink, Globe, X, ZoomIn } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { useI18n } from "../../i18n/locale";

const fallbackIcon = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="white"/><circle cx="12" cy="12" r="8" fill="none" stroke="#171717" stroke-width="1.5"/><path d="M4 12h16M12 4c-5 5-5 11 0 16 5-5 5-11 0-16Z" fill="none" stroke="#171717" stroke-width="1.5"/></svg>')}`;

export function VoiceReferenceCard({ reference }: { reference: VoiceReference }) {
  const { t } = useI18n();
  const [favicon, setFavicon] = useState(reference.faviconUrl);
  const domain = new URL(reference.url).hostname;
  const dense = new TextEncoder().encode(reference.url).byteLength > 400;
  function qr(size: number) {
    return (
      <QRCodeSVG
        value={reference.url}
        size={size}
        className="size-auto max-w-full"
        level={dense ? "Q" : "H"}
        marginSize={4}
        title={`${t("kiosk_reference_qr")}: ${reference.title}`}
        imageSettings={{
          src: favicon ?? fallbackIcon,
          width: size > 200 ? 32 : 18,
          height: size > 200 ? 32 : 18,
          excavate: true,
          crossOrigin: "anonymous",
        }}
      />
    );
  }
  return (
    <article
      className="w-full max-w-52 overflow-hidden rounded-xl border border-border bg-card"
      data-ui="voice-reference"
    >
      {reference.imageUrl && <ReferenceImage url={reference.imageUrl} title={reference.title} />}
      <div className="space-y-2 p-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {favicon ? (
            <img
              src={favicon}
              width={16}
              height={16}
              alt=""
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
              className="size-4 shrink-0 rounded-sm"
              onError={() => setFavicon(undefined)}
            />
          ) : (
            <Globe className="size-4" aria-hidden="true" />
          )}
          <span className="truncate">{domain}</span>
        </div>
        <a
          href={reference.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-start gap-1 text-sm font-semibold leading-snug underline-offset-4 hover:underline"
        >
          <span className="min-w-0 wrap-break-word">{reference.title}</span>
          <ExternalLink className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        </a>
        {reference.description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {reference.description}
          </p>
        )}
        <Dialog>
          <DialogPrimitive.Trigger
            render={
              <Button
                variant="ghost"
                className="h-auto max-w-full rounded-lg bg-on-inverse p-0 hover:bg-on-inverse"
              />
            }
            aria-label={t("kiosk_reference_expand")}
            title={t("kiosk_reference_expand")}
          >
            {qr(144)}
          </DialogPrimitive.Trigger>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <ZoomIn className="size-3" aria-hidden="true" />
            {t("kiosk_reference_expand")}
          </p>
          <DialogContent className="max-w-xl font-sans">
            <DialogHeader>
              <DialogTitle className="text-base" style={{ fontFamily: "var(--font-sans)" }}>
                {reference.title}
              </DialogTitle>
              <DialogClose aria-label={t("common_close")}>
                <X />
              </DialogClose>
            </DialogHeader>
            <div className="mx-auto max-w-full overflow-hidden rounded-xl bg-on-inverse">
              {qr(512)}
            </div>
            <a
              className="mt-2 truncate text-sm underline"
              href={reference.url}
              target="_blank"
              rel="noreferrer"
            >
              {domain}
              <span className="sr-only">: {reference.url}</span>
            </a>
          </DialogContent>
        </Dialog>
      </div>
    </article>
  );
}
function ReferenceImage({ url, title }: { title: string; url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={url}
      alt={title}
      width={448}
      height={252}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="aspect-video max-h-24 w-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}
