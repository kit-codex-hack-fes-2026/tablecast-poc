import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import type { DemoDisplay } from "./demo-session";
import { parseResponse, rpc } from "../../lib/api";
import { DemoPending } from "./demo-pending";
import { demoOptions } from "./demo-query";
import { DemoSession } from "./demo-session";

export function DemoPage({
  storeId,
  demoId,
  device,
  portrait,
}: DemoDisplay & { demoId?: string; storeId: string }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const started = useRef(false);
  const create = useMutation({
    mutationFn: () =>
      parseResponse(rpc.api.admin.stores[":storeId"].demo.$post({ param: { storeId } })),
    onSuccess: async (demo) => {
      client.setQueryData(demoOptions(storeId, demo.id).queryKey, demo);
      await navigate({
        to: "/admin/stores/$storeId/demo",
        params: { storeId },
        search: { demoId: demo.id, device, portrait },
        replace: true,
      });
    },
  });
  const { mutate } = create;
  useEffect(() => {
    if (!demoId && !started.current) {
      started.current = true;
      mutate();
    }
  }, [demoId, mutate]);
  if (demoId)
    return <DemoSession storeId={storeId} demoId={demoId} device={device} portrait={portrait} />;
  return (
    <DemoPending
      device={device}
      portrait={portrait}
      error={create.error}
      onRetry={() => create.mutate()}
    />
  );
}
