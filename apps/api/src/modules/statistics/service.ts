import {
  and,
  asc,
  count,
  countDistinct,
  eq,
  gte,
  lt,
  lte,
  notInArray,
  or,
  sql,
  sum,
} from "drizzle-orm";
import { orders, payments, tableEvents, tableSessions } from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import type { Actor } from "../auth/model";
import { requireManagerRead } from "../auth/policy";
import { statisticsCursorSchema, type StatisticsQuery, type StatisticsResult } from "./model";

export async function getStatistics(
  services: ApiServices,
  actor: Actor,
  input: StatisticsQuery,
): Promise<StatisticsResult> {
  requireManagerRead(actor);
  const now = Date.now();
  let cursor;
  if (input.cursor) {
    try {
      cursor = statisticsCursorSchema.parse(
        JSON.parse(new TextDecoder().decode(Uint8Array.fromBase64(input.cursor))),
      );
    } catch {
      ensure(false, "STATISTICS_CURSOR_INVALID", 400);
    }
    ensure(
      cursor &&
        cursor.storeId === actor.storeId &&
        cursor.from === input.from &&
        cursor.to === input.to &&
        cursor.timeZone === input.timeZone &&
        cursor.view === input.view &&
        cursor.locale === input.locale &&
        cursor.asOf <= now,
      "STATISTICS_CURSOR_INVALID",
      400,
    );
  }
  const asOf = cursor?.asOf ?? now;
  const db = services.db;
  const cohort = db.$with("cohort").as(
    db
      .select({
        id: tableSessions.id,
        guests: tableSessions.guest_count,
        plan: tableSessions.plan_json,
      })
      .from(tableSessions)
      .where(
        and(
          eq(tableSessions.store_id, actor.storeId),
          eq(tableSessions.kind, "table"),
          eq(tableSessions.status, "closed"),
          gte(tableSessions.closed_at, Date.parse(input.from)),
          lt(tableSessions.closed_at, Date.parse(input.to)),
          lte(tableSessions.closed_at, asOf),
        ),
      ),
  );
  const validOrder = notInArray(orders.status, ["cancelled", "rejected"]);
  const sessionSummary = db
    .with(cohort)
    .select({
      sessions: count(),
      guests: sum(cohort.guests),
      planSessions:
        sql<number>`coalesce(sum(case when ${cohort.plan} is not null then 1 else 0 end),0)`.mapWith(
          Number,
        ),
    })
    .from(cohort);
  const orderSummary = db
    .with(cohort)
    .select({
      orders: sql<number>`coalesce(sum(case when ${validOrder} then 1 else 0 end),0)`.mapWith(
        Number,
      ),
      excludedOrders:
        sql<number>`coalesce(sum(case when ${validOrder} then 0 else 1 end),0)`.mapWith(Number),
      incompleteSnapshots:
        sql<number>`coalesce(sum(case when ${validOrder} and coalesce(json_type(${orders.snapshot_json}, '$.lines'),'') != 'array' then 1 else 0 end),0)`.mapWith(
          Number,
        ),
      orderedAmount:
        sql<number>`coalesce(sum(case when ${validOrder} then ${orders.total} else 0 end),0)`.mapWith(
          Number,
        ),
    })
    .from(orders)
    .innerJoin(cohort, eq(cohort.id, orders.table_session_id))
    .where(eq(orders.store_id, actor.storeId));
  const paymentSummary = db
    .with(cohort)
    .select({
      planSessionPaidAmount:
        sql<number>`coalesce(sum(case when ${payments.kind}='payment' and ${cohort.plan} is not null then ${payments.amount} else 0 end),0)`.mapWith(
          Number,
        ),
      paidAmount:
        sql<number>`coalesce(sum(case when ${payments.kind}='payment' then ${payments.amount} else 0 end),0)`.mapWith(
          Number,
        ),
      positivePayments:
        sql<number>`coalesce(sum(case when ${payments.kind}='payment' and ${payments.amount}>0 then ${payments.amount} else 0 end),0)`.mapWith(
          Number,
        ),
      negativePayments:
        sql<number>`coalesce(sum(case when ${payments.kind}='payment' and ${payments.amount}<0 then ${payments.amount} else 0 end),0)`.mapWith(
          Number,
        ),
      adjustments:
        sql<number>`coalesce(sum(case when ${payments.kind}='adjustment' then ${payments.amount} else 0 end),0)`.mapWith(
          Number,
        ),
    })
    .from(payments)
    .innerJoin(cohort, eq(cohort.id, payments.table_session_id))
    .where(eq(payments.store_id, actor.storeId));
  const callSummary = db
    .with(cohort)
    .select({
      staffCalls:
        sql<number>`coalesce(sum(case when ${tableEvents.kind}='staff.called' then 1 else 0 end),0)`.mapWith(
          Number,
        ),
      billCalls:
        sql<number>`coalesce(sum(case when ${tableEvents.kind}='bill.requested' then 1 else 0 end),0)`.mapWith(
          Number,
        ),
    })
    .from(tableEvents)
    .innerJoin(cohort, eq(cohort.id, tableEvents.table_session_id))
    .where(
      and(
        eq(tableEvents.store_id, actor.storeId),
        or(eq(tableEvents.kind, "staff.called"), eq(tableEvents.kind, "bill.requested")),
      ),
    );

  // DrizzleにはJSON配列を行へ展開するbuilderがないため、table-valued関数の部分だけSQLを使う。
  const modifier = input.view === "modifiers";
  const productId = sql<string>`json_extract(line.value,'$.productId')`;
  const optionId = modifier ? sql<string>`json_extract(option.value,'$.id')` : sql<string>`''`;
  const name = modifier
    ? sql<string>`json_extract(option.value,${`$.name.${input.locale}`})`
    : sql<string>`json_extract(line.value,${`$.name.${input.locale}`})`;
  const quantity = modifier
    ? sql<number>`json_extract(line.value,'$.quantity') * json_extract(option.value,'$.quantity')`
    : sql<number>`json_extract(line.value,'$.quantity')`;
  const lines = db.$with("lines").as(
    db
      .with(cohort)
      .select({
        productId: productId.as("product_id"),
        optionId: optionId.as("option_id"),
        sessionId: orders.table_session_id,
        name: sql<
          string | null
        >`first_value(${name}) over (partition by ${productId},${optionId} order by ${orders.created_at} desc,${orders.id} desc,line.key desc)`.as(
          "name",
        ),
        quantity: quantity.mapWith(Number).as("quantity"),
        covered:
          sql<number>`case when json_extract(line.value,'$.planCovered')=1 then ${quantity} else 0 end`
            .mapWith(Number)
            .as("covered"),
      })
      .from(orders)
      .innerJoin(cohort, eq(cohort.id, orders.table_session_id))
      .innerJoin(
        sql`json_each(case when json_type(${orders.snapshot_json},'$.lines')='array' then ${orders.snapshot_json} else '{"lines":[]}' end,'$.lines') as line`,
        sql`true`,
      )
      .innerJoin(
        modifier ? sql`json_each(line.value,'$.options') as option` : sql`(select 1) as option`,
        sql`true`,
      )
      .where(and(eq(orders.store_id, actor.storeId), validOrder)),
  );
  const breakdown = db
    .with(cohort, lines)
    .select({
      productId: lines.productId,
      optionId: lines.optionId,
      name: sql<string | null>`max(${lines.name})`,
      quantity: sum(lines.quantity),
      orderingSessions: countDistinct(lines.sessionId),
      planCoveredQuantity: sum(lines.covered),
    })
    .from(lines)
    .where(
      cursor
        ? sql`(${lines.productId},${lines.optionId}) > (${cursor.productId},${cursor.optionId})`
        : undefined,
    )
    .groupBy(sql`${lines.productId}`, sql`${lines.optionId}`)
    .orderBy(asc(lines.productId), asc(lines.optionId))
    .limit(input.view === "summary" ? 0 : input.limit + 1);
  const [sessions, orderTotals, paymentTotals, calls, items] = await db.batch([
    sessionSummary,
    orderSummary,
    paymentSummary,
    callSummary,
    breakdown,
  ]);
  const session = sessions[0];
  const order = orderTotals[0];
  const payment = paymentTotals[0];
  const call = calls[0];
  ensure(session && order && payment && call, "STATISTICS_UNAVAILABLE", 503);
  const rows = items.slice(0, input.limit).map((row) => ({
    productId: row.productId,
    optionId: modifier ? row.optionId : null,
    name: row.name,
    quantity: Number(row.quantity),
    orderingSessions: row.orderingSessions,
    orderRate: session.sessions ? row.orderingSessions / session.sessions : null,
    planCoveredQuantity: Number(row.planCoveredQuantity),
  }));
  const last = items.at(input.limit - 1);
  return {
    storeId: actor.storeId,
    from: input.from,
    to: input.to,
    timeZone: input.timeZone,
    view: input.view,
    locale: input.locale,
    currency: "JPY",
    asOf,
    generatedAt: now,
    basis: "closed_sessions",
    summary: { ...session, guests: Number(session.guests ?? 0), ...order, ...payment, ...call },
    rows,
    nextCursor:
      items.length > input.limit && last
        ? new TextEncoder()
            .encode(
              JSON.stringify({
                storeId: actor.storeId,
                from: input.from,
                to: input.to,
                timeZone: input.timeZone,
                view: input.view,
                locale: input.locale,
                asOf,
                productId: last.productId,
                optionId: last.optionId,
              }),
            )
            .toBase64()
        : null,
    definitions: {
      cohort: "期間内に閉卓した通常来店。開始を含み終了を含まない。未閉卓・店側デモは対象外。",
      orders: "対象来店の全期間の注文から取消・拒否を除外。数量は注文時snapshotを使用。",
      paidAmount:
        "対象来店のpaymentの符号付き合計。入金発生日の集計ではない。negativePaymentsは負の記録であり外部決済の返金証明ではない。",
      orderRate: "その商品または選択肢を注文した来店数 / 注文しなかった来店を含む全対象来店数。",
      modifiers: "商品数量 × 注文時の選択肢数量。商品IDと選択肢IDで集計。",
      names: "同じIDの最新注文に記録された指定言語の名称。現在のカタログは参照しない。",
      plan: "planSessionsはプランありの来店数。planCoveredQuantityはプラン内数量。planSessionPaidAmountはプラン利用来店の入金合計で、追加注文も含む。会計にはプラン料金を含むが商品へ配賦しない。",
      calls:
        "対象来店に記録されたstaff.calledとbill.requestedを別々に数える。未対応件数や質問傾向ではない。",
    },
    limitations: [
      "国籍・観光目的・原価・外部決済の返金・売切期間は取得していない。",
      "通常来店として投入された合成履歴を実来店と区別する項目はない。環境とデータの出所を確認する。",
      "時刻は入力のUTC offsetで確定する。timeZoneは期間の表示・解釈を示し、指定した境界を変換しない。",
      "ページは商品ID・選択肢ID順。全体の人気順位ではない。継続取得は同じ期間・表示条件とcursorを使う。",
      ...(order.incompleteSnapshots
        ? ["lines配列のない注文は商品・選択肢集計に含められない。incompleteSnapshotsを確認する。"]
        : []),
    ],
  };
}
