import { FiChevronDown, FiLoader } from "react-icons/fi";
import "./enquiryStatus.css";

type Status = string;


export default function ServiceStatusSelect({ value, busy, disabled, label, onChange, options }: {
  options: string[];
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
      {[...new Set([value, ...options])].map(status => <option key={status} value={status} disabled={!options.includes(status)}>{status.replaceAll("_", " ")}</option>)}
    </select>
    {busy ? <FiLoader className="enquiry-status-chevron animate-spin" aria-hidden="true" /> : <FiChevronDown className="enquiry-status-chevron" aria-hidden="true" />}
    <span className="sr-only" role="status">{busy ? "Saving status..." : `Status: ${value.replaceAll("_", " ")}`}</span>
  </div>;
}
