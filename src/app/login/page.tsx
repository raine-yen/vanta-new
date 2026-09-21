"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, Sparkles } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code === "google_oauth_unavailable") setError("Google sign-in is not available yet. Please use email and password.");
    if (code === "google_callback_failed") setError("Google sign-in could not be completed. Please try again.");
    if (code === "account_setup_failed") setError("Your Google account signed in, but your paper account could not be created.");
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "We could not sign you in. Try again.");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Network issue. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative grid min-h-screen overflow-hidden bg-bg text-gray-50 lg:grid-cols-[1.05fr_.95fr]">


      <section className="relative flex min-h-screen flex-col px-6 py-6 sm:px-10 lg:px-16 lg:py-10">
        <Link href="/" className="inline-flex w-fit items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent-green">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-lg font-black text-black">V</span>
          <span>
            <span className="block text-lg font-black tracking-tight">Vanta</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[.24em] text-gray-500">Paper markets</span>
          </span>
        </Link>

        <div className="my-auto w-full max-w-md py-14 lg:py-0">
          <div className="mb-8 inline-flex items-center gap-2 border-l-2 border-accent-green px-3 py-1 text-xs font-semibold uppercase tracking-[.14em] text-accent-green">
            <Sparkles className="h-3.5 w-3.5" />
            Your paper portfolio, in motion
          </div>
          <h1 className="text-4xl font-black tracking-[-.045em] sm:text-5xl">Welcome back.</h1>
          <p className="mt-4 max-w-sm text-base leading-7 text-gray-400">Sign in to see your simulated portfolio, live market scanner, and watchlists.</p>

          <form onSubmit={submit} className="mt-9 space-y-5" noValidate>
            <div>
              <label htmlFor="email" className="label">Email address</label>
              <input id="email" name="email" type="email" autoComplete="email" className="input h-12" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <div>
              <label htmlFor="password" className="label">Password</label>
              <input id="password" name="password" type="password" autoComplete="current-password" className="input h-12" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p role="alert" className="rounded-lg border border-accent-red/30 bg-accent-red/10 px-3 py-2.5 text-sm text-red-200">{error}</p>}
            <button type="submit" disabled={loading} className="btn-buy h-12 w-full text-base">
              {loading ? "Signing in…" : <>Sign in to Vanta <ArrowRight className="h-4 w-4" /></>}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-[.14em] text-gray-600">
            <span className="h-px flex-1 bg-bg-border" />
            <span>or</span>
            <span className="h-px flex-1 bg-bg-border" />
          </div>
          <a href="/api/auth/google?next=%2Fdashboard" className="flex h-12 w-full items-center justify-center gap-2 border border-bg-border bg-bg-soft text-sm font-semibold text-gray-100 transition hover:border-gray-500">
            Continue with Google
          </a>

          <p className="mt-7 text-sm text-gray-400">New to Vanta? <Link href="/signup" className="font-semibold text-accent-green hover:text-green-300 focus-visible:outline-none focus-visible:underline">Create a paper account</Link></p>
        </div>

        <p className="flex items-center gap-2 text-xs text-gray-500"><LockKeyhole className="h-3.5 w-3.5" /> Simulation only — no deposits, withdrawals, or real-money trading.</p>
      </section>

      <aside className="relative hidden border-l border-bg-border bg-black p-10 lg:flex lg:flex-col lg:justify-center">
        <div className="max-w-md">
          <p className="text-xs font-bold uppercase tracking-[.24em] text-accent-green">The Vanta terminal</p>
          <h2 className="mt-5 text-5xl font-black leading-[.98] tracking-[-.055em]">See every move.<br />Keep the stakes virtual.</h2>
          <div className="mt-12 border border-bg-border bg-bg-soft">
            <div className="flex items-center justify-between border-b border-bg-border px-5 py-4"><span className="text-sm font-semibold">Portfolio value</span><span className="border border-accent-green/30 px-2 py-0.5 text-[10px] font-bold tracking-[.16em] text-accent-green">PAPER</span></div>
            <div className="p-5"><div className="font-mono text-4xl font-bold tracking-tight">$10,000.00</div><div className="mt-2 text-sm font-semibold text-accent-green">Starting allocation · simulated</div><div className="mt-7 flex h-28 items-end gap-1.5">{[22,31,27,40,35,54,48,61,56,72,67,82].map((h, i) => <span key={i} className="flex-1 bg-accent-green" style={{ height: `${h}%`, opacity: 0.35 + i / 20 }} />)}</div></div>
          </div>
        </div>
      </aside>
    </main>
  );
}
