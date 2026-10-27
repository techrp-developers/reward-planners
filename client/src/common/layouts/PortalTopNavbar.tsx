import { FiMenu } from "react-icons/fi";
import NotificationBell from "../notifications/components/NotificationBell";

type PortalTopNavbarProps = {
  roleLabel: string;
  userLabel?: string;
  onOpenSidebar: () => void;
  plain?: boolean;
};

export default function PortalTopNavbar({ roleLabel, userLabel, onOpenSidebar, plain }: PortalTopNavbarProps) {
  if (plain) {
    return (
      <header className="sticky top-0 z-30 border-b border-purple-100/70 bg-white lg:ml-64">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={onOpenSidebar} aria-label="Open navigation" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 lg:hidden">
              <FiMenu size={18} />
            </button>
            <p className="truncate text-sm text-slate-500">{roleLabel}</p>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            {userLabel && <span className="hidden max-w-48 truncate text-sm font-medium text-slate-700 sm:block">{userLabel}</span>}
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-30 border-b border-purple-100/70 bg-white/85 backdrop-blur-xl lg:ml-64">
      <div className="flex h-[72px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={onOpenSidebar} aria-label="Open navigation" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-purple-200 hover:text-[#852BAF] lg:hidden">
            <FiMenu size={20} />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#852BAF]">{roleLabel}</p>
            <p className="mt-0.5 truncate text-sm font-bold text-slate-800 sm:text-base">Welcome back{userLabel ? `, ${userLabel}` : ""}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden h-8 w-px bg-slate-200 sm:block" />
          <NotificationBell />
          {userLabel && (
            <div className="hidden items-center gap-3 rounded-2xl border border-purple-100 bg-white py-1.5 pl-2 pr-3 shadow-sm sm:flex">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#852BAF] to-[#FC3F78] text-sm font-extrabold text-white shadow-md">
                {userLabel.charAt(0).toUpperCase()}
              </div>
              <div className="max-w-36"><p className="truncate text-xs font-bold text-slate-800">{userLabel}</p><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Active session</p></div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
