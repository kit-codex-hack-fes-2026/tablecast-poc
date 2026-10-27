import { apiFactory } from "../../platform/http";
import { measured } from "../../platform/telemetry";
import { staffIdentity } from "../auth/middleware";
import { getDemoRecord } from "./queries";

export const requireDemo = apiFactory.createMiddleware(async (c, next) => {
  const demoId = c.req.param("demoId");
  const session = await staffIdentity(c);
  const storeId = c.req.param("storeId");
  // 店舗member・所有者・卓・設定はgetDemoRecordの同じ読取で認可する。
  c.set("actor", {
    kind: "staff",
    storeId: storeId ?? "",
    userId: session.user.id,
    demoId,
    tableSessionId: demoId,
  });
  const record = await measured("tablecast.authentication.demo", () =>
    getDemoRecord(c.get("services"), c.get("actor"), true),
  );
  c.get("services").tableAccess.session = record.session;
  c.set("actor", { ...c.get("actor"), role: record.role ?? undefined });
  await next();
});
