import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip,
  Legend
);

export default function DashboardCharts() {
  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

  const revenueData = {
    labels,
    datasets: [
      {
        label: 'Revenue (₹)',
        data: [120000, 190000, 150000, 220000, 180000, 260000],
        backgroundColor: '#8B5CF6',
        borderRadius: 12,
      },
    ],
  };

  const growthData = {
    labels,
    datasets: [
      {
        label: 'Vendors',
        data: [12, 18, 25, 30, 38, 45],
        borderColor: '#EC4899',
        backgroundColor: '#EC4899',
        tension: 0.4,
      },
      {
        label: 'Products',
        data: [200, 420, 650, 890, 1120, 1400],
        borderColor: '#10B981',
        backgroundColor: '#10B981',
        tension: 0.4,
      },
    ],
  };

  const categorySplit = {
    labels: ['Electronics', 'Fashion', 'Home', 'Beauty'],
    datasets: [
      {
        data: [35, 25, 20, 20],
        backgroundColor: ['#8B5CF6', '#EC4899', '#10B981', '#F59E0B'],
      },
    ],
  };

  return (
    <div className="grid grid-cols-1 gap-6 mt-10 lg:grid-cols-3">
      {/* Revenue */}
      <div className="p-6 bg-white shadow rounded-2xl">
        <h3 className="mb-4 font-semibold text-gray-900">Monthly Revenue</h3>
        <Bar data={revenueData} height={220} />
      </div>

      {/* Growth */}
      <div className="p-6 bg-white shadow rounded-2xl">
        <h3 className="mb-4 font-semibold text-gray-900">Growth Trend</h3>
        <Line data={growthData} height={220} />
      </div>

      {/* Category Split */}
      <div className="p-6 bg-white shadow rounded-2xl">
        <h3 className="mb-4 font-semibold text-gray-900">Category Split</h3>
        <Doughnut data={categorySplit} />
      </div>
    </div>
  );
}
