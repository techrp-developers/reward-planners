import { useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { FiMenu } from "react-icons/fi";

type PremiumPortalShellProps = {
  sidebar: ReactNode;
  roleLabel: string;
  userLabel?: string;
  children: ReactNode;
};

export default function PremiumPortalShell({ sidebar, roleLabel, userLabel, children }: PremiumPortalShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="role-portal min-h-screen bg-[#f7f6fa] text-slate-900">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_4%,rgba(133,43,175,0.08),transparent_28%),radial-gradient(circle_at_92%_92%,rgba(252,63,120,0.07),transparent_30%)]" />

      <div onClickCapture={(event) => { if ((event.target as HTMLElement).closest("a")) setSidebarOpen(false); }} className={`fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        {sidebar}
      </div>
      {sidebarOpen && <button aria-label="Close navigation" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm lg:hidden" />}

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/70 bg-white/85 px-4 backdrop-blur-xl lg:hidden">
        <button onClick={() => setSidebarOpen(true)} aria-label="Open navigation" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm">
          <FiMenu size={20} />
        </button>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-purple-600">{roleLabel}</p>
          {userLabel && <p className="max-w-52 truncate text-sm font-semibold text-slate-800">{userLabel}</p>}
        </div>
      </header>

      <main className="relative min-h-screen min-w-0 overflow-x-hidden lg:ml-64">
        <div key={pathname} className="page-enter mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
