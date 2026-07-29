import { FiAward, FiBarChart2, FiPackage, FiShoppingCart } from "react-icons/fi";
import type { VendorSalesSummary } from "../../api/fleaMarketReportsApi";

interface VendorSalesSummaryCardsProps {
  summary: VendorSalesSummary;
}

const formatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});

function SummaryCard({
  label,
  value,
  Icon,
}: {
  label: string;
  value: string;
  Icon: React.ElementType;
}) {
  return (
    <div className="p-4 bg-white border border-gray-100 shadow-sm rounded-xl">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold tracking-wide text-gray-400 uppercase">{label}</p>
        <Icon className="w-4 h-4 text-purple-600" />
      </div>
      <p className="mt-3 text-2xl font-black text-gray-900">{value}</p>
    </div>
  );
}

export default function VendorSalesSummaryCards({ summary }: VendorSalesSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        label="Total Revenue"
        value={`Rs ${formatter.format(summary.totalGrossRevenue)}`}
        Icon={FiBarChart2}
      />
      <SummaryCard label="Total Units Sold" value={formatter.format(summary.totalSold)} Icon={FiShoppingCart} />
      <SummaryCard
        label="Points Redeemed"
        value={`${formatter.format(summary.totalPointsRedeemed)} pts`}
        Icon={FiAward}
      />
      <SummaryCard label="Sell-Through Rate" value={`${summary.sellThroughPct}%`} Icon={FiPackage} />
    </div>
  );
}
