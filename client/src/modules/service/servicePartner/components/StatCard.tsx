interface Props {
  title: string;
  value: string;
  Icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  trend?: string;
  trendColor?: string;
  delayMs?: number;
}

export default function StatCard({
  title,
  value,
  Icon,
  color,
  bg,
  border,
  trend = "—",
  trendColor = "bg-gray-50 text-gray-500",
  delayMs = 0,
}: Props) {
  return (
    <div
      className="p-6 bg-white cursor-default stats-card-enter rounded-2xl vendor-section-card group"
      style={{ animationDelay: `${delayMs}ms`, border: `1px solid ${border}`, boxShadow: "0 2px 16px rgba(133,43,175,0.04)" }}
    >
      <div className="flex items-start justify-between">
        <div className={`p-3 rounded-2xl ${bg} ${color} group-hover:scale-110 transition-transform duration-200`}>
          <Icon size={22} />
        </div>
        <span className={`text-xs font-bold px-2 py-1 rounded-lg ${trendColor}`}>{trend}</span>
      </div>
      <div className="mt-4">
        <p className="text-xs font-bold tracking-widest text-gray-400 uppercase">{title}</p>
        <h3 className="mt-1 text-2xl font-extrabold text-gray-800 stat-value-pop" style={{ animationDelay: `${delayMs + 120}ms` }}>
          {value}
        </h3>
      </div>
    </div>
  );
}
