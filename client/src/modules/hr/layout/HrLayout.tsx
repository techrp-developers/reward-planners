import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../../common/auth/useAuth";
import PremiumPortalShell from "../../../common/layouts/PremiumPortalShell";
import HrNavbar from "./HrSidebar";
import { useQuery } from "@tanstack/react-query";
import { hrApi } from "../../../common/api/hrApi";

export default function HrLayout() {
  const { user, loading } = useAuth();
  const { data: company } = useQuery({
    queryKey: ["hr-company-branding", user?.email],
    enabled: !loading && user?.role === "hr",
    queryFn: async () => {
      const response = await hrApi.get("/employees/company-profile");
      return response.data?.data as { company_name: string; company_logo: string | null } | null;
    },
  });
  if (loading) return null;
  if (!user || user.role !== "hr") return <Navigate to="/login" replace />;

  return (
    <PremiumPortalShell variant="plain" sidebar={<HrNavbar closeSidebar={() => undefined} />} roleLabel="HR Portal" userLabel={user.name || user.email} companyLogo={company?.company_logo} companyName={company?.company_name}>
      <div className="mx-auto max-w-7xl">
        <Outlet />
      </div>
    </PremiumPortalShell>
  );
}
