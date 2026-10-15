import { Navigate, Outlet } from "react-router-dom";
import RmSidebar from "./RmSidebar";
import { useAuth } from "../../common/auth/useAuth";
import PremiumPortalShell from "../../common/layouts/PremiumPortalShell";

export default function RmLayout() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user || user.role !== "rm") return <Navigate to="/login" replace />;

  return (
    <>
      <style>{`
        .rm-portal button:not(:disabled),
        .rm-portal a,
        .rm-portal select:not(:disabled),
        .rm-portal summary,
        .rm-portal label[for],
        .rm-portal label:has(input[type="file"]),
        .rm-portal label:has(input[type="checkbox"]),
        .rm-portal label:has(input[type="radio"]),
        .premium-role-sidebar button:not(:disabled),
        .premium-role-sidebar a,
        .premium-role-sidebar summary {
          cursor: pointer;
        }

        .rm-portal button:disabled,
        .rm-portal select:disabled,
        .premium-role-sidebar button:disabled {
          cursor: not-allowed;
        }
      `}</style>
      <PremiumPortalShell sidebar={<RmSidebar />} roleLabel="RM workspace" userLabel={user.name || user.email}>
        <div className="rm-portal">
          <Outlet />
        </div>
      </PremiumPortalShell>
    </>
  );
}
