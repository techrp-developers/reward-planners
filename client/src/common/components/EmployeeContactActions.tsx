import { useRef, useState } from "react";
import { FiLoader, FiMail } from "react-icons/fi";
import { FaWhatsapp } from "react-icons/fa";
import Swal from "sweetalert2";
import { api } from "../api/api";

interface Props {
  name: string;
  email: string | null;
  activated: boolean;
  endpoint?: string;
}

export default function EmployeeContactActions({ name, email, activated, endpoint }: Props) {
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const disabledReason = activated ? "Account already activated" : !email ? "No email address" : !endpoint ? "No linked employee record" : "";

  const sendEmail = async () => {
    if (inFlight.current || disabledReason || !endpoint) return;
    inFlight.current = true;
    setSending(true);
    try {
      const { data } = await api.post(endpoint);
      await Swal.fire("Email sent", data.message || "Activation email sent successfully.", "success");
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
      await Swal.fire("Unable to send email", message || "Please try again later.", "error");
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  return <span className="inline-flex shrink-0 items-center gap-1.5">
    <button type="button" disabled={sending || !!disabledReason} onClick={() => void sendEmail()}
      title={disabledReason || (sending ? "Sending activation email..." : "Send activation email")}
      aria-label={`Send activation email to ${name}${disabledReason ? `: ${disabledReason}` : ""}`}
      className="rounded-lg border border-purple-100 p-2 text-purple-700 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-40">
      {sending ? <FiLoader className="animate-spin" /> : <FiMail />}
    </button>
    <button type="button" disabled title="WhatsApp — Coming soon" aria-label={`WhatsApp ${name}: Coming soon`}
      className="cursor-not-allowed rounded-lg border border-emerald-100 p-2 text-emerald-600 opacity-40"><FaWhatsapp /></button>
  </span>;
}
