import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Use Express Bearer token auth (set by /api/auth/login response body token)
  const headers = await import("next/headers");
  const authHeader = (await headers.headers()).get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    redirect("/login");
  }

  // Fetch user info from Express API
  const res = await fetch(`${process.env.APP_URL || "http://localhost:3000"}/api/me`, {
    headers: { Authorization: authHeader },
    cache: "no-store",
  });

  if (!res.ok) {
    redirect("/login");
  }

  const me = await res.json().catch(() => null);
  const email = me?.email ?? me?.account?.email ?? undefined;

  return (
    <div className="min-h-screen bg-bg lg:flex">
      <Nav email={email} />
      <main className="vanta-app-main">{children}</main>
    </div>
  );
}
