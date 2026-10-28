import { useEffect, useMemo, useState } from "react";
import {
  FiClock,
  FiLoader,
  FiCheckCircle,
  FiXCircle,
  FiSearch,
  FiPaperclip,
  FiHelpCircle,
  FiEye,
  FiX,
} from "react-icons/fi";
import Swal from "sweetalert2";
import { api } from "../../../common/api/api";
import { useDebounce } from "../../../common/hooks/useDebounce";

type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

interface Ticket {
  ticket_id: number;
  user_id: number;
  user_name: string | null;
  user_email: string | null;
  user_phone: string | null;
  company_name: string | null;
  subject: string;
  description: string;
  category_id: number;
  category_name: string | null;
  support_module: string;
  reference_type: string | null;
  reference_id: string | null;
  reference_label: string | null;
  attachment_url: string | null;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
}

type FilterValue = "all" | TicketStatus;

const filterTabs: { label: string; value: FilterValue }[] = [
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  { label: "In Progress", value: "in_progress" },
  { label: "Resolved", value: "resolved" },
  { label: "Closed", value: "closed" },
];

const statusConfig: Record<
  TicketStatus,
  { label: string; cls: string; icon: React.ReactNode }
> = {
  open: {
    label: "Open",
    cls: "bg-amber-50 text-amber-700 border border-amber-200",
    icon: <FiClock className="shrink-0" size={11} />,
  },
  in_progress: {
    label: "In Progress",
    cls: "bg-blue-50 text-blue-700 border border-blue-200",
    icon: <FiLoader className="shrink-0" size={11} />,
  },
  resolved: {
    label: "Resolved",
    cls: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    icon: <FiCheckCircle className="shrink-0" size={11} />,
  },
  closed: {
    label: "Closed",
    cls: "bg-gray-100 text-gray-500 border border-gray-200",
    icon: <FiXCircle className="shrink-0" size={11} />,
  },
};

