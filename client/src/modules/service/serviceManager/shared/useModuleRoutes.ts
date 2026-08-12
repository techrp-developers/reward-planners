import { useLocation } from "react-router-dom";
import { routes } from "../../../../routes";

// The Service Partner / Partner Manager screens are mounted under both
// /manager/* (Manager role, existing) and /service/* (new service_manager
// role). Rather than duplicating the pages, components resolve their own
// links from whichever tree they're currently rendered under.
export function useServicePartnerRoutes() {
  const { pathname } = useLocation();
  return pathname.startsWith("/service")
    ? routes.service.servicePartners
    : routes.manager.servicePartners;
}

export function usePartnerManagerRoutes() {
  const { pathname } = useLocation();
  return pathname.startsWith("/service")
    ? routes.service.partnerManagers
    : routes.manager.partnerManagers;
}

export function useServiceOperationsRoutes() {
  const { pathname } = useLocation();
  return pathname.startsWith("/service/")
    ? {
        enquiryDetail: routes.service.enquiryDetail,
        orderDetail: routes.service.orderDetail,
        cancellationDetail: routes.service.cancellationDetail,
      }
    : {
        enquiryDetail: routes.manager.services.details,
        orderDetail: routes.manager.services.service_order_details,
        cancellationDetail: routes.manager.services.cancellation_detail,
      };
}
