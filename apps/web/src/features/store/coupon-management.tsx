import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAppForm } from "../../components/form";
import { ActionFeedback } from "../../components/action-feedback";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { NativeSelect } from "../../components/ui/native-select";
import { Input } from "../../components/ui/input";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { couponRulesOptions, issuedCouponsOptions, rewardMembersOptions } from "./coupon-query";
import { CouponRuleForm } from "./coupon-rule-form";
import { useStore } from "./store-shell";
export function CouponManagement() {
  const store = useStore();
  const { t, locale } = useI18n();
  const query = useInfiniteQuery(couponRulesOptions(store.id));
  const [editing, setEditing] = useState<string | null>(null);
  const rules = query.data?.pages.flatMap((page) => page.rules) ?? [];
  const canEdit = ["owner", "admin"].includes(store.role);
  return (
    <section className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">{t("coupon_rules")}</h1>
      <p>{t("coupon_version_note")}</p>
      <ErrorNotice error={query.error} onRetry={() => void query.refetch()} />
      {canEdit && <Button onClick={() => setEditing("new")}>{t("coupon_new")}</Button>}
      {editing === "new" && <CouponRuleForm storeId={store.id} onSaved={() => setEditing(null)} />}
      <ul className="space-y-4">
        {rules.map((rule) => (
          <li key={rule.id} className="space-y-3">
            <Button
              variant="outline"
              disabled={!canEdit}
              onClick={() => setEditing(editing === rule.id ? null : rule.id)}
            >
              {rule.rules.title[locale]} · v{rule.version} · {t(`coupon_${rule.rules.trigger}`)}
            </Button>
            {editing === rule.id && (
              <CouponRuleForm
                key={rule.version}
                storeId={store.id}
                initial={{
                  id: rule.id,
                  expectedVersion: rule.version,
                  active: rule.active,
                  rules: rule.rules,
                }}
                onSaved={() => setEditing(null)}
              />
            )}
          </li>
        ))}
      </ul>
      {query.hasNextPage && (
        <Button disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          {t("customer_more")}
        </Button>
      )}
      {canEdit && (
        <ManualCouponIssue
          storeId={store.id}
          rules={rules.flatMap((rule) =>
            rule.active && rule.rules.trigger === "manual"
              ? [{ id: rule.id, title: rule.rules.title[locale] }]
              : [],
          )}
        />
      )}
      <IssuedCoupons storeId={store.id} canEdit={canEdit} />
    </section>
  );
}
function ManualCouponIssue({
  storeId,
  rules,
}: {
  storeId: string;
  rules: { id: string; title: string }[];
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const members = useInfiniteQuery(rewardMembersOptions(storeId, search));
  const [key, setKey] = useState(() => crypto.randomUUID());
  const issue = useMutation({
    mutationFn: (input: { ruleId: string; membershipId: string }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].coupons.issue.$post({
          param: { storeId },
          json: { ...input, idempotencyKey: key },
        }),
      ),
    onSuccess: async () => {
      setKey(crypto.randomUUID());
      await client.invalidateQueries({ queryKey: ["tablecast-coupon-issued", storeId] });
    },
  });
  const form = useAppForm({
    defaultValues: { ruleId: "", membershipId: "" },
    onSubmit: async ({ value }) => {
      await issue.mutateAsync(value).catch(() => undefined);
    },
  });
  return (
    <form
      className="space-y-4 rounded-xl border p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <h2 className="text-xl font-semibold">{t("coupon_manual")}</h2>
      <form.Field name="ruleId">
        {(field) => (
          <label className="grid gap-2">
            {t("coupon_select_rule")}
            <NativeSelect
              required
              value={field.state.value}
              onChange={(e) => {
                field.handleChange(e.target.value);
                setKey(crypto.randomUUID());
              }}
            >
              <option value="">—</option>
              {rules.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.title}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
      </form.Field>
      <label className="grid gap-2">
        {t("coupon_search")}
        <Input value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      <ErrorNotice error={members.error} onRetry={() => void members.refetch()} />
      <form.Field name="membershipId">
        {(field) => (
          <label className="grid gap-2">
            {t("coupon_member")}
            <NativeSelect
              required
              value={field.state.value}
              onChange={(e) => {
                field.handleChange(e.target.value);
                setKey(crypto.randomUUID());
              }}
            >
              <option value="">—</option>
              {members.data?.pages.flatMap((page) =>
                page.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} · {member.id.slice(-6)}
                  </option>
                )),
              )}
            </NativeSelect>
          </label>
        )}
      </form.Field>
      {members.hasNextPage && (
        <Button
          type="button"
          disabled={members.isFetchingNextPage}
          onClick={() => void members.fetchNextPage()}
        >
          {t("customer_more")}
        </Button>
      )}
      <form.AppForm>
        <form.SubmitButton>{t("coupon_issue")}</form.SubmitButton>
      </form.AppForm>
      <ActionFeedback
        pending={issue.isPending}
        error={issue.error}
        success={issue.isSuccess}
        successMessage={t("account_saved")}
      />
    </form>
  );
}
function IssuedCoupons({ storeId, canEdit }: { storeId: string; canEdit: boolean }) {
  const { t, locale } = useI18n();
  const query = useInfiniteQuery(issuedCouponsOptions(storeId));
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">{t("coupon_issued")}</h2>
      <p>{t("coupon_revoke_note")}</p>
      <ErrorNotice error={query.error} onRetry={() => void query.refetch()} />
      {query.data?.pages.flatMap((page) =>
        page.coupons.map((coupon) => (
          <article key={coupon.id} className="space-y-3 rounded-xl border p-4">
            <h3>
              {coupon.name} · {coupon.rules.title[locale]}
            </h3>
            <p>{t(`coupon_${coupon.state}`)}</p>
            {canEdit && (coupon.state === "available" || coupon.state === "requested") && (
              <RevokeCoupon storeId={storeId} couponId={coupon.id} />
            )}
          </article>
        )),
      )}
      {query.hasNextPage && (
        <Button disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          {t("customer_more")}
        </Button>
      )}
    </section>
  );
}
function RevokeCoupon({ storeId, couponId }: { storeId: string; couponId: string }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const revoke = useMutation({
    mutationFn: (reason: string) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].coupons[":couponId"].revoke.$post({
          param: { storeId, couponId },
          json: { reason },
        }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ["tablecast-coupon-issued", storeId] }),
  });
  const form = useAppForm({
    defaultValues: { reason: "" },
    onSubmit: async ({ value }) => {
      await revoke.mutateAsync(value.reason).catch(() => undefined);
    },
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="reason">
        {(field) => <field.TextField label={t("coupon_reason")} required />}
      </form.AppField>
      <form.AppForm>
        <form.SubmitButton>{t("coupon_revoke")}</form.SubmitButton>
      </form.AppForm>
      <ActionFeedback
        pending={revoke.isPending}
        error={revoke.error}
        success={false}
        successMessage={t("account_saved")}
      />
    </form>
  );
}
