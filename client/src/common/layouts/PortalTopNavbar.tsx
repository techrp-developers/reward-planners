import { FiMenu, FiMoon, FiSun } from "react-icons/fi";
import NotificationBell from "../notifications/components/NotificationBell";

type PortalTopNavbarProps = {
  roleLabel: string;
  userLabel?: string;
  onOpenSidebar: () => void;
  plain?: boolean;
  darkMode?: boolean;
  onToggleTheme?: () => void;
};

export default function PortalTopNavbar({ roleLabel, userLabel, onOpenSidebar, plain, darkMode, onToggleTheme }: PortalTopNavbarProps) {
  if (plain) {
    return (
      <header className="sticky top-0 z-30 border-b border-purple-100 bg-white/90 backdrop-blur-md lg:ml-64">
        <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={onOpenSidebar} aria-label="Open navigation" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-purple-50 text-[#852BAF] transition hover:bg-purple-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#852BAF] lg:hidden">
              <FiMenu size={18} />
            </button>
            <span aria-hidden="true" className="h-8 w-1 shrink-0 rounded-full bg-gradient-to-b from-[#852BAF] from-60% to-[#C13A8E]" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#852BAF]">{roleLabel}</p>
              <p className="hidden truncate text-xs text-slate-500 sm:block">
                {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <button type="button" onClick={onToggleTheme} aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"} title={darkMode ? "Switch to light mode" : "Switch to dark mode"} className="grid h-9 w-9 cursor-pointer place-items-center rounded-xl bg-purple-50 text-[#852BAF] transition hover:bg-purple-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#852BAF]">
              {darkMode ? <FiSun size={18} /> : <FiMoon size={18} />}
            </button>
            <NotificationBell />
            {userLabel && (
              <div className="hidden items-center gap-2.5 rounded-2xl border border-purple-100 bg-white py-1 pl-1 pr-3 shadow-[0_8px_24px_-14px_rgba(133,43,175,0.35)] sm:flex">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-[#852BAF] from-55% to-[#C13A8E] text-xs font-semibold text-white">
                  {userLabel.charAt(0).toUpperCase()}
                </span>
                <span className="max-w-40 truncate text-sm font-medium text-slate-700">{userLabel}</span>
              </div>
            )}
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
