"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Compass, LogOut, Search, Target, Trophy, TrendingUp, UserRound } from "lucide-react";
import { ThemeSelector } from "@/components/theme-selector";
import { cn } from "@/lib/utils";

const DESKTOP_NAV_ITEMS = [
  { href: "/dashboard", label: "Investing", icon: TrendingUp },
  { href: "/market", label: "Discover", icon: Compass },
  { href: "/predictions", label: "Predictions", icon: Target },
  { href: "/competitions", label: "Compete", icon: Trophy },
  { href: "/settings", label: "Account", icon: UserRound },
];

const MOBILE_NAV_ITEMS = [
  { href: "/dashboard", label: "Investing", icon: TrendingUp },
  { href: "/market", label: "Search", icon: Search },
  { href: "/predictions", label: "Predictions", icon: Target },
  { href: "/competitions", label: "Compete", icon: Trophy },
  { href: "/settings", label: "Account", icon: UserRound },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Nav({ email }: { email?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <header className="vanta-mobile-topbar lg:hidden">
        <Link href="/dashboard" className="vanta-lockup" aria-label="Vanta home">
          <span className="vanta-mark" aria-hidden>V</span>
          <span className="vanta-lockup-copy"><strong>Vanta</strong><small>PAPER</small></span>
        </Link>
        <div className="flex items-center gap-1">
          <Link href="/market" className="vanta-icon-button" aria-label="Search markets"><Search className="h-5 w-5" /></Link>
          <ThemeSelector compact />
        </div>
      </header>

      <nav className="vanta-rail hidden lg:flex" aria-label="Primary navigation">
        <div className="vanta-rail-head">
          <Link href="/dashboard" className="vanta-lockup" aria-label="Vanta home">
            <span className="vanta-mark" aria-hidden>V</span>
            <span className="vanta-lockup-copy"><strong>Vanta</strong><small>PAPER</small></span>
          </Link>
        </div>
        <div className="vanta-rail-links">
          {DESKTOP_NAV_ITEMS.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={cn("vanta-nav-link", isActive(pathname, href) && "is-active")}><Icon aria-hidden className="h-[18px] w-[18px]" /><span>{label}</span></Link>)}
        </div>
        <div className="vanta-rail-bottom">
          <div className="vanta-safety-card" aria-label="Paper account safety status"><span>Starting balance</span><strong>$10,000</strong><small>Paper funds only</small></div>
          <div className="flex items-center justify-between gap-2 px-2"><ThemeSelector compact /><button type="button" onClick={() => void logout()} className="vanta-icon-button" aria-label="Sign out"><LogOut className="h-4 w-4" /></button></div>
          {email ? <span className="truncate px-2 text-[10px] text-gray-500" title={email}>{email}</span> : null}
        </div>
      </nav>

      <nav className="vanta-mobile-bottom lg:hidden" aria-label="Mobile navigation">
        {MOBILE_NAV_ITEMS.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={cn("vanta-mobile-nav-link", isActive(pathname, href) && "is-active")}><Icon aria-hidden className="h-5 w-5" /><span>{label}</span></Link>)}
      </nav>
    </>
  );
}
