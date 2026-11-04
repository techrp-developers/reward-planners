import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FiBriefcase, FiRefreshCw, FiSearch, FiTrash2 } from "react-icons/fi";
import { assignmentApi } from "../notificationApi";
import type { AssignmentAuditEntry, AssignmentCompany, ManagerMeta, RmAccount } from "../notificationTypes";
import { Card, EmptyState, Metric, Modal, Notice, Spinner, Tag, dangerBtn, inputCls, labelCls, primaryBtn, secondaryBtn } from "../components";
import { assignmentErrorMessage, formatInZone } from "../notificationUtils";
import { assignmentOverview, defaultTargetRm, filterCompanies, isSelectable, pruneSelection, selectableIds } from "../assignmentUtils";

type Pending =
  | { kind: "assign"; rm: RmAccount; companies: AssignmentCompany[] }
  | { kind: "revoke"; rm: RmAccount; companyId: number; companyName: string };

const ACTION_LABELS: Record<AssignmentAuditEntry["action"], string> = {
  rm_assignment_granted: "Assigned",
  rm_assignment_revoked: "Removed",
  rm_assignment_denied: "Denied",
};

/**
 * RM -> company assignments, managed by relationship managers. The server
 * enforces the permission, validates every RM and company, and audits every
 * change; this screen only collects an explicit, confirmed choice.
 */