const StatusChip = ({ status }: { status: TicketStatus }) => {
  const cfg = statusConfig[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${cfg.cls}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
};

const nextActions: Record<TicketStatus, { status: TicketStatus; label: string }[]> = {
  open: [
    { status: "in_progress", label: "Mark In Progress" },
    { status: "resolved", label: "Resolve" },
    { status: "closed", label: "Close" },
  ],
  in_progress: [
    { status: "resolved", label: "Resolve" },
    { status: "closed", label: "Close" },
    { status: "open", label: "Reopen" },
  ],
  resolved: [
    { status: "closed", label: "Close" },
    { status: "open", label: "Reopen" },
  ],
  closed: [{ status: "open", label: "Reopen" }],
};

export default function SupportTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const debouncedSearch = useDebounce(search.trim(), 350);

  async function loadTickets() {
    try {
      setLoading(true);
      setError("");
      const res = await api.get("/manager/support-tickets", {
        params: {
          status: filter !== "all" ? filter : undefined,
          search: debouncedSearch || undefined,
        },
      });
      if (res.data?.success) setTickets(res.data.data);
    } catch (err) {
      console.error("Error loading support tickets:", err);
      setError("Unable to load support tickets.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, debouncedSearch]);

  const counts = useMemo(() => {
    const map: Record<FilterValue, number> = { all: tickets.length, open: 0, in_progress: 0, resolved: 0, closed: 0 };
    tickets.forEach((t) => { map[t.status] += 1; });
    return map;
  }, [tickets]);

  async function updateStatus(ticket: Ticket, status: TicketStatus) {
    setUpdatingId(ticket.ticket_id);
    try {
      await api.put(`/manager/support-tickets/${ticket.ticket_id}/status`, { status });
      setTickets((prev) => prev.map((t) => (t.ticket_id === ticket.ticket_id ? { ...t, status } : t)));
      setSelectedTicket((current) =>
        current?.ticket_id === ticket.ticket_id ? { ...current, status } : current,
      );
    } catch (err) {
      console.error("Error updating ticket status:", err);
      await Swal.fire({
        title: "Update failed",
        text: "Unable to update the ticket status. Please try again.",
        icon: "error",
        customClass: { popup: "rounded-2xl" },
      });
    } finally {
      setUpdatingId(null);
    }
  }

  const inputCls =
    "px-4 py-2.5 bg-gray-50/60 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:ring-4 focus:ring-[#852BAF]/15 focus:border-[#852BAF] focus:bg-white transition-all";

  return (
    <div className="mx-auto space-y-6 max-w-7xl">
      {/* ── PAGE HEADER ── */}
      <div
        className="flex flex-wrap items-center justify-between gap-4"
      >
        <div className="flex items-center gap-4">
          <div
            className="flex items-center justify-center bg-purple-50 text-[#852BAF] w-10 h-10 rounded-lg shrink-0"
          >
            <FiHelpCircle size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
              Support <span className="text-slate-900">Enquiries</span>
            </h1>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Review and resolve customer support tickets
            </p>
          </div>
        </div>

        <span className="px-3 py-1.5 rounded-lg bg-purple-50 text-xs font-medium text-[#852BAF]">
          {counts.all} ticket{counts.all !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── MAIN CARD ── */}
      <div
        className="overflow-hidden rounded-xl border border-purple-100 bg-white shadow-sm"
      >
        {/* FILTER BAR */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1 rounded-lg border border-purple-100 bg-purple-50 p-1">
              {filterTabs.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer ${
                    filter === value ? "text-white shadow-sm" : "text-gray-500 hover:text-[#852BAF]"
                  }`}
                  style={filter === value ? { background: "#852BAF" } : {}}
                >
                  {label}
                  {value !== "all" && counts[value] > 0 ? ` (${counts[value]})` : ""}
                </button>
              ))}
            </div>

            <div className="relative">
              <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input
                type="text"
                placeholder="Search tickets…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${inputCls} pl-9 w-64`}
              />
            </div>
          </div>
        </div>

        {/* TABLE */}
        {loading ? (
          <div className="flex min-h-72 items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-3 border-transparent border-r-[#FC3F78] border-t-[#852BAF]" />
          </div>
        ) : error ? (
          <div className="p-12 text-center text-sm font-semibold text-red-600">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr style={{ background: "transparent" }}>
                  <th className="px-6 py-4 text-xs font-bold tracking-wider text-left text-gray-400 uppercase">Ticket</th>
                  <th className="px-6 py-4 text-xs font-bold tracking-wider text-left text-gray-400 uppercase">Customer</th>
                  <th className="px-6 py-4 text-xs font-bold tracking-wider text-left text-gray-400 uppercase">Company</th>
                  <th className="px-6 py-4 text-xs font-bold tracking-wider text-left text-gray-400 uppercase">Category / Module</th>
                  <th className="px-6 py-4 text-xs font-bold tracking-wider text-left text-gray-400 uppercase">Status</th>
                  <th className="px-6 py-4 text-xs font-bold tracking-wider text-left text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {tickets.map((ticket, i) => (
                  <tr key={ticket.ticket_id} className="transition-colors duration-150 hover:bg-purple-50/20" style={{ animationDelay: `${i * 40}ms` }}>
                    <td className="px-6 py-4 max-w-sm">
                      <p className="text-sm font-semibold text-gray-900">#{ticket.ticket_id} — {ticket.subject}</p>
                      <p className="mt-1 text-xs text-gray-500 line-clamp-2">{ticket.description}</p>
                      {ticket.attachment_url && (
                        <a
                          href={ticket.attachment_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-[#852BAF] hover:underline"
                        >
                          <FiPaperclip size={11} /> Attachment
                        </a>
                      )}
                      <p className="mt-1.5 text-xs text-gray-400">
                        {new Date(ticket.created_at).toLocaleString()}
                      </p>
                    </td>

                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-700">{ticket.user_name ?? "Unknown"}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{ticket.user_email || "No email"}</p>
                      <p className="text-xs text-gray-400">{ticket.user_phone || "No phone"}</p>
                    </td>

                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-700">{ticket.company_name ?? "—"}</p>
                    </td>

                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-700">{ticket.category_name ?? "—"}</p>
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">{ticket.support_module.replace("_", " ")}</p>
                      {ticket.reference_label && (
                        <p className="text-xs text-gray-400">Ref: #{ticket.reference_label}</p>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <StatusChip status={ticket.status} />
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => setSelectedTicket(ticket)}
                          className="flex items-center gap-1.5 rounded-xl border border-purple-200 px-3.5 py-2 text-xs font-bold text-[#852BAF] transition-all hover:bg-purple-50 active:scale-95"
                        >
                          <FiEye size={14} /> View
                        </button>
                        {nextActions[ticket.status].map((action) => (
                          <button
                            key={action.status}
                            disabled={updatingId === ticket.ticket_id}
                            onClick={() => void updateStatus(ticket, action.status)}
                            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white rounded-xl cursor-pointer transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                            style={{ background: "#852BAF" }}
                          >
                            {updatingId === ticket.ticket_id ? "…" : action.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && tickets.length === 0 && (
          <div className="py-16 text-center">
            <div
              className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-2xl"

            >
              <FiHelpCircle className="text-[#852BAF] opacity-50" size={24} />
            </div>
            <h3 className="mb-1 text-base font-bold text-gray-700">No tickets found</h3>
            <p className="text-sm text-gray-400">No match for the current filter or search.</p>
          </div>
        )}
      </div>

      {selectedTicket && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="support-ticket-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedTicket(null);
          }}
        >
          <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <header className="sticky top-0 z-10 flex items-start justify-between border-b border-gray-100 bg-white px-6 py-5">
              <div className="min-w-0 pr-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#852BAF]">
                    Ticket #{selectedTicket.ticket_id}
                  </span>
                  <StatusChip status={selectedTicket.status} />
                </div>
                <h2 id="support-ticket-title" className="text-xl font-semibold text-gray-900">
                  {selectedTicket.subject}
                </h2>
              </div>
              <button
                onClick={() => setSelectedTicket(null)}
                aria-label="Close ticket details"
                className="shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                <FiX size={20} />
              </button>
            </header>

            <div className="space-y-6 p-6">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Description</h3>
                <p className="whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-700">
                  {selectedTicket.description || "No description provided."}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Customer", selectedTicket.user_name || "Unknown"],
                  ["Company", selectedTicket.company_name || "Not provided"],
                  ["Email", selectedTicket.user_email || "Not provided"],
                  ["Phone", selectedTicket.user_phone || "Not provided"],
                  ["Category", selectedTicket.category_name || "Not specified"],
                  ["Support module", selectedTicket.support_module.replaceAll("_", " ")],
                  ["Reference", selectedTicket.reference_label || selectedTicket.reference_id || "Not provided"],
                  ["Created", new Date(selectedTicket.created_at).toLocaleString()],
                  ["Last updated", new Date(selectedTicket.updated_at).toLocaleString()],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-gray-100 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
                    <p className="mt-1 break-words text-sm font-semibold capitalize text-gray-800">{value}</p>
                  </div>
                ))}
              </div>

              {selectedTicket.attachment_url && (
                <a
                  href={selectedTicket.attachment_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-purple-200 px-4 py-2.5 text-sm font-bold text-[#852BAF] hover:bg-purple-50"
                >
                  <FiPaperclip /> Open attachment
                </a>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-5">
                {nextActions[selectedTicket.status].map((action) => (
                  <button
                    key={action.status}
                    disabled={updatingId === selectedTicket.ticket_id}
                    onClick={() => void updateStatus(selectedTicket, action.status)}
                    className="rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ background: "#852BAF" }}
                  >
                    {updatingId === selectedTicket.ticket_id ? "Updating..." : action.label}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
