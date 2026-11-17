"use client";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApi } from "@/components/app/use-api";

export function ActivateVersionButton({ versionId, versionNo }: { versionId: string; versionNo: number }) {
  const { call, pending } = useApi();
  return (
    <Button
      variant="brand"
      disabled={pending}
      onClick={() => {
        if (window.confirm(`Activate v${versionNo}? The current active version will be archived; new production runs will use v${versionNo}.`)) {
          void call(`/api/bom/versions/${versionId}/activate`, undefined, { success: `v${versionNo} is now active` });
        }
      }}
    >
      <CheckCircle2 /> Activate v{versionNo}
    </Button>
  );
}
