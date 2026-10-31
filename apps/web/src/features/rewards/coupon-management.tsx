import { resolveLocalized } from "@tablecast/api/localization";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Ticket } from "lucide-react";
import { useRef, useState } from "react";
import { ActionFeedback } from "../../components/action-feedback";
import { ErrorNotice } from "../../components/error-notice";
import { useAppForm } from "../../components/form";
import { PageHeader } from "../../components/page-header";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { Select, SelectContent, SelectItem, SelectTrigger } from "../../components/ui/select";
import { UserIdentity } from "../../components/user-identity";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { useStore } from "../store/store-context";
import { couponRulesOptions, rewardMembersOptions } from "./coupon-query";
import { CouponRuleForm } from "./coupon-rule-form";
import { IssuedCoupons } from "./issued-coupons";

export function CouponManagement() {
  const store = useStore();
  const { t, locale } = useI18n();
  const query = useInfiniteQuery(couponRulesOptions(store.id));
  type CouponRule = NonNullable<typeof query.data>["pages"][number]["rules"][number];
  const editOrigin = useRef<HTMLButtonElement | null>(null);
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
        icon={<Ticket />}
        description={t("coupon_version_note")}
        actions={
          canEdit && (
            <Button
              disabled={editing !== null}
              onClick={(event) => {
                editOrigin.current = event.currentTarget;
                setEditing("new");
              }}
            >
              <Plus />
              {t("coupon_new")}
            </Button>
          )
        }
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
            onCancel={() => {
              setEditing(null);
              requestAnimationFrame(() => editOrigin.current?.focus());
            }}
          />
        )}
        <ul className="space-y-4">
          {rules.map((rule) => (
            <li key={rule.id} className="space-y-3">
              <Button
                variant="outline"
                disabled={!canEdit || editing !== null}
                aria-pressed={editing !== "new" && editing?.id === rule.id}
                onClick={(event) => {
                  editOrigin.current = event.currentTarget;
                  setEditing(rule);
                }}
              >
                {resolveLocalized(rule.rules.title, locale)} · v{rule.version} ·{" "}
                {t(`coupon_${rule.rules.trigger}`)}
              </Button>
            </li>
          ))}
        </ul>
        {query.hasNextPage && (
          <Button disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
            {t("customer_more")}
          </Button>
        )}
        {canEdit && rules.some((rule) => rule.active && rule.rules.trigger === "manual") && (
          <ManualCouponIssue
            storeId={store.id}
            rules={rules.flatMap((rule) =>
              rule.active && rule.rules.trigger === "manual"
                ? [{ id: rule.id, title: resolveLocalized(rule.rules.title, locale) }]
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
  rules: { id: string; title: string }[];
  storeId: string;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const members = useInfiniteQuery(rewardMembersOptions(storeId, search));
  const [key, setKey] = useState(() => crypto.randomUUID());
  const issue = useMutation({
    mutationFn: (input: { membershipId: string; ruleId: string }) =>
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
    <form.AppForm>
      <form.Form className="space-y-4 rounded-xl border p-5">
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
        <ErrorNotice query={members} />
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

        <form.Subscribe selector={(state) => state.values}>
          {(value) => (
            <form.SubmitButton disabled={!value.ruleId || !value.membership}>
              {t("coupon_issue")}
            </form.SubmitButton>
          )}
        </form.Subscribe>

        <ActionFeedback mutation={issue} successMessage={t("account_saved")} />
      </form.Form>
    </form.AppForm>
  );
}
