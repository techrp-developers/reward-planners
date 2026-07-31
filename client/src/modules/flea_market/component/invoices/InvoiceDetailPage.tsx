import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FiArrowLeft, FiFileText } from "react-icons/fi";
import { routes } from "../../../../routes";
import { fetchReportInvoiceDetail } from "../../api/fleaMarketReportsApi";
import SectionCard from "../ui/SectionCard";
import { ErrorState } from "../ui/EmptyState";
import Spinner from "../ui/Spinner";

const currency = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export default function InvoiceDetailPage() {
  const invoiceId = Number(useParams().invoiceId);

  // This page is only ever reached from the manager-facing Purchase History
  // report, not the customer billing flow — so it must use the report-scoped
  // fetch (no customer OTP session exists here to authenticate the other one).
  const invoiceQuery = useQuery({
    queryKey: ["flea-market", "report-invoice", invoiceId],
    queryFn: () => fetchReportInvoiceDetail(invoiceId),
    enabled: Number.isInteger(invoiceId) && invoiceId > 0,
  });

  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    return <ErrorState message="Invalid invoice id." />;
  }

  if (invoiceQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner label="Loading invoice..." />
      </div>
    );
  }

  if (invoiceQuery.isError || !invoiceQuery.data) {
    return <ErrorState message="Unable to load invoice." onRetry={() => void invoiceQuery.refetch()} />;
  }

  const invoice = invoiceQuery.data;

  return (
    <div className="space-y-6">
      <Link
        to={routes.fleaMarket.reports.purchaseHistory}
        className="inline-flex items-center gap-2 text-sm font-bold text-purple-700"
      >
        <FiArrowLeft className="w-4 h-4" />
        Back to Purchase History
      </Link>

      <SectionCard
        icon={FiFileText}
        title={`Invoice ${invoice.invoiceNumber}`}
        subtitle={new Date(invoice.issuedAt).toLocaleString()}
        action={
          <div className="text-sm text-right">
            <p className="font-bold text-gray-900">{invoice.companyName ?? "Flea Market"}</p>
            {invoice.vendorName && <p className="text-gray-500">Sold by {invoice.vendorName}</p>}
          </div>
        }
      >
        <div className="overflow-x-auto border border-gray-100 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-[11px] font-bold tracking-wider text-left text-gray-500 uppercase">
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Unit Price</th>
                <th className="px-4 py-3 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoice.items.map((item) => (
                <tr key={`${item.productId}-${item.variantId}`}>
                  <td className="px-4 py-3 font-semibold text-gray-900">{item.productName}</td>
                  <td className="px-4 py-3 text-gray-500">{item.sku}</td>
                  <td className="px-4 py-3 text-right">{item.quantity}</td>
                  <td className="px-4 py-3 text-right">Rs {currency.format(item.unitPrice)}</td>
                  <td className="px-4 py-3 font-bold text-right text-gray-900">Rs {currency.format(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <section className="p-4 space-y-2 bg-white border border-gray-100 shadow-sm rounded-xl">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Subtotal</span>
          <span className="font-bold text-gray-900">Rs {currency.format(invoice.subtotal)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-amber-700">Points Redeemed</span>
          <span className="font-bold text-amber-700">{currency.format(invoice.pointsRedeemed)} pts</span>
        </div>
        <div className="flex items-center justify-between pt-2 text-sm border-t border-gray-100">
          <span className="font-black text-gray-900">Amount Paid</span>
          <span className="text-lg font-black text-gray-900">Rs {currency.format(invoice.amountPaid)}</span>
        </div>
      </section>
    </div>
  );
}
