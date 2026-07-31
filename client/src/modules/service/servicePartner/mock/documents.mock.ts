import type { DocumentItem } from "../types";

export const documentsMock: DocumentItem[] = [
  { key: "gstCertificate", label: "GST Certificate", fileName: "gst-certificate.pdf", uploadedOn: "2026-01-10", url: null },
  { key: "panCard", label: "PAN Card", fileName: "pan-card.pdf", uploadedOn: "2026-01-10", url: null },
  { key: "agreement", label: "Agreement", fileName: "partner-agreement.pdf", uploadedOn: "2026-01-12", url: null },
  { key: "cancelledCheque", label: "Cancelled Cheque", fileName: "cancelled-cheque.jpg", uploadedOn: "2026-01-12", url: null },
  { key: "bankDetails", label: "Bank Details", fileName: null, uploadedOn: null, url: null },
  { key: "aadhaar", label: "Aadhaar", fileName: null, uploadedOn: null, url: null },
  { key: "passport", label: "Passport", fileName: null, uploadedOn: null, url: null },
];