export default function CompaniesTab({ meta, onChanged }: { meta: ManagerMeta; onChanged: () => Promise<void> | void }) {
  const [rms, setRms] = useState<RmAccount[]>([]);
  const [companies, setCompanies] = useState<AssignmentCompany[]>([]);
  const [audit, setAudit] = useState<AssignmentAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [rmUserId, setRmUserId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false); // blocks a second request before React re-renders
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoadError("");
    try {
      const [rmData, companyData, auditData] = await Promise.all([assignmentApi.rms(), assignmentApi.companies(), assignmentApi.audit({ limit: 20 })]);
      if (seq !== loadSeq.current) return; // a newer load is in flight
      setRms(rmData.rms);
      setCompanies(companyData);
      setAudit(auditData);
      setRmUserId((current) => (current && rmData.rms.some((rm) => rm.user_id === current && rm.is_verified) ? current : defaultTargetRm(rmData.rms, meta.role, meta.userId)));
    } catch (error) {
      if (seq === loadSeq.current) setLoadError(assignmentErrorMessage(error, "Company assignments could not be loaded."));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [meta.role, meta.userId]);
  useEffect(() => { void load(); }, [load]);

  // Keep the selection valid for the chosen RM and the latest company list.
  useEffect(() => { setSelected((current) => pruneSelection(current, companies, rmUserId)); }, [companies, rmUserId]);

  const rm = rms.find((item) => item.user_id === rmUserId) || null;
  const visible = useMemo(() => filterCompanies(companies, search), [companies, search]);
  const visibleSelectable = useMemo(() => selectableIds(visible, rmUserId), [visible, rmUserId]);
  const overview = assignmentOverview(companies, rm, audit);
  const companyName = (id: number) => companies.find((company) => company.company_id === id)?.company_name || `Company #${id}`;
  const rmName = (id?: number) => rms.find((item) => item.user_id === id)?.name || (id ? `RM #${id}` : "—");
  const isSelf = rm?.user_id === meta.userId;

  const toggle = (id: number, checked: boolean) => setSelected((current) => (checked ? [...new Set([...current, id])] : current.filter((item) => item !== id)));

  const afterChange = async () => {
    await load();
    await onChanged(); // refresh scope, audience options and previews
  };

  const confirm = async () => {
    if (!pending || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      if (pending.kind === "assign") {
        const result = await assignmentApi.assign(pending.rm.user_id, pending.companies.map((company) => company.company_id));
        const parts = [`${result.assigned.length} compan${result.assigned.length === 1 ? "y" : "ies"} assigned to ${pending.rm.name}`];
        if (result.already_assigned.length) parts.push(`${result.already_assigned.length} already assigned`);
        toast.success(`${parts.join(", ")}.`);
        setSelected([]);
      } else {
        const result = await assignmentApi.revoke(pending.rm.user_id, pending.companyId);
        if (result.removed) toast.success(`${pending.companyName} removed from ${pending.rm.name}.`);
        else toast.info(`${pending.companyName} was already removed from ${pending.rm.name}.`);
      }
      setPending(null);
      await afterChange();
    } catch (error) {
      toast.error(assignmentErrorMessage(error));
      // The server may have changed underneath us (409/422/404): show its current state.
      void load();
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  if (loading) return <Spinner />;
  if (loadError) {
    return (
      <Card>
        <EmptyState title="Company assignments could not be loaded" text={loadError}
          action={<button type="button" className={secondaryBtn} onClick={() => { setLoading(true); void load(); }}><FiRefreshCw /> Retry</button>} />
      </Card>
    );
  }

  const verifiedRms = rms.filter((item) => item.is_verified);

  return (
    <div className="space-y-5">
      <Notice tone="blue">
        Assigning a company lets that relationship manager target its employees with push notifications. Employee consent, quiet hours and daily limits still apply, and every change is recorded with your name.
      </Notice>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Active companies" value={overview.totalActive} />
        <Metric label={`Assigned to ${rm ? (isSelf ? "you" : rm.name) : "RM"}`} value={rm ? overview.assigned : null} tone="bg-emerald-500" />
        <Metric label="Available to assign" value={rm ? overview.available : null} tone="bg-sky-500" />
        <Metric label="Last change" value={overview.lastActivity ? ACTION_LABELS[overview.lastActivity.action] : "None yet"}
          hint={overview.lastActivity ? `${formatInZone(overview.lastActivity.created_at)} · ${overview.lastActivity.actor_name || overview.lastActivity.actor_role}` : undefined} tone="bg-amber-500" />
      </div>

      <Card title="Relationship manager" subtitle="Choose whose company access you are managing.">
        <div className="p-5">
          {verifiedRms.length ? (
            <label className="block max-w-md"><span className={labelCls}>Relationship manager</span>
              <select className={inputCls} value={rmUserId ?? ""} disabled={busy} onChange={(event) => { setRmUserId(Number(event.target.value) || null); setSelected([]); }}>
                {rms.map((item) => (
                  <option key={item.user_id} value={item.user_id} disabled={!item.is_verified}>
                    {item.name}{item.user_id === meta.userId ? " (you)" : ""} · {item.email}{item.is_verified ? "" : " · not verified"}
                  </option>
                ))}
              </select>
            </label>
          ) : <p className="text-sm text-gray-500">There are no verified relationship manager accounts to assign companies to.</p>}
        </div>
      </Card>

      {rm && (
        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <Card title="Available companies" subtitle="Inactive companies cannot be assigned."
            actions={<button type="button" className={secondaryBtn} onClick={() => void load()} disabled={busy}><FiRefreshCw /> Refresh</button>}>
            <div className="space-y-3 p-5">
              <label className="relative block">
                <span className="sr-only">Search companies</span>
                <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className={`${inputCls} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by company name or ID" />
              </label>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button type="button" className="font-bold text-[#852BAF] hover:underline disabled:opacity-40" disabled={!visibleSelectable.length || busy}
                  onClick={() => setSelected((current) => [...new Set([...current, ...visibleSelectable])])}>
                  Select all eligible{search.trim() ? " (shown)" : ""} ({visibleSelectable.length})
                </button>
                <span className="text-gray-300">|</span>
                <button type="button" className="font-bold text-gray-500 hover:underline disabled:opacity-40" disabled={!selected.length || busy} onClick={() => setSelected([])}>Clear selection</button>
                <span className="ml-auto text-gray-500">{selected.length} selected</span>
              </div>

              {visible.length ? (
                <ul className="max-h-[420px] divide-y divide-gray-50 overflow-y-auto rounded-xl border border-gray-100">
                  {visible.map((company) => {
                    const assigned = company.rm_user_ids.includes(rm.user_id);
                    const selectable = isSelectable(company, rm.user_id);
                    return (
                      <li key={company.company_id}>
                        <label className={`flex items-center gap-3 px-3 py-2.5 text-sm ${selectable ? "cursor-pointer hover:bg-purple-50/50" : "cursor-not-allowed opacity-70"}`}>
                          <input type="checkbox" disabled={!selectable || busy} checked={selected.includes(company.company_id)}
                            onChange={(event) => toggle(company.company_id, event.target.checked)} aria-label={`Select ${company.company_name}`} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-gray-900">{company.company_name}</span>
                            <span className="text-xs text-gray-500">ID {company.company_id} · {company.active_employees.toLocaleString()} active employees</span>
                          </span>
                          {company.status === 1 ? <Tag tone="green">Active</Tag> : <Tag tone="red">Inactive</Tag>}
                          {assigned ? <Tag tone="purple">Assigned</Tag> : <Tag>Not assigned</Tag>}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : <EmptyState title={companies.length ? "No companies match your search" : "No companies found"} text={companies.length ? "Try a different name or ID." : undefined} />}

              <div className="flex justify-end">
                <button type="button" className={primaryBtn} disabled={!selected.length || busy}
                  onClick={() => setPending({ kind: "assign", rm, companies: companies.filter((company) => selected.includes(company.company_id)) })}>
                  <FiBriefcase /> Assign {selected.length || ""} compan{selected.length === 1 ? "y" : "ies"}
                </button>
              </div>
            </div>
          </Card>

          <div className="space-y-5">
            <Card title={`Assigned to ${isSelf ? "you" : rm.name}`} subtitle="Removing a company takes effect immediately, including for scheduled campaigns.">
              {rm.companies.length ? (
                <ul className="divide-y divide-gray-50">
                  {rm.companies.map((row) => (
                    <li key={row.company_id} className="flex items-center gap-3 px-5 py-3 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-gray-900">{row.company_name || `Company #${row.company_id}`}</span>
                        <span className="text-xs text-gray-500">By {row.assigned_by_name || (row.assigned_by ? `user #${row.assigned_by}` : "—")} · {formatInZone(row.created_at)}</span>
                      </span>
                      {row.company_status !== 1 && <Tag tone="red">Inactive</Tag>}
                      <button type="button" className={dangerBtn} disabled={busy} aria-label={`Remove ${row.company_name || row.company_id}`}
                        onClick={() => setPending({ kind: "revoke", rm, companyId: row.company_id, companyName: row.company_name || `Company #${row.company_id}` })}>
                        <FiTrash2 />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title="No companies assigned yet" text="Select companies on the left and assign them." />}
            </Card>

            <Card title="Assignment history" subtitle="Most recent changes by any RM.">
              {audit.length ? (
                <ul className="max-h-80 divide-y divide-gray-50 overflow-y-auto">
                  {audit.map((entry) => (
                    <li key={entry.audit_id} className="px-5 py-2.5 text-xs text-gray-600">
                      <div className="flex items-center gap-2">
                        <Tag tone={entry.action === "rm_assignment_granted" ? "green" : entry.action === "rm_assignment_revoked" ? "amber" : "red"}>{ACTION_LABELS[entry.action] || entry.action}</Tag>
                        <span className="ml-auto text-gray-400">{formatInZone(entry.created_at)}</span>
                      </div>
                      <p className="mt-1">
                        <span className="font-semibold text-gray-800">{entry.actor_name || `User #${entry.actor_user_id}`}</span> ({entry.actor_role})
                        {entry.details?.company_id ? <> · {companyName(entry.details.company_id)}</> : null}
                        {entry.details?.rm_user_id ? <> → {rmName(entry.details.rm_user_id)}</> : null}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title="No changes recorded yet" />}
            </Card>
          </div>
        </div>
      )}

      {pending && (
        <Modal title={pending.kind === "assign" ? "Assign companies?" : "Remove company?"} onClose={() => (busy ? undefined : setPending(null))}>
          <div className="space-y-4">
            {pending.kind === "assign" ? (
              <>
                <p className="text-sm text-gray-700">
                  You are about to assign <strong>{pending.companies.length}</strong> compan{pending.companies.length === 1 ? "y" : "ies"} to <strong>{pending.rm.name}</strong>{pending.rm.user_id === meta.userId ? " (you)" : ""}. This grants access to their eligible notification audiences. Continue?
                </p>
                <ul className="max-h-56 list-disc space-y-0.5 overflow-y-auto rounded-xl bg-gray-50 py-3 pl-8 pr-3 text-sm text-gray-800">
                  {pending.companies.map((company) => <li key={company.company_id}>{company.company_name} <span className="text-xs text-gray-500">(ID {company.company_id})</span></li>)}
                </ul>
                <p className="text-xs text-gray-500">Nothing is sent. Notifications still need to be composed and confirmed separately.</p>
              </>
            ) : (
              <p className="text-sm text-gray-700">
                Remove <strong>{pending.companyName}</strong> from <strong>{pending.rm.name}</strong>? Their access to this company's employees ends immediately, and queued or scheduled sends to them are skipped.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className={secondaryBtn} disabled={busy} onClick={() => setPending(null)}>Cancel</button>
              <button type="button" className={pending.kind === "assign" ? primaryBtn : dangerBtn} disabled={busy} onClick={() => void confirm()}>
                {busy ? "Saving…" : pending.kind === "assign" ? "Assign" : "Remove"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
