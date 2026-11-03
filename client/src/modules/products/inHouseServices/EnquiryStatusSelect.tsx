import { FiChevronDown, FiLoader } from "react-icons/fi";
import "./enquiryStatus.css";

type Status = "new" | "contacted" | "converted" | "closed";
const labels: Record<Status, string> = {
  new: "New", contacted: "Contacted", converted: "Converted", closed: "Closed",
};

export default function EnquiryStatusSelect({ value, busy, disabled, label, onChange }: {
  value: Status;
  busy: boolean;
  disabled?: boolean;
  label: string;
  onChange: (status: Status) => void;
}) {
  return <div className="enquiry-status-control" data-status={value} aria-busy={busy}>
    <span className="enquiry-status-dot" aria-hidden="true" />
    <select aria-label={label} value={value} disabled={busy || disabled}
      onChange={event => { if (event.target.value !== value) onChange(event.target.value as Status); }}>
      {Object.entries(labels).map(([status, text]) => <option key={status} value={status}>{text}</option>)}
    </select>
    {busy ? <FiLoader className="enquiry-status-chevron animate-spin" aria-hidden="true" /> : <FiChevronDown className="enquiry-status-chevron" aria-hidden="true" />}
    <span className="sr-only" role="status">{busy ? "Saving status..." : `Status: ${labels[value]}`}</span>
  </div>;
}
