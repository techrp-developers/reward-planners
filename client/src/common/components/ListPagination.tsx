type Props = {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

export default function ListPagination({ total, page, pageSize, onPageChange, onPageSizeChange }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav aria-label="List pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-4 text-sm text-slate-600">
    <p aria-live="polite">{total ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)} of {total}</p>
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2">Rows per page<select value={pageSize} onChange={event => onPageSizeChange(Number(event.target.value))} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">{[10, 25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
      <span>Page {page} of {pages}</span>
      <button type="button" disabled={page >= pages} onClick={() => onPageChange(page + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
    </div>
  </nav>;
}
