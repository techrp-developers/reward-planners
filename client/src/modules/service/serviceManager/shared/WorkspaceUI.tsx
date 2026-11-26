import { useEffect, useRef, type ReactNode } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, RefreshCw, X } from 'lucide-react';
export function PageHeader({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description: string; children?: ReactNode }) {
  return <header className="sm-page-header"><div>{eyebrow && <p className="sm-eyebrow">{eyebrow}</p>}<h1>{title}</h1><p>{description}</p></div><div className="sm-actions">{children}</div></header>;
}
export function StatusBadge({ status }: { status: string | number }) {
  const label = typeof status === 'number' ? status === 1 ? 'Active' : 'Inactive' : status.replaceAll('_', ' ');
  return <span className={`sm-badge ${['Active','completed','converted','paid','approved'].includes(label) ? 'sm-success' : ['Inactive','cancelled','rejected','failed'].includes(label) ? 'sm-muted' : 'sm-warning'}`}><span aria-hidden="true">●</span> {label}</span>;
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) { return <div role="alert" className="sm-error"><AlertCircle size={20} /><div><strong>Workspace unavailable</strong><p>{message}</p>{retry && <button className="sm-btn" onClick={retry}><RefreshCw size={15} />Try again</button>}</div></div>; }
export function EmptyState({ title = 'No records yet', description = 'Records will appear here when available.' }: { title?: string; description?: string }) { return <div className="sm-empty"><strong>{title}</strong><p>{description}</p></div>; }
export function LoadingState() { return <div role="status" aria-label="Loading workspace" className="sm-skeletons">{[1,2,3,4].map(n => <div key={n} className="sm-skeleton" />)}<span className="sr-only">Loading workspace…</span></div>; }
export function Pagination({ page, total, limit, onChange }: { page: number; total: number; limit: number; onChange: (page: number) => void }) { const pages = Math.max(1, Math.ceil(total / limit)); return <div className="sm-pagination"><span>{total.toLocaleString('en-IN')} records · Page {page} of {pages}</span><div className="sm-actions"><button className="sm-btn" aria-label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)}><ArrowLeft size={15} /></button><button className="sm-btn" aria-label="Next page" disabled={page >= pages} onClick={() => onChange(page + 1)}><ArrowRight size={15} /></button></div></div>; }
export function Drawer({ title, children, onClose, dirty = false }: { title: string; children: ReactNode; onClose: () => void; dirty?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => { if (!dirty || window.confirm('Discard your unsaved changes?')) onClose(); };
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => { element?.close(); }; }, []);
  useEffect(() => { if (!dirty) return; const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [dirty]);
  return <dialog ref={dialog} className="sm-drawer" aria-label={title} onCancel={event => { event.preventDefault(); close(); }}><header><h2>{title}</h2><button type="button" aria-label="Close editor" onClick={close} className="sm-icon-btn"><X size={20} /></button></header>{children}</dialog>;
}
