-- Database-level integrity guards that back up the application rules.

-- Stock can never go negative (the app checks first and returns a friendly error; this is the backstop).
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_quantity_non_negative" CHECK ("quantity" >= 0);
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_quantity_non_zero" CHECK ("quantity" <> 0);
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_balance_after_non_negative" CHECK ("balanceAfter" >= 0);

-- Sales and money sanity.
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_invoiced_within_ordered" CHECK ("invoicedQty" >= 0 AND "invoicedQty" <= "quantity");
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_quantity_positive" CHECK ("quantity" > 0 AND "stockQty" > 0);
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_returned_within_received" CHECK ("returnedQty" >= 0 AND "returnedQty" <= "stockQty");
ALTER TABLE "ProductionMaterial" ADD CONSTRAINT "ProductionMaterial_damaged_non_negative" CHECK ("damagedQty" >= 0);
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_amount_positive" CHECK ("amount" > 0);

-- The stock ledger is append-only.
CREATE OR REPLACE FUNCTION erp_forbid_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'InventoryTransaction rows are append-only (attempted %)', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InventoryTransaction_append_only"
  BEFORE UPDATE OR DELETE ON "InventoryTransaction"
  FOR EACH ROW EXECUTE FUNCTION erp_forbid_ledger_mutation();

-- Posted invoices are never deleted and never silently edited: only status/cancelledAt may change
-- (cancellation is recorded through a credit note).
CREATE OR REPLACE FUNCTION erp_guard_invoice() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Invoices cannot be deleted; cancel them with a credit note'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF (NEW."invoiceNo", NEW."customerId", NEW."invoiceDate", NEW."taxableTotal", NEW."cgstTotal", NEW."sgstTotal",
      NEW."igstTotal", NEW."taxTotal", NEW."roundOff", NEW."grandTotal", NEW."supplyType", NEW."placeOfSupplyCode",
      NEW."customerGstin", NEW."sellerGstin")
     IS DISTINCT FROM
     (OLD."invoiceNo", OLD."customerId", OLD."invoiceDate", OLD."taxableTotal", OLD."cgstTotal", OLD."sgstTotal",
      OLD."igstTotal", OLD."taxTotal", OLD."roundOff", OLD."grandTotal", OLD."supplyType", OLD."placeOfSupplyCode",
      OLD."customerGstin", OLD."sellerGstin") THEN
    RAISE EXCEPTION 'Posted invoice % cannot be edited', OLD."invoiceNo"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD."status" = 'CANCELLED' AND NEW."status" <> 'CANCELLED' THEN
    RAISE EXCEPTION 'A cancelled invoice cannot be reinstated'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Invoice_immutable"
  BEFORE UPDATE OR DELETE ON "Invoice"
  FOR EACH ROW EXECUTE FUNCTION erp_guard_invoice();

CREATE OR REPLACE FUNCTION erp_forbid_invoice_item_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Invoice lines cannot be modified after posting'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InvoiceItem_immutable"
  BEFORE UPDATE OR DELETE ON "InvoiceItem"
  FOR EACH ROW EXECUTE FUNCTION erp_forbid_invoice_item_mutation();
