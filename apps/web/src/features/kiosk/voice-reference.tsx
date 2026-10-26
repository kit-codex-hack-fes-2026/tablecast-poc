import type { VoiceReference } from "@tablecast/api/schema";
import { ExternalLink, Globe } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { useI18n } from "../../i18n/locale";

const fallbackIcon = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="white"/><circle cx="12" cy="12" r="8" fill="none" stroke="#171717" stroke-width="1.5"/><path d="M4 12h16M12 4c-5 5-5 11 0 16 5-5 5-11 0-16Z" fill="none" stroke="#171717" stroke-width="1.5"/></svg>')}`;

export function VoiceReferenceCard({ reference }: { reference: VoiceReference }) {
  const { t } = useI18n();
  const [favicon, setFavicon] = useState(reference.faviconUrl);
  const domain = new URL(reference.url).hostname;
  const dense = new TextEncoder().encode(reference.url).byteLength > 400;
  const qrSize = dense ? 400 : 192;
  return (
    <article
      className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card"
      data-ui="voice-reference"
    >
      {reference.imageUrl && <ReferenceImage url={reference.imageUrl} title={reference.title} />}
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {favicon ? (
            <img
              src={favicon}
              width={20}
              height={20}
              alt=""
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
              className="size-5 shrink-0 rounded-sm"
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
          className="flex items-start gap-2 font-semibold leading-relaxed underline-offset-4 hover:underline"
        >
          <span className="min-w-0 wrap-break-word">{reference.title}</span>
          <ExternalLink className="mt-1 size-4 shrink-0" aria-hidden="true" />
        </a>
        {reference.description && (
          <p className="text-sm leading-relaxed text-muted-foreground">{reference.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <div className="max-w-full rounded-xl bg-on-inverse p-2 text-inverse">
            <QRCodeSVG
              value={reference.url}
              size={qrSize}
              className="h-auto max-w-full"
              level={dense ? "Q" : "H"}
              marginSize={4}
              title={`${t("kiosk_reference_qr")}: ${reference.title}`}
              imageSettings={{
                src: favicon ?? fallbackIcon,
                width: 24,
                height: 24,
                excavate: true,
                crossOrigin: "anonymous",
              }}
            />
          </div>
          <p className="max-w-36 text-sm leading-relaxed text-muted-foreground">
            {t("kiosk_reference_phone")}
          </p>
        </div>
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
      className="aspect-video w-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}
