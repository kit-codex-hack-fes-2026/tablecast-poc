import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import { previewCouponAudience } from "../customer-coupons/audience";
import {
  couponAudienceSchema,
  couponDefinitionSchema,
  couponPageSchema,
  issueCouponSchema,
  revokeCouponSchema,
  rewardMembersSchema,
} from "../customer-coupons/model";
import { listCouponRules, listIssuedCoupons, listRewardMembers } from "../customer-coupons/queries";
import { issueCustomerCoupon } from "../customer-coupons/use-cases/issue";
import { revokeCustomerCoupon, saveCouponRule } from "../customer-coupons/use-cases/rules";
import { pointPolicySchema } from "../customer-points/model";
import { getPointPolicy } from "../customer-points/queries";
import { setPointPolicy } from "../customer-points/use-cases/policy";
import { result } from "./result";
export function registerRewardsTools(server: McpServer, services: ApiServices, actor: Actor) {
  server.registerTool(
    "get_point_policy",
    {
      description: "店舗のポイント付与設定を取得する。",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => result(await getPointPolicy(services, actor)),
  );

  server.registerTool(
    "set_point_policy",
    {
      description: "将来の来店に適用するポイント設定を変更する。",
      inputSchema: pointPolicySchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (input) => result(await setPointPolicy(services, actor, input)),
  );

  server.registerTool(
    "list_coupon_rules",
    {
      description: "店舗のクーポン発行ルールをページ取得する。",
      inputSchema: couponPageSchema.shape,
      annotations: { readOnlyHint: true },
    },
    async (input) => result(await listCouponRules(services, actor, input)),
  );

  server.registerTool(
    "save_coupon_rule",
    {
      description:
        "画像と日英条件を持つクーポン発行ルールを作成・更新する。conditions.allは全条件、conditions.anyは一つ以上を要求する。来店数・購入額・入会日時・直近確認日時を組み合わせ、先にpreview_coupon_audienceで対象件数を確認する。発行済み券は条件と券面を版固定し変更しない。",
      inputSchema: couponDefinitionSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (input) => result(await saveCouponRule(services, actor, input)),
  );

  server.registerTool(
    "preview_coupon_audience",
    {
      description:
        "保存前の発券条件で現在の有効会員を集計する。eligibleは新規発行対象、alreadyIssuedは同じ自動ルールの既発行、notMatchingは契機・条件・残高・期間の不一致。入会特典はルール作成後に入会した会員だけ。未来の来店や入会で件数は変わる。SQLや個人記憶は扱わず、この操作では発行しない。",
      inputSchema: couponAudienceSchema.shape,
      annotations: { readOnlyHint: true },
    },
    async (input) => result(await previewCouponAudience(services, actor, input)),
  );

  server.registerTool(
    "list_reward_members",
    {
      description: "特典の発行先を選ぶため店舗会員のIDと表示名を検索する。個人記憶は含まない。",
      inputSchema: rewardMembersSchema.shape,
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const page = await listRewardMembers(services, actor, input);
      return result({
        members: page.members.map(({ id, name }) => ({ id, name })),
        nextCursor: page.nextCursor,
      });
    },
  );

  server.registerTool(
    "list_issued_coupons",
    {
      description: "店舗が発行した券と状態をページ取得する。",
      inputSchema: couponPageSchema.shape,
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const page = await listIssuedCoupons(services, actor, input);
      return result({
        coupons: page.coupons.map(({ id, name, state, issuedAt, rules }) => ({
          id,
          name,
          state,
          issuedAt,
          rules,
        })),
        nextCursor: page.nextCursor,
      });
    },
  );

  server.registerTool(
    "issue_coupon",
    {
      description: "手動発行ルールから指定会員へ券を発行する。同じidempotencyKeyで再送する。",
      inputSchema: issueCouponSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (input) => result(await issueCustomerCoupon(services, actor, input)),
  );

  server.registerTool(
    "revoke_coupon",
    {
      description: "未使用券を理由付きで取り消す。ポイントの返却は別途訂正が必要。",
      inputSchema: revokeCouponSchema.extend({ couponId: z.string().min(1) }).shape,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async (input) =>
      result(await revokeCustomerCoupon(services, actor, input.couponId, input.reason)),
  );
}
