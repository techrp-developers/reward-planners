import { memo, useCallback, useEffect, useState } from "react";
import { FiAward, FiCheckCircle, FiDownload, FiMail, FiPhone, FiPlusCircle, FiPrinter } from "react-icons/fi";
import type { CheckoutInvoiceSummary } from "../../api/fleaMarketCheckoutApi";
import { downloadInvoicePdf, emailInvoice, fetchInvoice, type InvoiceDetail } from "../../api/fleaMarketInvoiceApi";
import { maskEmail, maskPhone } from "../../utils/mask";
import RPlogo from "../../../../common/assets/logo.svg";
import Avatar from "../ui/Avatar";
import Spinner from "../ui/Spinner";
import { ErrorState } from "../ui/EmptyState";

/* ================= TYPES ================= */

interface InvoiceViewProps {
  invoices: CheckoutInvoiceSummary[];
  totalPointsRedeemed: number;
  totalAmountPaid: number;
  newWalletBalance: number;
  customer: { name: string; phone: string | null; email: string | null };
  onStartNewBill: () => void;
}

/* ================= COMPONENT ================= */

function InvoiceViewImpl({
  invoices,
  totalPointsRedeemed,
  totalAmountPaid,
  newWalletBalance,
  customer,
  onStartNewBill,
}: InvoiceViewProps) {
  const [activeInvoiceId, setActiveInvoiceId] = useState(invoices[0]?.invoiceId ?? null);
  const [details, setDetails] = useState<Record<number, InvoiceDetail>>({});
  const [loadingIds, setLoadingIds] = useState<Set<number>>(new Set());
  const [errorIds, setErrorIds] = useState<Set<number>>(new Set());
  const [pdfMessage, setPdfMessage] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  // Fetch itemized detail for every invoice in the batch up front — with 2-3
  // invoices typical for a multi-vendor cart, prefetching all is simpler than
  // lazy per-tab loading and the test plan expects every tab to render.
  useEffect(() => {
    invoices.forEach((invoice) => {
      setLoadingIds((prev) => new Set(prev).add(invoice.invoiceId));

      fetchInvoice(invoice.invoiceId)
        .then((detail) => {
          setDetails((prev) => ({ ...prev, [invoice.invoiceId]: detail }));
        })
        .catch((err) => {
          console.error(`Failed to fetch invoice ${invoice.invoiceId}:`, err);
          setErrorIds((prev) => new Set(prev).add(invoice.invoiceId));
        })
        .finally(() => {
          setLoadingIds((prev) => {
            const next = new Set(prev);
            next.delete(invoice.invoiceId);
            return next;
          });
        });
    });
    // invoices is stable for the lifetime of this view (one checkout result).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownloadPdf = useCallback(async () => {
    const invoice = invoices.find((item) => item.invoiceId === activeInvoiceId);
    if (!invoice) return;
    setPdfMessage("");
    try {
      await downloadInvoicePdf(invoice.invoiceId, invoice.invoiceNumber);
    } catch {
      setPdfMessage("Unable to download the invoice PDF right now.");
    }
  }, [activeInvoiceId, invoices]);

  const handleEmailInvoice = useCallback(async () => {
    if (!customer.email) {
      setPdfMessage("This customer has no email address on file.");
      return;
    }
    if (!activeInvoiceId) return;
    setSendingEmail(true);
    setPdfMessage("");
    try {
      setPdfMessage(await emailInvoice(activeInvoiceId));
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setPdfMessage(message || "Unable to email the invoice right now.");
    } finally {
      setSendingEmail(false);
    }
  }, [activeInvoiceId, customer.email]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const activeLoading = activeInvoiceId !== null && loadingIds.has(activeInvoiceId);
  const activeError = activeInvoiceId !== null && errorIds.has(activeInvoiceId);

  return (
    <div className="p-6 bg-white border border-gray-100 shadow-md rounded-2xl print:shadow-none print:border-0">
      {/* Success banner */}
      <div className="flex items-center gap-3 p-4 mb-6 border border-emerald-200 rounded-xl bg-emerald-50 print:hidden">
        <FiCheckCircle className="w-6 h-6 text-emerald-600 shrink-0" />
        <div>
          <p className="text-sm font-bold text-emerald-800">Payment successful</p>
          <p className="text-xs text-emerald-600">
            {invoices.length > 1
              ? `${invoices.length} invoices were generated for this cart (split by vendor).`
              : "The invoice is ready below."}
          </p>
        </div>
      </div>

      {/* Combined summary strip */}
      <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-3 print:hidden">
        <div className="p-4 border border-amber-100 rounded-xl bg-amber-50">
          <p className="flex items-center gap-2 text-xs font-bold tracking-wide uppercase text-amber-700">
            <FiAward className="w-3.5 h-3.5" />
            Points Redeemed
          </p>
          <p className="mt-2 text-lg font-black text-amber-800">{totalPointsRedeemed.toLocaleString()} pts</p>
        </div>
        <div className="p-4 border border-gray-100 rounded-xl">
          <p className="text-xs font-bold tracking-wide text-gray-400 uppercase">Total Amount Paid</p>
          <p className="mt-2 text-lg font-black text-gray-900">₹{totalAmountPaid.toLocaleString()}</p>
        </div>
        <div className="p-4 border border-gray-100 rounded-xl">
          <p className="text-xs font-bold tracking-wide text-gray-400 uppercase">New Wallet Balance</p>
          <p className="mt-2 text-lg font-black text-gray-900">{newWalletBalance.toLocaleString()} pts</p>
        </div>
      </div>

      {/* Customer */}
      <div className="p-3 mb-5 border border-gray-100 rounded-xl">
        <p className="text-[11px] font-bold tracking-wide text-gray-400 uppercase">Billed To</p>
        <p className="mt-1 text-sm font-bold text-gray-900">{customer.name}</p>
        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-500">
          {customer.phone && (
            <span className="flex items-center gap-1">
              <FiPhone className="w-3 h-3" />
              {maskPhone(customer.phone)}
            </span>
          )}
          {customer.email && (
            <span className="flex items-center gap-1">
              <FiMail className="w-3 h-3" />
              {maskEmail(customer.email)}
            </span>
          )}
        </div>
      </div>

      {/* Vendor invoice tabs */}
      {invoices.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4 print:hidden">
          {invoices.map((invoice, index) => (
            <button
              key={invoice.invoiceId}
              type="button"
              onClick={() => setActiveInvoiceId(invoice.invoiceId)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                activeInvoiceId === invoice.invoiceId
                  ? "bg-gradient-to-r from-[#852BAF] to-[#FC3F78] text-white border-transparent"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              Invoice {index + 1} · {invoice.invoiceNumber}
            </button>
          ))}
        </div>
      )}

      {invoices.map((invoice) => {
        if (invoice.invoiceId !== activeInvoiceId) return null;
        const detail = details[invoice.invoiceId];

        return (
          <div key={invoice.invoiceId}>
            <div className="flex flex-col items-start justify-between gap-4 pb-4 mb-4 border-b border-gray-100 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                {detail?.companyLogoUrl ? (
                  <img
                    src={detail.companyLogoUrl}
                    alt={detail.companyName ?? "Company logo"}
                    className="object-contain w-12 h-12 border border-gray-100 rounded-lg shrink-0"
                  />
                ) : (
                  <Avatar name={detail?.companyName ?? "Flea Market"} size="lg" variant="brand" />
                )}
                <div>
                  <p className="text-sm font-bold text-gray-900">{detail?.companyName ?? "Flea Market"}</p>
                  {detail?.vendorName && <p className="text-xs text-gray-400">Sold by {detail.vendorName}</p>}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="sm:text-right">
                  <p className="text-sm font-bold text-gray-900">Invoice {invoice.invoiceNumber}</p>
                  {detail && <p className="text-xs text-gray-400">{new Date(detail.issuedAt).toLocaleString()}</p>}
                </div>
                <div className="flex items-center gap-3 pl-4 border-l border-gray-100 shrink-0">
                  <img src={RPlogo} alt="Reward Planners" className="object-contain w-16 h-12" />
                  <span className="text-sm font-bold leading-tight text-purple-700">Reward Planners</span>
                </div>
              </div>
            </div>

            {activeLoading && (
              <div className="py-8">
                <Spinner label="Loading invoice detail..." />
              </div>
            )}

            {activeError && <ErrorState message="Unable to load this invoice's line items right now." />}

            {detail && !activeLoading && (
              <>
                <div className="overflow-x-auto border border-gray-100 rounded-xl">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr className="text-[11px] font-bold tracking-wider text-left text-gray-500 uppercase">
                        <th className="px-4 py-3">Product</th>
                        <th className="px-4 py-3">SKU</th>
                        <th className="px-4 py-3 text-center">Qty</th>
                        <th className="px-4 py-3 text-right">Unit Price</th>
                        <th className="px-4 py-3 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {detail.items.map((item) => (
                        <tr key={item.variantId}>
                          <td className="px-4 py-3 font-medium text-gray-800">{item.productName}</td>
                          <td className="px-4 py-3 text-gray-500">{item.sku}</td>
                          <td className="px-4 py-3 text-center text-gray-700">{item.quantity}</td>
                          <td className="px-4 py-3 text-right text-gray-700">₹{item.unitPrice.toLocaleString()}</td>
                          <td className="px-4 py-3 font-bold text-right text-gray-900">
                            ₹{item.lineTotal.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 mt-4 space-y-2 border border-gray-100 rounded-xl">
                  <div className="flex items-center justify-between text-sm">
                    <p className="text-gray-500">Subtotal</p>
                    <p className="font-medium text-gray-700">₹{detail.subtotal.toLocaleString()}</p>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <p className="text-amber-600">Points Redeemed</p>
                    <p className="font-medium text-amber-600">- {detail.pointsRedeemed.toLocaleString()} pts</p>
                  </div>
                  <div className="flex items-center justify-between pt-2 mt-2 text-sm border-t border-gray-100">
                    <p className="font-bold text-gray-900">Amount Paid</p>
                    <p className="text-lg font-black text-gray-900">₹{detail.amountPaid.toLocaleString()}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 mt-6 sm:flex-row print:hidden">
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    className="flex items-center justify-center flex-1 gap-2 py-2.5 text-sm font-bold text-purple-700 transition-colors border border-purple-200 rounded-xl hover:bg-purple-50"
                  >
                    <FiDownload className="w-4 h-4" />
                    Download PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleEmailInvoice()}
                    disabled={sendingEmail}
                    className="flex items-center justify-center flex-1 gap-2 py-2.5 text-sm font-bold text-purple-700 transition-colors border border-purple-200 rounded-xl hover:bg-purple-50 disabled:opacity-60"
                  >
                    <FiMail className="w-4 h-4" />
                    {sendingEmail ? "Sending..." : "Send Invoice"}
                  </button>
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="flex items-center justify-center flex-1 gap-2 py-2.5 text-sm font-bold text-gray-700 transition-colors border border-gray-200 rounded-xl hover:bg-gray-50"
                  >
                    <FiPrinter className="w-4 h-4" />
                    Print This Invoice
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}

      {pdfMessage && <p className="mt-3 text-xs text-center text-gray-400 print:hidden">{pdfMessage}</p>}

      <button
        type="button"
        onClick={onStartNewBill}
        className="flex items-center justify-center w-full gap-2 py-2.5 mt-6 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88] shadow-md shadow-purple-500/20 transition-all print:hidden"
      >
        <FiPlusCircle className="w-4 h-4" />
        Start Next Bill
      </button>
    </div>
  );
}

const InvoiceView = memo(InvoiceViewImpl);

export default InvoiceView;
