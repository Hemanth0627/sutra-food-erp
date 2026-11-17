"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useApi } from "@/components/app/use-api";

export function CancelPurchaseOrder({ id, poNo }: { id: string; poNo: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { call, pending } = useApi();
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><X /> Cancel PO</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel {poNo}</DialogTitle>
            <DialogDescription>Goods already received stay in stock. Nothing more can be received against this PO.</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" aria-label="Reason for cancelling" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Back</Button>
            <Button variant="destructive" disabled={pending || reason.trim().length < 3} onClick={async () => { await call(`/api/purchase-orders/${id}/cancel`, { reason }, { success: `${poNo} cancelled` }); setOpen(false); }}>Cancel PO</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
