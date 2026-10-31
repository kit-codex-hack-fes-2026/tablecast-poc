import { apiFactory } from "../../platform/http";
import { measured } from "../../platform/telemetry";
import { staffIdentity } from "../auth/middleware";
import { getDemoImageAccess, getDemoRecord } from "./queries";

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
  if (c.req.method === "GET" && c.req.path.includes("/table/images/")) {
    const record = await measured("tablecast.authentication.demo", () =>
      getDemoImageAccess(c.var.services, c.var.actor),
    );
    c.set("actor", { ...c.var.actor, role: record.role ?? undefined });
    await next();
    return;
  }
  const record = await measured("tablecast.authentication.demo", () =>
    getDemoRecord(c.get("services"), c.get("actor"), true),
  );
  c.get("services").tableAccess.session = record.session;
  c.set("actor", { ...c.get("actor"), role: record.role ?? undefined });
  await next();
});
