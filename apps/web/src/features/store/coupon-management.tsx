import { UserIdentity } from "../../components/user-identity";
import { Select, SelectTrigger, SelectContent, SelectItem } from "../../components/ui/select";
import { Badge } from "../../components/ui/badge";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../../components/page-header";
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
  type CouponRule = NonNullable<typeof query.data>["pages"][number]["rules"][number];
  const [editing, setEditing] = useState<"new" | CouponRule | null>(null);
  const rules = query.data?.pages.flatMap((page) => page.rules) ?? [];
  const current =
    editing && editing !== "new"
      ? (rules.find((rule) => rule.id === editing.id) ?? editing)
      : undefined;
  const canEdit = ["owner", "admin"].includes(store.role);
  return (
    <section className="space-y-6">
      <PageHeader
        title={t("coupon_rules")}
        description={t("coupon_version_note")}
        actions={canEdit && <Button onClick={() => setEditing("new")}>{t("coupon_new")}</Button>}
      />
      <div className="max-w-3xl space-y-6">
        <ErrorNotice
          error={!editing ? query.error : undefined}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
        {editing && (
          <CouponRuleForm
            key={current?.id ?? "new"}
            storeId={store.id}
            initial={
              current
                ? {
                    id: current.id,
                    expectedVersion: current.version,
                    active: current.active,
                    rules: current.rules,
                  }
                : undefined
            }
            onSaved={() => setEditing(null)}
          />
        )}
        <ul className="space-y-4">
          {rules.map((rule) => (
            <li key={rule.id} className="space-y-3">
              <Button
                variant="outline"
                disabled={!canEdit}
                aria-pressed={editing !== "new" && editing?.id === rule.id}
                onClick={() =>
                  setEditing(editing !== "new" && editing?.id === rule.id ? null : rule)
                }
              >
                {rule.rules.title[locale]} · v{rule.version} · {t(`coupon_${rule.rules.trigger}`)}
              </Button>
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
      </div>
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
    defaultValues: {
      ruleId: "",
      membership: null as
        | NonNullable<typeof members.data>["pages"][number]["members"][number]
        | null,
    },
    onSubmit: async ({ value }) => {
      if (!value.membership) return;
      await issue
        .mutateAsync({ ruleId: value.ruleId, membershipId: value.membership.id })
        .catch(() => undefined);
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
      <form.Field name="membership">
        {(field) => {
          const selectedMember = field.state.value;
          const choices = members.data?.pages.flatMap((page) => page.members) ?? [];
          if (selectedMember && !choices.some((person) => person.id === selectedMember.id))
            choices.unshift(selectedMember);
          return (
            <div className="grid gap-2">
              <span id="tablecast-coupon-member-label">{t("coupon_member")}</span>
              <Select
                required
                name="membershipId"
                value={selectedMember?.id ?? null}
                onValueChange={(value) => {
                  field.handleChange(choices.find((person) => person.id === value) ?? null);
                  setKey(crypto.randomUUID());
                }}
              >
                <SelectTrigger aria-labelledby="tablecast-coupon-member-label">
                  {selectedMember ? (
                    <UserIdentity compact user={selectedMember} />
                  ) : (
                    t("common_select")
                  )}
                </SelectTrigger>
                <SelectContent className="max-w-[min(28rem,calc(100vw-2rem))]">
                  {choices.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      <UserIdentity compact user={person} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }}
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
      <ErrorNotice
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
      {query.data?.pages.flatMap((page) =>
        page.coupons.map((coupon) => (
          <article key={coupon.id} className="space-y-3 rounded-xl border p-4">
            <h3>{coupon.rules.title[locale]}</h3>
            <UserIdentity compact user={coupon} />
            <Badge
              variant={
                coupon.state === "available"
                  ? "success"
                  : coupon.state === "requested"
                    ? "warning"
                    : "inactive"
              }
            >
              {t(`coupon_${coupon.state}`)}
            </Badge>
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
