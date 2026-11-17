import { CheckCircle2, XCircle } from "lucide-react";
import { requirePageUser } from "@/server/auth/session";
import { collectBenchmarkChecks, summarize } from "@/server/benchmark";
import { prisma } from "@/server/db";
import { Alert } from "@/components/ui/misc";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";

export const metadata = { title: "Benchmark check" };

export default async function BenchmarkPage() {
  await requirePageUser(["reports:view", "audit:view"]);
  const { ready, checks } = await collectBenchmarkChecks(prisma);
  const s = summarize(checks);
  return (
    <>
      <PageHeader title="Mandatory benchmark check" description="Expected results from the assignment (sections 6.3–6.4) compared with values read back from the posted records right now." />
      {!ready ? (
        <Alert tone="warning"><XCircle /><div>Benchmark documents were not found. Run <code>npm run benchmark:reset</code> to rebuild the database and replay the scenario.</div></Alert>
      ) : (
        <Alert tone={s.allPass ? "success" : "danger"}>
          {s.allPass ? <CheckCircle2 /> : <XCircle />}
          <div><span className="font-medium">{s.passed} of {s.total} checks pass.</span> Stock checks read the ledger rows posted by the benchmark documents; receivable and shortage checks use the current state, so extra demo transactions can change them. <code>npm run benchmark:reset</code> restores the scenario.</div>
        </Alert>
      )}
      {ready && (
        <Card className="mt-4">
          <CardContent className="pt-4">
            <Table>
              <THead><TR><TH>Area</TH><TH>Check</TH><TH className="text-right">Expected</TH><TH className="text-right">Actual (from DB)</TH><TH>Result</TH><TH className="hidden md:table-cell">Source</TH></TR></THead>
              <TBody>
                {checks.map((c) => (
                  <TR key={c.check}>
                    <TD className="text-xs text-muted-foreground">{c.group}</TD>
                    <TD className="font-medium">{c.check}</TD>
                    <TD className="tabular text-right">{c.expected}</TD>
                    <TD className="tabular text-right">{c.actual}</TD>
                    <TD>{c.pass ? <span className="inline-flex items-center gap-1 text-xs font-medium text-success"><CheckCircle2 className="size-4" /> Pass</span> : <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive"><XCircle className="size-4" /> Fail</span>}</TD>
                    <TD className="hidden text-xs text-muted-foreground md:table-cell">{c.source}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
