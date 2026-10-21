export type Actor = {
  canWrite?: boolean;
  demoId?: string;
  deviceId?: string;
  kind: "device" | "mcp" | "staff" | "voice";
  role?: string;
  storeId: string;
  tableSessionId?: string;
  turnId?: string;
  userId?: string;
  voiceSessionId?: string;
};
