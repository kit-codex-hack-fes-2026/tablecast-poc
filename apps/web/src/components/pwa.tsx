import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Serwist } from "@serwist/window";
import { useI18n } from "../i18n/locale";

export function Pwa() {
  const client = useQueryClient();
  const router = useRouter();
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return undefined;
    const worker = new Serwist("/sw.js", { updateViaCache: "none" });
    let registration: ServiceWorkerRegistration | undefined;
    let disposed = false;
    let reloading = false;
    let locked = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const release = () => {
      clearTimeout(timer);
      if (locked) document.body.inert = false;
      locked = false;
    };
    const message = (event: MessageEvent) => {
      if (event.data?.type === "TABLECAST_CANCEL_UPDATE") release();
      if (!["TABLECAST_CHECK_UPDATE", "TABLECAST_PREPARE_UPDATE"].includes(event.data?.type))
        return;
      const ready =
        navigator.onLine &&
        !client.isMutating() &&
        !client.isFetching() &&
        router.state.status === "idle" &&
        !document.querySelector('[data-pwa-blocked="true"]') &&
        [...document.forms].every((form) => form.querySelector("[data-pwa-blocked]"));
      if (ready && event.data.type === "TABLECAST_PREPARE_UPDATE") {
        locked = true;
        document.body.inert = true;
        clearTimeout(timer);
        timer = setTimeout(release, 10_000);
      }
      event.ports[0]?.postMessage(ready);
    };
    const apply = () => {
      if (!document.hidden && navigator.onLine)
        registration?.waiting?.postMessage({ type: "TABLECAST_REQUEST_UPDATE" });
    };
    const check = async () => {
      if (document.hidden || !navigator.onLine || !registration) return;
      try {
        await registration.update();
        apply();
      } catch {
        /* 通信復帰時に再試行する。 */
      }
    };
    worker.addEventListener("waiting", apply);
    const controlling = () => {
      if (!locked || reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", controlling);
    navigator.serviceWorker.addEventListener("message", message);
    void worker
      .register()
      .then((value) => {
        if (disposed) return;
        registration = value;
        void check();
      })
      .catch(() => {
        /* 登録できなくてもオンラインの業務は継続する。 */
      });
    const resume = () => {
      void check();
    };
    const poll = setInterval(resume, 60_000);
    const retry = setInterval(apply, 5000);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      disposed = true;
      worker.removeEventListener("waiting", apply);
      navigator.serviceWorker.removeEventListener("controllerchange", controlling);
      release();
      clearInterval(poll);
      clearInterval(retry);
      navigator.serviceWorker.removeEventListener("message", message);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [client, router]);
  return null;
}

export function PwaInstallHelp() {
  const { t } = useI18n();
  return (
    <details data-pwa-install className="m-3 text-sm text-muted-foreground print:hidden">
      <summary className="cursor-pointer">{t("pwa_install_title")}</summary>
      <p className="mt-2">{t("pwa_install_steps")}</p>
      <div className="mt-2 flex gap-4">
        <a href="/">{t("pwa_kiosk")}</a>
        <a href="/admin/live">{t("pwa_staff")}</a>
      </div>
    </details>
  );
}
