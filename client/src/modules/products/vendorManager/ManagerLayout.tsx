import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import ManagerNavbar from "./ManagerSidebar";
import { useAuth } from "../../../common/auth/useAuth";
import { api } from "../../../common/api/api";
import { routes } from "../../../routes";
import { useNotification } from "../../../common/notifications/useNotification";
import { startPollingWatcher } from "../../../common/notifications/pollingWatcher";
import PremiumPortalShell from "../../../common/layouts/PremiumPortalShell";

interface VendorListItem {
  vendor_id: number;
  company_name: string | null;
  full_name: string | null;
  status: string;
}

export default function ManagerLayout() {
  const { user, loading } = useAuth();
  const { addNotification } = useNotification();

  useEffect(() => {
    if (!user || user.role !== "vendor_manager") return;

    return startPollingWatcher<VendorListItem>({
      storageKey: `notif:watch:vendor_onboarding:${user.user_id}`,
      fetchItems: async () => {
        const res = await api.get("/manager/all-vendors");
        return res.data?.success ? res.data.data : [];
      },
      getId: (v) => v.vendor_id,
      isNotifiable: (v) => v.status === "sent_for_approval",
      onNewItems: (vendors) => {
        vendors.forEach((v) => {
          addNotification({
            category: "vendor_onboarding",
            priority: "medium",
            title: "🏢 Vendor Registration",
            message: `${v.company_name || v.full_name || "A vendor"} submitted an onboarding request`,
            link: routes.manager.vendors,
          });
        });
      },
    });
  }, [user?.user_id, user?.role, addNotification]);

  if (loading) return null;
  if (!user || user.role !== "vendor_manager") return <Navigate to="/login" replace />;

  return <PremiumPortalShell sidebar={<ManagerNavbar />} roleLabel="Vendor manager workspace" userLabel={user.name || user.email}><Outlet /></PremiumPortalShell>;
}
