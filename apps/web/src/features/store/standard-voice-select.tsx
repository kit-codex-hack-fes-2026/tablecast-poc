import { type Locale } from "@tablecast/api/schema";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";

import { parseResponse, rpc } from "../../lib/api";
import { apiError } from "../../lib/api-error";

export function StandardVoiceSelect({
  storeId,
  language,
  value,
  retained,
  disabled,
  onChange,
}: {
  storeId: string;
  language: Locale;
  value: string | null;
  retained: (string | null)[];
  disabled: boolean;
  onChange: (voiceId: string | null) => void;
}) {
  const { t } = useI18n();
  const voices = useInfiniteQuery({
    queryKey: ["tablecast-standard-voices", storeId, language],
    queryFn: ({ pageParam, signal }: { pageParam: string | null; signal: AbortSignal }) => {
      return parseResponse(
        rpc.api.admin.stores[":storeId"].voices.$get(
          {
            param: { storeId },
            query: { locale: language, ...(pageParam !== null ? { pageToken: pageParam } : {}) },
          },
          { init: { signal } },
        ),
      );
    },
    initialPageParam: null,
    getNextPageParam: (page) => page.nextPageToken,
    retry: false,
    staleTime: 60_000,
  });
  const choices = new Map<string, string>();
  for (const voiceId of [...retained, value]) {
    if (voiceId !== null) choices.set(voiceId, voiceId);
  }
  for (const page of voices.data?.pages ?? []) {
    for (const voice of page.voices) choices.set(voice.voiceId, voice.displayName);
  }
  const code = apiError(voices.error)?.code;
  const catalogError =
    code === "VOICE_CATALOG_NOT_CONFIGURED" || code === "VOICE_CATALOG_UNAVAILABLE";
  function retry() {
    if (voices.isFetchNextPageError) void voices.fetchNextPage();
    else void voices.refetch();
  }
  return (
    <div className="space-y-3">
      <label>
        {t("editor_voice")}
        <NativeSelect
          className="h-12 rounded-lg border border-input px-3 text-base"
          value={value ?? ""}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="">{t("editor_not_configured")}</option>
          {[...choices].map(([voiceId, displayName]) => (
            <option key={voiceId} value={voiceId}>
              {displayName}
            </option>
          ))}
        </NativeSelect>
      </label>
      {voices.isPending && <output className="block">{t("common_loading")}</output>}
      {catalogError ? (
        <div
          className="flex gap-2.5 py-3 px-3.5 rounded-md bg-accent-soft text-base leading-relaxed [&_svg]:shrink-0 [&_svg]:mt-0.5 [&_[data-slot=button][data-size=text]]:min-h-6 [&_[data-slot=button][data-size=text]]:ml-auto [&_[data-slot=button][data-size=text]]:shrink-0 items-center justify-between"
          role={code === "VOICE_CATALOG_NOT_CONFIGURED" ? "status" : "alert"}
        >
          <span>
            {t(
              code === "VOICE_CATALOG_NOT_CONFIGURED"
                ? "voice_catalog_not_configured"
                : "voice_catalog_unavailable",
            )}
          </span>
          <Button
            className="shrink-0"
            type="button"
            variant="ghost"
            disabled={voices.isFetching}
            onClick={retry}
          >
            {t("common_retry")}
          </Button>
        </div>
      ) : (
        <ErrorNotice error={voices.error} onRetry={retry} />
      )}
      {voices.data &&
        !voices.hasNextPage &&
        voices.data.pages.every((page) => page.voices.length === 0) && (
          <output className="block">{t("voice_catalog_empty")}</output>
        )}
      {voices.hasNextPage && !voices.isFetchNextPageError && (
        <Button
          type="button"
          variant="outline"
          disabled={voices.isFetching}
          onClick={() => void voices.fetchNextPage()}
        >
          {t(voices.isFetching ? "common_loading" : "voice_catalog_more")}
        </Button>
      )}
    </div>
  );
}
