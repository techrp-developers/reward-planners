import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { FiBell, FiCheck, FiCheckCircle, FiInbox, FiShoppingBag, FiTrash2, FiUserPlus, FiX } from "react-icons/fi";
import { useAuth } from "../../auth/useAuth";
import { useNotification } from "../useNotification";
import { timeAgo } from "../NotificationService";
import type { AppNotification, NotificationCategory } from "../types";

const PRIORITY_STYLE: Record<AppNotification["priority"], string> = {
  high: "border-red-100 bg-red-50 text-red-600",
  medium: "border-amber-100 bg-amber-50 text-amber-600",
  low: "border-emerald-100 bg-emerald-50 text-emerald-600",
};

const CATEGORY_ICON: Record<NotificationCategory, React.ElementType> = {
  new_order: FiShoppingBag,
  service_enquiry: FiInbox,
  vendor_onboarding: FiUserPlus,
  product_approval: FiCheckCircle,
  general: FiBell,
};

const roleName = (role?: string) => (role || "portal").replaceAll("_", " ");

export default function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearNotification, clearAll } = useNotification();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const handleNotificationClick = (notification: AppNotification) => {
    if (!notification.read) markAsRead(notification.id);
    if (notification.link) {
      navigate(notification.link);
      setOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative grid h-11 w-11 place-items-center rounded-2xl border border-purple-100 bg-white text-slate-500 shadow-sm transition-all hover:-translate-y-0.5 hover:border-purple-200 hover:text-[#852BAF] hover:shadow-md"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
      >
        <FiBell size={19} className="transition-transform group-hover:rotate-6" />
        {unreadCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-red-500 to-pink-600 px-1 text-[9px] font-extrabold text-white shadow-sm">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[100]">
          <button type="button" aria-label="Close notifications" onClick={() => setOpen(false)} className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]" />
          <aside role="dialog" aria-modal="true" aria-labelledby="notification-title" className="absolute inset-y-0 right-0 flex w-full max-w-[430px] animate-[slideInRight_.28s_ease-out] flex-col border-l border-purple-100 bg-[#fbfaff] shadow-[-20px_0_60px_rgba(35,18,48,0.2)]">
            <div className="relative overflow-hidden bg-gradient-to-br from-[#25103d] via-[#64248c] to-[#b72f72] px-6 pb-6 pt-7 text-white">
              <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
              <div className="relative flex items-start justify-between gap-4">
                <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-purple-200">{roleName(user?.role)} workspace</p><h2 id="notification-title" className="mt-1 text-2xl font-extrabold">Notifications</h2><p className="mt-1 text-xs text-purple-100/75">Updates relevant to your role and activity.</p></div>
                <button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-white/10 text-white transition hover:bg-white/20" aria-label="Close"><FiX size={20} /></button>
              </div>
              <div className="relative mt-5 flex items-center justify-between rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
                <div><p className="text-[10px] font-bold uppercase tracking-widest text-purple-200">Unread</p><p className="text-xl font-extrabold">{unreadCount}</p></div>
                {unreadCount > 0 && <button type="button" onClick={markAllAsRead} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-[#64248c] shadow-sm"><FiCheck /> Mark all read</button>}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {notifications.length === 0 ? (
                <div className="flex h-full min-h-72 flex-col items-center justify-center text-center"><div className="grid h-16 w-16 place-items-center rounded-3xl bg-purple-50 text-purple-300"><FiBell size={26} /></div><h3 className="mt-5 font-extrabold text-slate-800">You're all caught up</h3><p className="mt-1 max-w-64 text-sm leading-6 text-slate-400">Role-specific updates and important activity will appear here.</p></div>
              ) : (
                <div className="space-y-3">
                  {notifications.map((notification) => {
                    const Icon = CATEGORY_ICON[notification.category];
                    return (
                      <article key={notification.id} onClick={() => handleNotificationClick(notification)} className={`group cursor-pointer rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${notification.read ? "border-slate-100 bg-white" : "border-purple-100 bg-purple-50/55"}`}>
                        <div className="flex items-start gap-3">
                          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${PRIORITY_STYLE[notification.priority]}`}><Icon size={17} /></div>
                          <div className="min-w-0 flex-1"><div className="flex items-start gap-2"><h3 className="flex-1 text-sm font-extrabold text-slate-900">{notification.title}</h3>{!notification.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#FC3F78] shadow-[0_0_0_3px_rgba(252,63,120,.12)]" />}</div><p className="mt-1 text-xs leading-5 text-slate-500">{notification.message}</p><p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{timeAgo(notification.createdAt)}</p></div>
                          <button type="button" onClick={(event) => { event.stopPropagation(); clearNotification(notification.id); }} className="rounded-lg p-1.5 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 focus:opacity-100" aria-label="Dismiss notification"><FiTrash2 size={14} /></button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            {notifications.length > 0 && <div className="border-t border-slate-100 bg-white px-5 py-4"><button type="button" onClick={clearAll} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600">Clear notification history</button></div>}
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}
