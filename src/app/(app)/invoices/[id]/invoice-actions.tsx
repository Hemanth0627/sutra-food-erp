"use client";
import { useState } from "react";
import { Ban, Download, Loader2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/app/field";
import { useApi } from "@/components/app/use-api";

export function DispatchButton({ invoiceId, invoiceNo, size }: { invoiceId: string; invoiceNo: string; size?: "sm" | "default" }) {
  const { call, pending } = useApi();
  const [open, setOpen] = useState(false);
  const [vehicleNo, setVehicleNo] = useState("");
  const [transporter, setTransporter] = useState("");
  return (
    <>
      <Button size={size} variant="brand" onClick={() => setOpen(true)}><Truck /> Dispatch</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dispatch {invoiceNo}</DialogTitle>
            <DialogDescription>Finished-goods stock is reduced once, through a sales-dispatch ledger entry.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Vehicle no." htmlFor="veh"><Input id="veh" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} placeholder="TN 37 AB 1234" /></Field>
            <Field label="Transporter" htmlFor="tr"><Input id="tr" value={transporter} onChange={(e) => setTransporter(e.target.value)} placeholder="Own vehicle" /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="brand"
              disabled={pending}
              onClick={async () => {
                await call<{ dispatch: { dispatchNo: string } }>("/api/dispatch", { invoiceId, vehicleNo: vehicleNo || undefined, transporter: transporter || undefined }, { success: (r) => `Dispatched as ${r.dispatch.dispatchNo}` });
                setOpen(false);
              }}
            >
              {pending && <Loader2 className="animate-spin" />} Confirm dispatch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function InvoiceActions({ invoiceId, invoiceNo, canDispatch, canCancel, dispatched }: { invoiceId: string; invoiceNo: string; canDispatch: boolean; canCancel: boolean; dispatched: boolean }) {
  const { call, pending } = useApi();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [returnStock, setReturnStock] = useState(true);
  return (
    <>
      <Button variant="outline" asChild>
        <a href={`/api/invoices/${invoiceId}/pdf`} target="_blank" rel="noopener"><Download /> PDF</a>
      </Button>
      {canDispatch && <DispatchButton invoiceId={invoiceId} invoiceNo={invoiceNo} />}
      {canCancel && <Button variant="outline" onClick={() => setOpen(true)}><Ban /> Cancel</Button>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel {invoiceNo}</DialogTitle>
            <DialogDescription>The invoice stays on record (never deleted). A credit note reverses the tax and the receivable, and the change is logged.</DialogDescription>
          </DialogHeader>
          <Field label="Reason" htmlFor="reason"><Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          {dispatched && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={returnStock} onChange={(e) => setReturnStock(e.target.checked)} className="size-4 accent-[var(--brand)]" />
              Goods are coming back: post a customer return to finished-goods stock
            </label>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Keep invoice</Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 5 || pending}
              onClick={async () => {
                await call<{ creditNote: { creditNoteNo: string } }>(`/api/invoices/${invoiceId}/cancel`, { reason, returnStock: dispatched && returnStock }, { success: (r) => `Credit note ${r.creditNote.creditNoteNo} posted` });
                setOpen(false);
              }}
            >
              Post credit note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
