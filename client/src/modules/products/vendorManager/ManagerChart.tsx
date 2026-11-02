import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, Filler } from "chart.js";
import { Bar, Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, Filler);
export interface MonthlyMetric { month: string; vendors: number; products: number; orders: number; orderValue: number; }

// Chart.js paints to canvas, so these neutrals have to read on both portal themes.
const axisText = "#7c7689";
const gridLine = "rgba(148,163,184,.18)";

export default function DashboardCharts({ metrics }: { metrics: MonthlyMetric[] }) {
  const safeMetrics = Array.isArray(metrics) ? metrics : [];
  const labels = safeMetrics.map((item) => item.month);
  const options = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" as const, labels: { usePointStyle: true, boxWidth: 8, color: axisText } } }, scales: { y: { beginAtZero: true, grid: { color: gridLine }, ticks: { color: axisText } }, x: { grid: { display: false }, ticks: { color: axisText } } } };
  const activity = { labels, datasets: [{ label: "Vendors", data: safeMetrics.map((item) => item.vendors), borderColor: "#852BAF", backgroundColor: "rgba(133,43,175,.12)", fill: true, tension: .4 }, { label: "Products", data: safeMetrics.map((item) => item.products), borderColor: "#C13A8E", backgroundColor: "rgba(193,58,142,.1)", fill: true, tension: .4 }, { label: "Orders", data: safeMetrics.map((item) => item.orders), borderColor: "#10B981", backgroundColor: "rgba(16,185,129,.08)", fill: true, tension: .4 }] };
  const value = { labels, datasets: [{ label: "Gross order value (₹)", data: safeMetrics.map((item) => item.orderValue), backgroundColor: "#852BAF", borderRadius: 6, maxBarThickness: 34 }] };
  return <div className="grid gap-6 lg:grid-cols-5"><section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-3"><h2 className="font-semibold text-gray-900">Module activity</h2><p className="mt-0.5 text-xs text-gray-500">New vendors, products, and orders over the last six months</p><div className="mt-5 h-72">{safeMetrics.length ? <Line data={activity} options={options} /> : <div className="grid h-full place-items-center text-sm text-gray-400">No activity yet</div>}</div></section><section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-2"><h2 className="font-semibold text-gray-900">Order value</h2><p className="mt-0.5 text-xs text-gray-500">Non-cancelled gross order value by month</p><div className="mt-5 h-72">{safeMetrics.length ? <Bar data={value} options={options} /> : <div className="grid h-full place-items-center text-sm text-gray-400">No order value yet</div>}</div></section></div>;
}
