import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { paintCoverBrush } from "../utils/manualCoverBrush";

type Props = { file: File; disabled: boolean; onApply: (file: File) => void; onCancel: () => void };

export default function ManualCoverEditor({ file, disabled, onApply, onCancel }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const original = useRef<ImageData | null>(null);
  const edited = useRef<ImageData | null>(null);
  const undo = useRef<Uint8ClampedArray[]>([]);
  const redo = useRef<Uint8ClampedArray[]>([]);
  const stroke = useRef<{ x: number; y: number; pointer: number } | null>(null);
  const [tool, setTool] = useState<"erase" | "restore" | "pan">("erase");
  const [brush, setBrush] = useState(40);
  const [zoom, setZoom] = useState(1);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const mounted = useRef(true);
  const [, redraw] = useState(0);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    const url = URL.createObjectURL(file);
    setReady(false); setError("");
    const image = new Image();
    image.src = url;
    void image.decode().then(() => {
      if (cancelled || !canvas.current) return;
      const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
      const target = canvas.current;
      target.width = Math.max(1, Math.round(image.naturalWidth * scale));
      target.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const ctx = target.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas editing is unavailable in this browser.");
      ctx.drawImage(image, 0, 0, target.width, target.height);
      original.current = ctx.getImageData(0, 0, target.width, target.height);
      edited.current = ctx.getImageData(0, 0, target.width, target.height);
      undo.current = []; redo.current = []; stroke.current = null;
      setZoom(1); setReady(true);
    }).catch(() => { if (!cancelled) setError("Unable to open this image in the editor. Please choose another image."); })
      .finally(() => URL.revokeObjectURL(url));
    return () => { cancelled = true; mounted.current = false; stroke.current = null; URL.revokeObjectURL(url); };
  }, [file]);

  const refresh = () => {
    if (edited.current) canvas.current?.getContext("2d")?.putImageData(edited.current, 0, 0);
    redraw(value => value + 1);
  };
  const snapshot = () => {
    if (!edited.current) return;
    undo.current.push(edited.current.data.slice());
    if (undo.current.length > 4) undo.current.shift(); // Bound memory at full editing resolution.
    redo.current = [];
  };
  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * event.currentTarget.width / rect.width,
      y: (event.clientY - rect.top) * event.currentTarget.height / rect.height };
  };
  const paint = (x: number, y: number) => {
    if (!edited.current || !original.current) return;
    paintCoverBrush(edited.current.data, original.current.data, edited.current.width, edited.current.height,
      x, y, brush / 2, tool === "restore");
  };
  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!ready || disabled || savingRef.current || stroke.current || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "pan") stroke.current = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
    else { snapshot(); const p = point(event); stroke.current = { ...p, pointer: event.pointerId }; paint(p.x, p.y); refresh(); }
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    const last = stroke.current;
    if (!last || last.pointer !== event.pointerId || disabled || savingRef.current) return;
    if (tool === "pan") {
      if (viewport.current) { viewport.current.scrollLeft -= event.clientX - last.x; viewport.current.scrollTop -= event.clientY - last.y; }
      stroke.current = { x: event.clientX, y: event.clientY, pointer: event.pointerId }; return;
    }
    const p = point(event);
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - last.x, p.y - last.y) / Math.max(1, brush / 4)));
    for (let i = 1; i <= steps; i++) paint(last.x + (p.x - last.x) * i / steps, last.y + (p.y - last.y) * i / steps);
    stroke.current = { ...p, pointer: event.pointerId }; refresh();
  };
  const history = (back: boolean) => {
    if (!edited.current) return;
    const from = back ? undo.current : redo.current;
    const to = back ? redo.current : undo.current;
    const value = from.pop(); if (!value) return;
    to.push(edited.current.data.slice()); edited.current.data.set(value); refresh();
  };
  const apply = () => {
    if (savingRef.current || disabled || !ready || !canvas.current) return;
    savingRef.current = true; setSaving(true); setError("");
    canvas.current.toBlob(blob => {
      if (!mounted.current) return;
      savingRef.current = false; setSaving(false);
      if (!blob) { setError("Unable to export the edited image. Please try again."); return; }
      if (blob.size > 10 * 1024 * 1024) { setError("Edited PNG exceeds 10 MB. Please use a smaller source image."); return; }
      onApply(new File([blob], `manual-cover-${Date.now()}.png`, { type: "image/png" }));
    }, "image/png");
  };
  const busy = disabled || saving;
  const button = "px-3 py-2 rounded-lg border text-xs font-semibold text-[#852BAF] disabled:opacity-40 cursor-pointer";
  return <div className="mt-4 p-4 rounded-xl border border-purple-100 space-y-3">
    <p className="text-sm font-semibold text-gray-700">Manual image preparation</p>
    <p className="text-xs text-gray-500">Upload a prepared transparent PNG/WebP, or erase the background below. Resizing alone does not remove a photo’s background. The canvas shows the current result.</p>
    <div className="flex flex-wrap items-center gap-2">
      {(["erase", "restore", "pan"] as const).map(value => <button type="button" key={value} disabled={busy || !ready}
        aria-pressed={tool === value} className={`${button} ${tool === value ? "bg-purple-50" : ""}`}
        onClick={() => setTool(value)}>{value === "erase" ? "Erase" : value === "restore" ? "Restore" : "Pan"}</button>)}
      <label className="text-xs text-gray-600">Brush size <input type="range" min="8" max="160" value={brush}
        disabled={busy} onChange={event => setBrush(Number(event.target.value))} /></label>
      <label className="text-xs text-gray-600">Zoom <input type="range" min="1" max="4" step="0.25" value={zoom}
        disabled={busy} onChange={event => setZoom(Number(event.target.value))} /></label>
    </div>
    <div ref={viewport} className="overflow-auto max-h-96 rounded-lg border bg-white"
      style={{ backgroundImage: "conic-gradient(#eef0f3 25%, #fff 0 50%, #eef0f3 0 75%, #fff 0)", backgroundSize: "20px 20px" }}>
      <canvas ref={canvas} aria-label="Manual cover image canvas" onPointerDown={start} onPointerMove={move}
        onPointerUp={() => { stroke.current = null; }} onPointerCancel={() => { stroke.current = null; }}
        onLostPointerCapture={() => { stroke.current = null; }}
        style={{ width: `${zoom * 100}%`, maxWidth: "none", height: "auto", display: "block", touchAction: "none", cursor: tool === "pan" ? "grab" : "crosshair" }} />
    </div>
    {!ready && !error && <p role="status" className="text-xs text-gray-500">Opening image...</p>}
    {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} disabled={busy || !undo.current.length} onClick={() => history(true)}>Undo</button>
      <button type="button" className={button} disabled={busy || !redo.current.length} onClick={() => history(false)}>Redo</button>
      <button type="button" className={button} disabled={busy || !ready} onClick={() => { if (edited.current && original.current) { snapshot(); edited.current.data.set(original.current.data); refresh(); } }}>Reset</button>
      <button type="button" className={`${button} bg-purple-50`} disabled={busy || !ready} onClick={apply}>Apply &amp; Prepare Image</button>
      <button type="button" className={button} disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
    <p className="text-xs text-gray-400">Up to four undo steps. Editing resolution is capped at 1800 pixels on the longest side.</p>
  </div>;
}
