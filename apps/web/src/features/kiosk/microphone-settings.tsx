import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { CircleAlert, LoaderCircle, Mic, X } from "lucide-react";
import { useId } from "react";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { useI18n } from "../../i18n/locale";
import { initialMicrophone, type MicrophoneError, type VoiceView } from "./voice-model";

const errors: Record<MicrophoneError, [string, string]> = {
  permission: [
    "マイクの使用が許可されていません。ブラウザーのサイト設定で許可してから、音声を再開してください。",
    "Microphone access is blocked. Allow it in your browser’s site settings, then resume voice.",
  ],
  empty: [
    "入力マイクが見つかりません。マイクの接続とブラウザーの許可を確認し、一覧を更新してください。",
    "No microphones found. Check the connection and browser permission, then refresh the list.",
  ],
  disconnected: [
    "選択したマイクが使用できなくなりました。接続を確認するか別のマイクを選び、音声を再開してください。",
    "The selected microphone is unavailable. Reconnect it or choose another microphone, then resume voice.",
  ],
  failed: [
    "マイクを確認・切替できませんでした。他のアプリの使用を確認し、一覧を更新するか別のマイクを選んでください。",
    "Could not check or switch microphones. Check whether another app is using it, then refresh the list or choose another microphone.",
  ],
  unsupported: [
    "このブラウザーではマイクを選択できません。端末の入力設定を確認し、対応するブラウザーで音声を再開してください。",
    "This browser cannot select a microphone. Check your device’s input settings or resume voice in a supported browser.",
  ],
};

export function MicrophoneNotice({ error }: { error?: MicrophoneError }) {
  const { locale } = useI18n();
  return error ? (
    <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {errors[error][locale === "ja" ? 0 : 1]}
    </p>
  ) : null;
}

export function MicrophoneSettings({
  view,
  onChange,
  onRefresh,
}: {
  view: VoiceView;
  onChange: (deviceId: string) => void;
  onRefresh: () => void;
}) {
  const { locale } = useI18n();
  const ja = locale === "ja";
  const labelId = useId();
  const microphone = view.microphone ?? initialMicrophone;
  const paused = ["idle", "paused", "stopping", "error"].includes(view.status);
  const busy = microphone.switching || view.status === "connecting" || view.status === "stopping";
  const selectedMissing =
    microphone.selectedId !== "default" &&
    !microphone.devices.some((device) => device.deviceId === microphone.selectedId);
  const options = [
    { value: "default", label: ja ? "端末の既定のマイク" : "Device default microphone" },
    ...microphone.devices.flatMap((device, index) =>
      device.deviceId === "default"
        ? []
        : [
            {
              value: device.deviceId,
              label: device.label || `${ja ? "マイク" : "Microphone"} ${index + 1}`,
            },
          ],
    ),
    ...(selectedMissing
      ? [
          {
            value: microphone.selectedId,
            label: ja ? "選択したマイク（未接続）" : "Selected microphone (unavailable)",
          },
        ]
      : []),
  ];
  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) onRefresh();
      }}
    >
      <DialogPrimitive.Trigger
        render={<Button variant="outline" size="icon" className="size-11" />}
        aria-label={ja ? "マイク設定" : "Microphone settings"}
      >
        <Mic className="size-5" aria-hidden="true" />
      </DialogPrimitive.Trigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{ja ? "マイク設定" : "Microphone settings"}</DialogTitle>
          <DialogClose aria-label={ja ? "閉じる" : "Close"}>
            <X aria-hidden="true" />
          </DialogClose>
        </DialogHeader>
        <DialogDescription>
          {paused
            ? ja
              ? "選択したマイクは、音声を開始・再開したときに使います。設定の変更だけでは音声は始まりません。"
              : "Your selection will be used when you start or resume voice. Changing settings does not start voice."
            : ja
              ? "会話に使う入力マイクを切り替えます。"
              : "Choose the microphone used for this conversation."}
        </DialogDescription>
        <div className="mt-5 space-y-3 overflow-y-auto">
          <p id={labelId} className="text-sm font-medium">
            {ja ? "入力マイク" : "Input microphone"}
          </p>
          <Select
            items={options}
            value={microphone.selectedId}
            onValueChange={(value) => {
              if (value) onChange(value);
            }}
            disabled={busy}
          >
            <SelectTrigger aria-labelledby={labelId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-w-[calc(100vw-3rem)]">
              {options.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  disabled={selectedMissing && option.value === microphone.selectedId}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p role="status" className="text-sm text-muted-foreground">
            {microphone.switching
              ? ja
                ? "マイクを切り替えています…"
                : "Switching microphone…"
              : microphone.activeLabel
                ? `${ja ? "使用中" : "In use"}: ${microphone.activeLabel}`
                : paused
                  ? ja
                    ? "音声は停止中です"
                    : "Voice is paused"
                  : null}
          </p>
          {microphone.permissionRequired && (
            <p className="text-sm text-muted-foreground">
              {ja
                ? "マイクの許可前は、名前や一覧が表示されない場合があります。音声を開始して許可した後、一覧を更新してください。"
                : "Microphone names and devices may be hidden before permission is granted. Start voice to grant access, then refresh the list."}
            </p>
          )}
          {microphone.limited && (
            <p className="text-sm text-muted-foreground">
              {ja
                ? "ブラウザーや端末が公開する入力のみ選べます。iPadなどで候補が1つの場合は、端末側の入力設定も確認してください。"
                : "Only inputs exposed by your browser and device are available. If an iPad or other device lists only one input, check its input settings."}
            </p>
          )}
          <MicrophoneNotice error={microphone.error} />
          <Button
            variant="outline"
            onClick={onRefresh}
            disabled={microphone.loading || busy}
            className="w-full"
          >
            {microphone.loading && (
              <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />
            )}
            {microphone.loading
              ? ja
                ? "マイクを確認中…"
                : "Checking microphones…"
              : ja
                ? "一覧を更新"
                : "Refresh list"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
