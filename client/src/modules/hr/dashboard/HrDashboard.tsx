import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowRight, FiAward, FiBriefcase, FiClock, FiGift, FiPlus, FiUserCheck, FiUserPlus, FiUsers } from "react-icons/fi";
import { useAuth } from "../../../common/auth/useAuth";
import { hrApi } from "../../../common/api/hrApi";
import { Card, CardHeader, EmptyState, Initials, LoadingRow, PageHeader, Stat, StatStrip, StatusDot } from "../components/ui";
import { button, formatDate } from "../components/styles";

interface DashboardData {
  summary: {
    total_employees: number;
    active_employees: number;
    inactive_employees: number;
    pending_onboarding: number;
    departments: number;
  };
  department_distribution: Array<{ name: string; count: number }>;
  top_earners: Array<{
    id: number;
    name: string;
    role: string;
    department: string;
    total_rewards: number;
  }>;
  total_rewards_distributed: number;
  recent_employees: Array<{
    id: number;
    name: string;
    email: string;
    phone: string;
    department: string;
    role: string;
    status: "active" | "pending" | "inactive";
    created_at: string;
  }>;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function HrDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  useEffect(() => {
    hrApi
      .get("/employees/dashboard")
      .then((response) => setDashboard(response.data.data))
      .catch((error) => console.error("Unable to load HR dashboard:", error))
      .finally(() => setLoading(false));
  }, []);

  const summary = dashboard?.summary ?? {
    total_employees: 0,
    active_employees: 0,
    inactive_employees: 0,
    pending_onboarding: 0,
    departments: 0,
  };
  const departments = dashboard?.department_distribution || [];
  const largestDepartment = Math.max(...departments.map((department) => department.count), 1);
  const topEarners = dashboard?.top_earners || [];
  const recent = (dashboard?.recent_employees || []).slice(0, 5);
  const firstName = (user?.name || user?.email?.split("@")[0] || "").split(" ")[0];
  const employedShare = summary.total_employees
    ? Math.round((summary.active_employees / summary.total_employees) * 100)
    : 0;

  return (
    <>
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ""}`}
        description="Here's where your team stands today."
        actions={
          <Link to="/hr/onboarding" className={button.primary}>
            <FiPlus className="h-4 w-4" /> Add employee
          </Link>
        }
      />

      {loading ? (
        <Card><LoadingRow text="Loading your team…" /></Card>
      ) : (
        <>
          <StatStrip>
            <Stat label="Employees" value={summary.total_employees} note={`${summary.departments} departments`} icon={FiUsers} />
            <Stat label="Currently employed" value={summary.active_employees} note={`${employedShare}% of your roster`} icon={FiUserCheck} tone="green" />
            <Stat label="Not on the app yet" value={summary.pending_onboarding} note="Haven't activated their account" icon={FiClock} tone="amber" />
            <Stat label="Rewards given" value={`${(dashboard?.total_rewards_distributed || 0).toLocaleString()} pts`} note="All time" icon={FiGift} tone="pink" />
          </StatStrip>

          <div className="grid gap-6 lg:grid-cols-5">
            {/* Recent employees */}
            <Card className="lg:col-span-3">
              <CardHeader
                title="Recently added"
                icon={FiUserPlus}
                action={
                  <Link to="/hr/employees" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
                    All employees <FiArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              {recent.length === 0 ? (
                <EmptyState
                  title="No employees yet"
                  hint="Add your first employee and they'll show up here."
                  action={<Link to="/hr/onboarding" className={button.secondary}>Add employee</Link>}
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {recent.map((employee) => (
                    <li key={employee.id} className="flex items-center gap-3 px-5 py-3">
                      <Initials name={employee.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{employee.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {[employee.role, employee.department].filter(Boolean).join(" · ") || employee.email}
                        </p>
                      </div>
                      <div className="hidden text-right sm:block">
                        <StatusDot tone={employee.status === "active" ? "green" : "grey"}>
                          {employee.status === "active" ? "Employed" : "Inactive"}
                        </StatusDot>
                        <p className="text-xs text-slate-400">{formatDate(employee.created_at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Departments */}
            <Card className="lg:col-span-2">
              <CardHeader
                title="People by department"
                icon={FiBriefcase}
                action={<Link to="/hr/departments" className="text-sm text-slate-500 hover:text-slate-900">Manage</Link>}
              />
              {departments.length === 0 ? (
                <EmptyState title="No departments yet" hint="Departments help you reward whole teams at once." />
              ) : (
                <ul className="space-y-3 px-5 py-4">
                  {departments.map((department) => (
                    <li key={department.name}>
                      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                        <span className="truncate text-slate-700">{department.name}</span>
                        <span className="tabular-nums text-slate-500">{department.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-gradient-to-r from-[#852BAF] from-60% to-[#C13A8E]" style={{ width: `${(department.count / largestDepartment) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Top earners */}
            <Card className="lg:col-span-5">
              <CardHeader
                title="Most rewarded"
                icon={FiAward}
                tone="pink"
                description="Employees who have received the most points"
                action={<Link to="/hr/rewards" className="text-sm text-slate-500 hover:text-slate-900">Give a reward</Link>}
              />
              {topEarners.length === 0 ? (
                <EmptyState title="No rewards given yet" hint="Once you send points, the people who received the most will be listed here." />
              ) : (
                <ol className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0">
                  {topEarners.map((employee, index) => (
                    <li key={employee.id} className="flex items-center gap-3 border-slate-100 px-5 py-3 sm:border-b">
                      <span className="w-5 text-right text-sm tabular-nums text-slate-400">{index + 1}</span>
                      <Initials name={employee.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{employee.name}</p>
                        <p className="truncate text-xs text-slate-500">{employee.role || employee.department || "Employee"}</p>
                      </div>
                      <span className="text-sm font-medium tabular-nums text-slate-900">
                        {Number(employee.total_rewards || 0).toLocaleString()} pts
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
