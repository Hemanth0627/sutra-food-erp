import { ROLE_PERMISSIONS } from "@/lib/permissions";
import { requirePageUser } from "@/server/auth/session";
import { getFactorySnapshot } from "@/server/queries/factory";
import { PageHeader } from "@/components/app/page-header";
import { FactoryTwin } from "@/components/factory/factory-twin";

export const metadata = { title: "3D Factory" };
export const dynamic = "force-dynamic";

export default async function FactoryPage() {
  const user = await requirePageUser("factory:view");
  const snapshot = await getFactorySnapshot();
  return (
    <>
      <PageHeader
        title="3D Factory"
        description="A live digital twin of the plant. Each department's colour, gauges and stock come from posted ERP records and refresh every 15 seconds. Machines only move while a production run is in progress."
      />
      <FactoryTwin initial={snapshot} mode="live" permissions={ROLE_PERMISSIONS[user.role]} />
    </>
  );
}
