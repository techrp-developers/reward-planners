import BrandLogo from "../components/BrandLogo";
import type { ReactNode } from "react";

type AuthShellProps = {
  title: string;
  description: ReactNode;
  children: ReactNode;
  // Wider form column for forms with two-column rows.
  wide?: boolean;
};

export default function AuthShell({ title, description, children, wide = false }: AuthShellProps) {
  return (
    <main className="flex min-h-screen items-center bg-[#f8f6fb] p-4 sm:p-6 lg:p-8">
      <section className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:min-h-[640px] lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#180d26] p-10 text-white lg:flex xl:p-12">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_5%,rgba(168,85,247,0.45),transparent_36%),radial-gradient(circle_at_95%_90%,rgba(252,63,120,0.35),transparent_40%)]" />
          <div className="relative w-fit rounded-lg bg-white px-4 py-3"><BrandLogo className="w-36" /></div>
          <div className="relative">
            <h2 className="max-w-sm text-3xl font-semibold leading-tight tracking-tight">Rewards and operations for every team.</h2>
            <p className="mt-4 max-w-sm text-sm leading-6 text-white/65">Manage people, products, orders and rewards from one portal.</p>
          </div>
          <p className="relative text-xs text-white/45">© {new Date().getFullYear()} Reward Planners</p>
        </aside>

        <div className="flex items-center justify-center px-6 py-10 sm:px-12">
          <div className={`w-full ${wide ? "max-w-lg" : "max-w-md"}`}>
            <div className="mb-8 lg:hidden"><BrandLogo className="w-36" /></div>
            <header className="mb-6">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            </header>
            {children}
          </div>
        </div>
      </section>
    </main>
  );
}
