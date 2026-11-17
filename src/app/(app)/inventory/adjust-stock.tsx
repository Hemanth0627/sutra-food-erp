"use client";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/app/field";
import { useApi } from "@/components/app/use-api";

export function AdjustStockButton({ items }: { items: { id: string; name: string; unit: string; onHand: string; avgCost: string }[] }) {
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState("");
  const [type, setType] = useState<"STOCK_ADJUSTMENT" | "DAMAGED_MATERIAL">("STOCK_ADJUSTMENT");
  const [direction, setDirection] = useState<"INCREASE" | "DECREASE">("DECREASE");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reason, setReason] = useState("");
  const { call, pending } = useApi();
  const item = items.find((i) => i.id === itemId);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><SlidersHorizontal /> Stock adjustment</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Authorised stock adjustment</DialogTitle>
            <DialogDescription>Balances are never overwritten. This posts a ledger movement with your name and reason; stock can never go below zero.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Item" htmlFor="adj-item" className="sm:col-span-2" hint={item ? `On hand ${item.onHand} ${item.unit} · avg ₹${item.avgCost}` : undefined}>
              <NativeSelect id="adj-item" value={itemId} onChange={(e) => setItemId(e.target.value)}><option value="">Select item</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</NativeSelect>
            </Field>
            <Field label="Type" htmlFor="adj-type">
              <NativeSelect id="adj-type" value={type} onChange={(e) => { const v = e.target.value as typeof type; setType(v); if (v === "DAMAGED_MATERIAL") setDirection("DECREASE"); }}>
                <option value="STOCK_ADJUSTMENT">Physical count correction</option>
                <option value="DAMAGED_MATERIAL">Damage write-off</option>
              </NativeSelect>
            </Field>
            <Field label="Direction" htmlFor="adj-dir">
              <NativeSelect id="adj-dir" value={direction} disabled={type === "DAMAGED_MATERIAL"} onChange={(e) => setDirection(e.target.value as typeof direction)}>
                <option value="DECREASE">Decrease</option>
                <option value="INCREASE">Increase</option>
              </NativeSelect>
            </Field>
            <Field label={`Quantity${item ? ` (${item.unit})` : ""}`} htmlFor="adj-q"><Input id="adj-q" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>
            {direction === "INCREASE" && <Field label="Unit cost (₹)" htmlFor="adj-c" hint="Defaults to the current average"><Input id="adj-c" inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} /></Field>}
            <Field label="Reason (required)" htmlFor="adj-r" className="sm:col-span-2"><Textarea id="adj-r" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={pending || !itemId || !quantity || reason.trim().length < 5}
              onClick={async () => {
                await call("/api/inventory/adjustments", { itemId, type, direction, quantity, unitCost: direction === "INCREASE" && unitCost ? unitCost : undefined, reason }, { success: "Adjustment posted to the ledger" });
                setOpen(false);
                setQuantity("");
                setReason("");
              }}
            >
              Post adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
