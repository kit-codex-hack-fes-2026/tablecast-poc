import { useMutation } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { authClient, authResult } from "../../lib/auth-client";
import { CurrentPlan, PlanOptions } from "./billing-plan-options";
import { type Billing } from "./billing-query";

export function ContractSection({
  financial,
  organizationId,
  children,
}: {
  children: ReactNode;
  financial: NonNullable<Billing["financial"]>;
  organizationId: string;
}) {
  const free = financial.checkoutRequired;
  const action = useMutation({
    mutationFn: async () => {
      if (!financial.configured || !financial.checkoutPlan) return;
      const returnUrl = `${window.location.origin}/billing/${encodeURIComponent(organizationId)}`;
      const result = !free
        ? await authClient.subscription.billingPortal({
            referenceId: organizationId,
            customerType: "organization",
            returnUrl,
            disableRedirect: true,
          })
        : await authClient.subscription.upgrade({
            plan: financial.checkoutPlan,
            referenceId: organizationId,
            customerType: "organization",
            successUrl: returnUrl,
            cancelUrl: returnUrl,
            returnUrl,
            disableRedirect: true,
          });
      const target = authResult(result);
      if (target.url) window.location.assign(target.url);
    },
  });
  const disabled = !financial.configured || action.isPending;
  return (
    <>
      <CurrentPlan financial={financial} />
      {children}
      <PlanOptions financial={financial} disabled={disabled} onManage={() => action.mutate()}>
        <ErrorNotice error={action.error} onRetry={() => action.mutate()} />
      </PlanOptions>
    </>
  );
}
