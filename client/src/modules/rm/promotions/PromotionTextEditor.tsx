import { useEffect, useRef } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

export type TextOp = { insert: string; attributes?: Record<string, unknown> };
type Props = { label: string; onChange: (ops: TextOp[]) => void; disabled: boolean };

export default function PromotionTextEditor({ label, onChange, disabled }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<Quill | null>(null);
  const callback = useRef(onChange);
  useEffect(() => { callback.current = onChange; }, [onChange]);
  useEffect(() => {
    if (!host.current) return;
    const container = document.createElement('div');
    host.current.append(container);
    const quill = new Quill(container, {
      theme: 'snow', placeholder: 'Write a heading or paragraph…',
      formats: ['header', 'size', 'bold', 'italic', 'underline', 'strike', 'color', 'background', 'align'],
      modules: { toolbar: [[{ header: [1, 2, 3, false] }, { size: ['small', false, 'large', 'huge'] }], ['bold', 'italic', 'underline', 'strike'], [{ color: [] }, { background: [] }], [{ align: [] }], ['clean']] },
    });
    quill.root.style.minHeight = '160px';
    quill.root.setAttribute('aria-label', label);
    quill.root.setAttribute('role', 'textbox');
    quill.root.setAttribute('aria-multiline', 'true');
    const changed = () => callback.current(quill.getContents().ops as TextOp[]);
    quill.on('text-change', changed);
    editor.current = quill;
    const currentHost = host.current;
    return () => { quill.off('text-change', changed); editor.current = null; currentHost.replaceChildren(); };
  }, [label]);
  useEffect(() => { editor.current?.enable(!disabled); }, [disabled]);
  return <div className="space-y-2"><p className="text-sm font-medium">{label}</p><div ref={host} className="overflow-hidden rounded-lg bg-white" /></div>;
}
