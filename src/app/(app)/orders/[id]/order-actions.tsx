"use client";
import { useState } from "react";
import { Check, FileText, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useApi } from "@/components/app/use-api";
import { useRouter } from "next/navigation";

interface Line {
  orderItemId: string;
  productName: string;
  remaining: string;
  available: string;
  canInvoiceNow: string;
}

export function OrderActions({ orderId, status, canApprove, canInvoice, canCancelOwn, lines }: { orderId: string; status: string; canApprove: boolean; canInvoice: boolean; canCancelOwn: boolean; lines: Line[] }) {
  const { call, pending } = useApi();
  const router = useRouter();
  const [reject, setReject] = useState(false);
  const [reason, setReason] = useState("");
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>({});

  const openInvoice = () => {
    setQty(Object.fromEntries(lines.map((l) => [l.orderItemId, l.canInvoiceNow])));
    setInvoiceOpen(true);
  };

  return (
    <>
      {canApprove && status === "PENDING" && (
        <>
          <Button variant="outline" onClick={() => setReject(true)}><X /> Reject</Button>
          <Button onClick={() => call(`/api/orders/${orderId}/decision`, { decision: "APPROVE" }, { success: "Order approved" })} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Check />} Approve
          </Button>
        </>
      )}
      {canApprove && status === "APPROVED" && <Button variant="outline" onClick={() => setReject(true)}><X /> Reject</Button>}
      {canInvoice && <Button variant="brand" onClick={openInvoice}><FileText /> Create GST invoice</Button>}
      {canCancelOwn && <Button variant="outline" onClick={() => call(`/api/orders/${orderId}/decision`, { decision: "CANCEL", reason: "Cancelled by salesman" }, { success: "Order cancelled" })} disabled={pending}>Cancel order</Button>}

      <Dialog open={reject} onOpenChange={setReject}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject order</DialogTitle>
            <DialogDescription>The salesman will see this reason on the order.</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" aria-label="Reason for rejection" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReject(false)}>Back</Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 3 || pending}
              onClick={async () => {
                await call(`/api/orders/${orderId}/decision`, { decision: "REJECT", reason }, { success: "Order rejected" });
                setReject(false);
              }}
            >
              Reject order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Create GST invoice</DialogTitle>
            <DialogDescription>Quantities default to what is in stock. Anything you cannot invoice now stays open on the order.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {lines.map((l) => (
              <div key={l.orderItemId} className="grid grid-cols-[1fr_120px] items-center gap-3 rounded-lg border p-3">
                <div>
                  <div className="text-sm font-medium">{l.productName}</div>
                  <div className="text-xs text-muted-foreground">Remaining {l.remaining} · available {l.available}</div>
                </div>
                <Input inputMode="numeric" value={qty[l.orderItemId] ?? ""} onChange={(e) => setQty((q) => ({ ...q, [l.orderItemId]: e.target.value.replace(/\D/g, "") }))} aria-label={`Quantity to invoice for ${l.productName}`} className="tabular text-right" />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceOpen(false)}>Cancel</Button>
            <Button
              variant="brand"
              disabled={pending || !Object.values(qty).some((v) => Number(v) > 0)}
              onClick={async () => {
                const r = await call<{ invoice: { id: string; invoiceNo: string } }>(
                  "/api/invoices",
                  { orderId, lines: Object.entries(qty).filter(([, v]) => Number(v) > 0).map(([orderItemId, quantity]) => ({ orderItemId, quantity })) },
                  { success: (r) => `Invoice ${r.invoice.invoiceNo} issued` },
                );
                setInvoiceOpen(false);
                router.push(`/invoices/${r.invoice.id}`);
              }}
            >
              {pending && <Loader2 className="animate-spin" />} Issue invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
