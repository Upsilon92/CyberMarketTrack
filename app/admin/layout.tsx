// Admin auth boundary for EVERYTHING under /admin (defense in depth: the proxy
// already redirects anonymous users, we re-check server-side). No settings nav
// here — that lives in the (hub) group, so entity edit forms (companies /
// solutions / tags / events) render without the settings sub-menu.
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/login");
  return <>{children}</>;
}
