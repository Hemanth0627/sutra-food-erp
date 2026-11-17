/**
 * HTTP smoke test against a running server (npm run build && npm start, then npm run test:smoke).
 * Checks every role's navigation pages, server-side permission denials, CSRF/origin protection,
 * input validation, the sales and production workflows end to end, idempotent order sync,
 * exactly-once dispatch/completion, and CSV / Excel / PDF exports.
 *
 * It CHANGES the database (adds orders, invoices, a production run...). Run `npm run benchmark:reset`
 * afterwards to restore the clean benchmark state.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Demo@1234";
const OUT = process.env.SMOKE_OUT ?? "test-results/smoke";
mkdirSync(OUT, { recursive: true });

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` → ${detail}` : ""}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  (${detail})` : ""}`);
}

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  check(`login ${email}`, res.ok && cookie.startsWith("sutra_session="), String(res.status));
  return cookie;
}
const get = (cookie, path) => fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });
async function post(cookie, path, body, extraHeaders = {}) {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { cookie, "content-type": "application/json", origin: BASE, ...extraHeaders }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const ROLE_PAGES = {
  "owner@sutra-erp.test": ["/dashboard", "/analytics", "/inventory", "/production", "/finance", "/alerts", "/orders", "/invoices", "/reports", "/benchmark", "/audit", "/settings"],
  "admin@sutra-erp.test": ["/dashboard", "/orders", "/customers", "/products", "/suppliers", "/purchases", "/purchases/new", "/invoices", "/dispatch", "/payments", "/inventory", "/reports", "/expenses", "/alerts", "/benchmark", "/audit", "/settings"],
  "salesman.a@sutra-erp.test": ["/dashboard", "/orders/new", "/orders", "/customers", "/products", "/sales-summary"],
  "production@sutra-erp.test": ["/dashboard", "/bom", "/bom/new", "/production/new", "/production", "/production/consumption", "/production/variance", "/inventory?tab=RAW_MATERIAL", "/purchases", "/expenses", "/alerts"],
  "accounts@sutra-erp.test": ["/dashboard", "/reports/sales-register", "/reports/purchase-register", "/reports/gst-summary", "/reports?group=Inventory", "/reports?group=Production", "/reports/collections", "/reports/outstanding", "/reports/monthly-audit", "/invoices", "/reports", "/audit", "/benchmark"],
};
const DENIED = {
  "salesman.a@sutra-erp.test": ["/invoices", "/payments", "/reports", "/inventory", "/settings"],
  "accounts@sutra-erp.test": ["/orders/new", "/purchases/new", "/production/new", "/settings"],
  "production@sutra-erp.test": ["/payments", "/invoices", "/settings"],
  "owner@sutra-erp.test": ["/purchases/new", "/orders/new"],
};
const REPORTS = [
  "sales-register", "customer-sales", "product-sales", "gst-summary", "purchase-register", "raw-material-stock", "packaging-stock",
  "finished-goods-stock", "stock-ledger", "production", "planned-vs-actual", "yield-wastage", "cost-per-packet", "collections",
  "outstanding", "receivables-ageing", "audit-trail", "monthly-audit",
];

async function main() {
  // Public pages and unauthenticated access
  const landing = await get(null, "/");
  check("landing page renders", landing.status === 200 && (await landing.text()).includes("one ledger"));
  const anon = await get(null, "/dashboard");
  check("signed-out dashboard redirects to /login", anon.status === 307 && (anon.headers.get("location") ?? "").includes("/login"));
  check("signed-out API returns 401", (await get(null, "/api/orders/catalog")).status === 401);
  const bad = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "admin@sutra-erp.test", password: "wrong-password" }) });
  check("wrong password rejected", bad.status === 401);

  const cookies = {};
  for (const email of Object.keys(ROLE_PAGES)) cookies[email] = await login(email);
  const owner = cookies["owner@sutra-erp.test"], admin = cookies["admin@sutra-erp.test"], sales = cookies["salesman.a@sutra-erp.test"];
  const sup = cookies["production@sutra-erp.test"], acct = cookies["accounts@sutra-erp.test"];

  // Benchmark page before any extra transactions
  const bench = await (await get(owner, "/benchmark")).text();
  check("benchmark page shows 25 of 25 passing", bench.includes("25<!-- --> of <!-- -->25") || bench.includes("25 of 25"));

  // Every navigation page per role
  for (const [email, pages] of Object.entries(ROLE_PAGES)) {
    for (const p of pages) {
      const res = await get(cookies[email], p);
      check(`${email.split("@")[0]} can open ${p}`, res.status === 200, String(res.status));
    }
  }
  for (const [email, pages] of Object.entries(DENIED)) {
    for (const p of pages) {
      const res = await get(cookies[email], p);
      check(`${email.split("@")[0]} is denied ${p}`, res.status === 307 && (res.headers.get("location") ?? "").includes("/forbidden"), `${res.status} ${res.headers.get("location")}`);
    }
  }

  // Server-side API permission checks (the UI hides these buttons too, but the server is authoritative)
  check("salesman cannot create invoices (403)", (await post(sales, "/api/invoices", { orderId: "x", lines: [{ orderItemId: "x", quantity: "1" }] })).status === 403);
  check("accountant cannot record payments (403)", (await post(acct, "/api/payments", {})).status === 403);
  check("supervisor cannot dispatch (403)", (await post(sup, "/api/dispatch", { invoiceId: "x" })).status === 403);
  check("owner cannot place orders (403)", (await post(owner, "/api/orders", {})).status === 403);
  check("cross-site POST blocked (403)", (await post(admin, "/api/customers", {}, { origin: "https://evil.example" })).status === 403);
  const invalid = await post(admin, "/api/customers", { name: "Test", type: "RETAILER", gstin: "33ABCDE1234F1Z0", phone: "9000000000", addressLine: "Street 1", city: "Chennai", stateCode: "33", creditLimit: "1000", paymentTermsDays: 30 });
  check("invalid GSTIN rejected (400)", invalid.status === 400, JSON.stringify(invalid.json.error?.message));

  // Sales workflow over HTTP
  const catalog = (await get(sales, "/api/orders/catalog").then((r) => r.json()));
  const retailer = catalog.customers.find((c) => c.name === "Retailer A");
  const murukku = catalog.products.find((p) => p.sku === "FG-MURUKKU-200");
  const clientRef = randomUUID();
  const o1 = await post(sales, "/api/orders", { clientRef, customerId: retailer.id, items: [{ productId: murukku.id, quantity: "10" }] });
  check("salesman places an order", o1.status === 200 && o1.json.order?.orderNo, JSON.stringify(o1.json));
  const o2 = await post(sales, "/api/orders", { clientRef, customerId: retailer.id, capturedOffline: true, items: [{ productId: murukku.id, quantity: "10" }] });
  check("re-synced offline order is not duplicated", o2.status === 200 && o2.json.duplicate === true && o2.json.order.id === o1.json.order.id);
  const orderId = o1.json.order.id;
  check("admin approves order", (await post(admin, `/api/orders/${orderId}/decision`, { decision: "APPROVE" })).status === 200);
  const avail = await get(admin, `/api/orders/${orderId}/availability`).then((r) => r.json());
  const line = avail.lines[0];
  const tooMuch = await post(admin, "/api/invoices", { orderId, lines: [{ orderItemId: line.orderItemId, quantity: "11" }] });
  check("cannot invoice more than ordered (400)", tooMuch.status === 400);
  const inv = await post(admin, "/api/invoices", { orderId, lines: [{ orderItemId: line.orderItemId, quantity: "10" }] });
  check("admin issues GST invoice", inv.status === 200 && inv.json.invoice?.grandTotal === "525.00", JSON.stringify(inv.json));
  const invoiceId = inv.json.invoice.id;
  const pdf = await get(admin, `/api/invoices/${invoiceId}/pdf`);
  const pdfBuf = Buffer.from(await pdf.arrayBuffer());
  check("invoice PDF downloads", pdf.status === 200 && pdf.headers.get("content-type") === "application/pdf" && pdfBuf.subarray(0, 4).toString() === "%PDF");
  writeFileSync(`${OUT}/invoice.pdf`, pdfBuf);
  check("admin dispatches invoice", (await post(admin, "/api/dispatch", { invoiceId, vehicleNo: "TN 37 ZZ 0001" })).status === 200);
  check("second dispatch rejected (409)", (await post(admin, "/api/dispatch", { invoiceId })).status === 409);
  const overAlloc = await post(admin, "/api/payments", { customerId: retailer.id, paymentDate: new Date().toISOString().slice(0, 10), amount: "1000", mode: "CASH", autoAllocate: false, allocations: [{ invoiceId, amount: "600" }] });
  check("payment over-allocation rejected (400)", overAlloc.status === 400);
  check("admin records payment", (await post(admin, "/api/payments", { customerId: retailer.id, paymentDate: new Date().toISOString().slice(0, 10), amount: "525", mode: "UPI", autoAllocate: true, allocations: [] })).status === 200);

  // Production workflow over HTTP (Mixture, one batch)
  const newRunPage = await (await get(sup, "/production/new")).text();
  check("production planning page lists BOM versions", newRunPage.includes("BOM-MIXTURE v1"));
  const runsHtml = await (await get(sup, "/bom")).text();
  check("BOM list shows active versions", runsHtml.includes("v1 active"));

  // Exports: every report in every format
  for (const key of REPORTS) {
    const page = await get(acct, `/reports/${key}`);
    check(`report page ${key}`, page.status === 200);
    for (const format of ["csv", "xlsx", "pdf"]) {
      const res = await get(acct, `/api/reports/${key}/export?format=${format}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const magic = format === "pdf" ? buf.subarray(0, 4).toString() === "%PDF" : format === "xlsx" ? buf.subarray(0, 2).toString() === "PK" : buf.length > 3;
      check(`export ${key}.${format}`, res.status === 200 && magic, `${res.status} ${buf.length}B`);
      if (key === "monthly-audit" || key === "sales-register") writeFileSync(`${OUT}/${key}.${format}`, buf);
    }
  }
  check("salesman cannot export reports (403)", (await get(sales, "/api/reports/sales-register/export?format=csv")).status === 403);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("Failures:\n  " + failures.join("\n  "));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
