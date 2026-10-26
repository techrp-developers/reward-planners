import { useRef, useState } from "react";
import { FiBell, FiLoader, FiMail } from "react-icons/fi";
import { FaWhatsapp } from "react-icons/fa";
import Swal from "sweetalert2";
import { api } from "../api/api";

interface Props {
  name: string;
  email: string | null;
  activated: boolean;
  endpoint?: string;
  activationWhatsAppEndpoint?: string;
  whatsappRecipient?: { recipientType: "customer" | "employee"; recipientId: number; companyId?: number };
  phone?: string | null;
}

export default function EmployeeContactActions({ name, email, activated, endpoint, activationWhatsAppEndpoint, whatsappRecipient, phone }: Props) {
  const [sendingReminder, setSendingReminder] = useState(false);
  const reminderInFlight = useRef(false);
  const reminderDisabledReason = activated ? "Account already activated" : !phone ? "No phone number" : !activationWhatsAppEndpoint ? "No linked employee record" : "";

  const sendActivationWhatsApp = async () => {
    if (reminderInFlight.current || reminderDisabledReason || !activationWhatsAppEndpoint) return;
    const confirm = await Swal.fire({
      titleText: "Send activation reminder?",
      text: `${name} (${phone}) will get the "pending account activation" WhatsApp message.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Send on WhatsApp",
      confirmButtonColor: "#059669",
    });
    if (!confirm.isConfirmed) return;
    reminderInFlight.current = true;
    setSendingReminder(true);
    try {
      const { data } = await api.post(activationWhatsAppEndpoint);
      await Swal.fire("WhatsApp sent", data.message || "Activation WhatsApp message sent.", "success");
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
      await Swal.fire("Unable to send WhatsApp", message || "Please try again later.", "error");
    } finally {
      reminderInFlight.current = false;
      setSendingReminder(false);
    }
  };

  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const whatsappInFlight = useRef(false);
  const sendWhatsApp = async () => {
    if (!whatsappRecipient || !phone || whatsappInFlight.current) return;
    whatsappInFlight.current = true;
    setSendingWhatsApp(true);
    try {
      const result = await Swal.fire({
        titleText: `WhatsApp ${name}`,
        text: `To: ${phone}. Send from Reward Planners. The user must have messaged us within the last 24 hours.`,
        input: "textarea",
        inputLabel: "Your message",
        inputPlaceholder: "Type your message…",
        inputAttributes: { maxlength: "4096", "aria-label": "WhatsApp message" },
        showCancelButton: true,
        confirmButtonText: "Send message",
        confirmButtonColor: "#059669",
        showLoaderOnConfirm: true,
        allowOutsideClick: () => !Swal.isLoading(),
        allowEscapeKey: () => !Swal.isLoading(),
        preConfirm: async (value: string) => {
          if (!value.trim()) {
            Swal.showValidationMessage("Please enter a message.");
            return false;
          }
          try {
            const { data } = await api.post("/manager/employee-directory/whatsapp", { ...whatsappRecipient, message: value.trim() });
            return data;
          } catch (error: unknown) {
            const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
            const validation = document.createElement("span");
            validation.textContent = message || "Unable to confirm sending. Check the Interakt inbox before retrying.";
            Swal.showValidationMessage(validation.innerHTML);
            return false;
          }
        },
      });
      if (result.isConfirmed) await Swal.fire("Message queued", result.value.message, "success");
    } finally {
      whatsappInFlight.current = false;
      setSendingWhatsApp(false);
    }
  };
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
    <button type="button" disabled={sendingReminder || !!reminderDisabledReason} onClick={() => void sendActivationWhatsApp()}
      title={reminderDisabledReason || (sendingReminder ? "Sending activation reminder..." : "Send activation reminder on WhatsApp")}
      aria-label={`Send activation reminder on WhatsApp to ${name}${reminderDisabledReason ? `: ${reminderDisabledReason}` : ""}`}
      className="relative cursor-pointer rounded-lg border border-amber-100 p-2 text-amber-600 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40">
      {sendingReminder ? <FiLoader className="animate-spin" /> : <><FaWhatsapp /><FiBell className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-white" /></>}
    </button>
    {whatsappRecipient && (
      <button type="button" disabled={sendingWhatsApp || !phone} onClick={() => void sendWhatsApp()}
        title={!phone ? "No phone number" : "Send WhatsApp message"}
        aria-label={`Send WhatsApp message to ${name}`}
        className="cursor-pointer rounded-lg border border-emerald-100 p-2 text-emerald-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40">
        {sendingWhatsApp ? <FiLoader className="animate-spin" /> : <FaWhatsapp />}
      </button>
    )}
  </span>;
}
