import { useEffect, useRef, useState } from "react";
import { HexColorInput, HexColorPicker } from "react-colorful";
import { FiX } from "react-icons/fi";

interface Props {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}

export default function ColorPickerField({ label, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const swatchColor = value || "#e2e8f0";

  return (
    <div ref={wrapperRef} className="relative">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="h-9 w-9 shrink-0 rounded-lg border border-slate-200"
          style={{ background: swatchColor }}
          aria-label={`Pick ${label}`}
        />
        <HexColorInput
          color={value || ""}
          onChange={(hex) => onChange(hex)}
          prefixed
          placeholder="#RRGGBB"
          className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            title={`Clear ${label}`}
            className="rounded-lg border border-red-100 bg-red-50 p-1.5 text-red-500 hover:bg-red-100"
          >
            <FiX size={12} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-10 mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <HexColorPicker color={value || "#852BAF"} onChange={(hex) => onChange(hex)} />
        </div>
      )}
    </div>
  );
}
