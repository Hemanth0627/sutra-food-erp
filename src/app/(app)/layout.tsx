import { AppShell } from "@/components/app/app-shell";
import { requirePageUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return <AppShell user={{ name: user.name, email: user.email, role: user.role }}>{children}</AppShell>;
}
