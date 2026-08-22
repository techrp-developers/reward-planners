import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, Filler } from "chart.js";
import { Bar, Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, Filler);
export interface MonthlyMetric { month: string; vendors: number; products: number; orders: number; orderValue: number; }

export default function DashboardCharts({ metrics }: { metrics: MonthlyMetric[] }) {
  const labels = metrics.map((item) => item.month);
  const options = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" as const, labels: { usePointStyle: true, boxWidth: 8 } } }, scales: { y: { beginAtZero: true, grid: { color: "#f3f4f6" } }, x: { grid: { display: false } } } };
  const activity = { labels, datasets: [{ label: "Vendors", data: metrics.map((item) => item.vendors), borderColor: "#852BAF", backgroundColor: "rgba(133,43,175,.12)", fill: true, tension: .4 }, { label: "Products", data: metrics.map((item) => item.products), borderColor: "#FC3F78", backgroundColor: "rgba(252,63,120,.1)", fill: true, tension: .4 }, { label: "Orders", data: metrics.map((item) => item.orders), borderColor: "#10B981", backgroundColor: "rgba(16,185,129,.08)", fill: true, tension: .4 }] };
  const value = { labels, datasets: [{ label: "Gross order value (₹)", data: metrics.map((item) => item.orderValue), backgroundColor: "#852BAF", borderRadius: 8, maxBarThickness: 34 }] };
  return <div className="grid gap-6 lg:grid-cols-5"><section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-3"><h2 className="font-extrabold text-gray-900">Module activity</h2><p className="mt-1 text-xs text-gray-500">New vendors, products, and orders over the last six months</p><div className="mt-5 h-72">{metrics.length ? <Line data={activity} options={options} /> : <div className="grid h-full place-items-center text-sm text-gray-400">No activity yet</div>}</div></section><section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-2"><h2 className="font-extrabold text-gray-900">Order value</h2><p className="mt-1 text-xs text-gray-500">Non-cancelled gross order value by month</p><div className="mt-5 h-72">{metrics.length ? <Bar data={value} options={options} /> : <div className="grid h-full place-items-center text-sm text-gray-400">No order value yet</div>}</div></section></div>;
}
