"use client";
import { useState } from "react";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/app/field";
import { useApi } from "@/components/app/use-api";

export function ReturnButton({ purchaseId, purchaseItemId, itemName, max, unit }: { purchaseId: string; purchaseItemId: string; itemName: string; max: string; unit: string }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const { call, pending } = useApi();
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Undo2 /> Return</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return {itemName} to supplier</DialogTitle>
            <DialogDescription>Posts a supplier-return movement valued at the current weighted-average cost. Up to {max} {unit} can be returned.</DialogDescription>
          </DialogHeader>
          <Field label={`Quantity (${unit})`} htmlFor="rq"><Input id="rq" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          <Field label="Reason" htmlFor="rr"><Textarea id="rr" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending || !qty || reason.trim().length < 3} onClick={async () => { await call(`/api/purchases/${purchaseId}/returns`, { purchaseItemId, quantity: qty, reason }, { success: "Return posted" }); setOpen(false); }}>Post return</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
