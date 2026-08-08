import { useState } from "react";
import { FiChevronDown, FiPrinter } from "react-icons/fi";
import type { LabelPrintFormat } from "../../api/fleaMarketLabelsApi";

interface PrintLabelButtonProps {
  label: string;
  getUrl: (format: LabelPrintFormat) => string;
  variant?: "compact" | "primary";
}

// Opens the PDF in a new tab with `inline` disposition — the browser's own
// PDF viewer handles print/download from there, no client-side PDF library
// needed. Small format dropdown since thermal-roll vs A4-sheet printers are
// physically different jobs, not a preference worth hiding behind a default.
function PrintLabelButton({ label, getUrl, variant = "compact" }: PrintLabelButtonProps) {
  const [open, setOpen] = useState(false);

  const handlePrint = (format: LabelPrintFormat) => {
    window.open(getUrl(format), "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  const buttonClass =
    variant === "primary"
      ? "flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88] shadow-md shadow-purple-500/20"
      : "flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-800";

  return (
    <div className="relative inline-block">
      <button type="button" onClick={() => setOpen((prev) => !prev)} className={buttonClass}>
        <FiPrinter className={variant === "primary" ? "w-4 h-4" : "w-3.5 h-3.5"} />
        {label}
        <FiChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 overflow-hidden bg-white border border-gray-100 shadow-lg w-36 rounded-xl">
            <button
              type="button"
              onClick={() => handlePrint("thermal")}
              className="block w-full px-3 py-2 text-xs font-semibold text-left text-gray-700 hover:bg-gray-50"
            >
              Thermal Label
            </button>
            <button
              type="button"
              onClick={() => handlePrint("a4sheet")}
              className="block w-full px-3 py-2 text-xs font-semibold text-left text-gray-700 hover:bg-gray-50"
            >
              A4 Sheet
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default PrintLabelButton;
