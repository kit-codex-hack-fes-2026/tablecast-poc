import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { useI18n } from "../i18n/locale";
import { Brand } from "./brand";
import { Button } from "./ui/button";

const dismissedKey = "tablecast-pwa-install-dismissed";

type InstallPromptEvent = Event & {
  prompt: () => Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isInstallPrompt(event: Event): event is InstallPromptEvent {
  return "prompt" in event && typeof event.prompt === "function";
}

export function PwaInstallToast() {
  const { t } = useI18n();
  const [offer, setOffer] = useState<InstallPromptEvent | "manual" | "error" | null>(null);
  const dismissed = useRef(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const isStandalone = () =>
      standalone.matches || ("standalone" in navigator && navigator.standalone === true);
    try {
      dismissed.current = sessionStorage.getItem(dismissedKey) === "true";
    } catch {
      // 保存が禁止されている場合も、この画面内では閉じた状態を維持する。
    }
    const installable = (event: Event) => {
      if (!isInstallPrompt(event) || isStandalone() || dismissed.current) return;
      event.preventDefault();
      setOffer(event);
    };
    const installed = () => {
      dismissed.current = true;
      setOffer(null);
    };
    const displayChanged = () => {
      if (isStandalone()) installed();
    };
    // iPadOSのデスクトップ表示も手動追加の案内対象にする。
    const isAppleMobile =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    if (isAppleMobile && !isStandalone() && !dismissed.current) setOffer("manual");
    window.addEventListener("beforeinstallprompt", installable);
    window.addEventListener("appinstalled", installed);
    standalone.addEventListener("change", displayChanged);
    return () => {
      window.removeEventListener("beforeinstallprompt", installable);
      window.removeEventListener("appinstalled", installed);
      standalone.removeEventListener("change", displayChanged);
    };
  }, []);

  const dismiss = () => {
    dismissed.current = true;
    setOffer(null);
    try {
      sessionStorage.setItem(dismissedKey, "true");
    } catch {
      // ストレージを利用できなくても操作は妨げない。
    }
  };
  const install = async () => {
    if (!offer || typeof offer === "string") return;
    const event = offer;
    dismiss();
    try {
      // promptは一度だけ、利用者のクリックから直接呼ぶ。
      await event.prompt();
    } catch {
      setOffer("error");
    }
  };

  return (
    <div
      data-pwa-install
      className="pointer-events-none fixed left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex justify-center sm:left-[max(1.5rem,env(safe-area-inset-left))] sm:right-[max(1.5rem,env(safe-area-inset-right))] sm:justify-end print:hidden"
      aria-live="polite"
      aria-atomic="true"
    >
      {offer && (
        <section
          aria-label={t("pwa_toast_title")}
          className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-popover p-4 text-popover-foreground shadow-lg transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] starting:translate-y-2 starting:opacity-0 motion-reduce:transition-opacity motion-reduce:starting:translate-y-0"
        >
          <Brand variant="symbol" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t("pwa_toast_title")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                offer === "manual"
                  ? "pwa_toast_ios"
                  : offer === "error"
                    ? "pwa_toast_error"
                    : "pwa_toast_description",
              )}
            </p>
            {typeof offer !== "string" && (
              <Button className="mt-3" onClick={() => void install()}>
                <Download aria-hidden />
                {t("pwa_toast_install")}
              </Button>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="-mr-1 -mt-1 shrink-0"
            aria-label={t("pwa_toast_dismiss")}
            onClick={dismiss}
          >
            <X aria-hidden />
          </Button>
        </section>
      )}
    </div>
  );
}
