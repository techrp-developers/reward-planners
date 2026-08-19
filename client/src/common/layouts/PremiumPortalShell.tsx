import { useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import PortalTopNavbar from "./PortalTopNavbar";

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

      <PortalTopNavbar roleLabel={roleLabel} userLabel={userLabel} onOpenSidebar={() => setSidebarOpen(true)} />

      <main className="relative min-h-screen min-w-0 overflow-x-hidden lg:ml-64">
        <div key={pathname} className="page-enter mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
