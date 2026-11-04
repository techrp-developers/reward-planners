import { Link } from "react-router-dom";
import { FiLock } from "react-icons/fi";
import { useAuth } from "../../../common/auth/useAuth";
import { routes } from "../../../routes";

const HOME_BY_ROLE: Record<string, string> = {
  admin: routes.admin.dashboard,
  rm: routes.rm.dashboard,
};

/**
 * Shown when someone other than a relationship manager reaches the Push
 * Notification Manager (an old bookmark, a typed URL, or a 403 from the API).
 * The server enforces the rule; this page only explains it.
 */
export default function NotificationAccessDenied() {
  const { user } = useAuth();
  const home = (user?.role && HOME_BY_ROLE[user.role]) || "/";
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4" role="alert" aria-labelledby="notification-access-denied">
      <div className="max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-purple-50 text-2xl text-[#852BAF]"><FiLock /></span>
        <h1 id="notification-access-denied" className="text-xl font-extrabold text-gray-900">Access denied</h1>
        <p className="mt-2 text-sm text-gray-600">
          The Push Notification Manager is available to relationship managers only. Your other dashboard features are unchanged.
        </p>
        <Link to={home} className="mt-6 inline-flex rounded-xl bg-[#852BAF] px-4 py-2 text-sm font-bold text-white hover:opacity-90">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
