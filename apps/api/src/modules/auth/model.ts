export type Actor = {
  kind: "device" | "staff" | "voice" | "mcp";
  storeId: string;
  tableSessionId?: string;
  demoId?: string;
  userId?: string;
  role?: string;
  voiceSessionId?: string;
  turnId?: string;
  canWrite?: boolean;
};
