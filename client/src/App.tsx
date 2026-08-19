import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { routes } from "./routes";
import { Navigate } from "react-router-dom";
import { useAuth } from "./common/auth/useAuth.ts";

/* Auth */
const AuthLayout = lazy(() => import("./common/layouts/AuthLayout.tsx"));
const LoginPage = lazy(() => import("./common/auth/LoginPage.tsx"));
const RegisterPage = lazy(() => import("./common/auth/RegisterPage.tsx"));
const ForgotPassword = lazy(() => import("./common/auth/ForgotPassword.tsx"));
const ResetPassword = lazy(() => import("./common/auth/ResetPassword.tsx"));
const VerifyOtpPage = lazy(() => import("./common/auth/VerifyOtpPage.tsx"));
const ClientOnboarding = lazy(() => import("./modules/clientOnboarding/ClientOnboarding.tsx"));

/* Layouts */
const VendorLayout = lazy(() => import("./modules/products/vendor/VendorLayout.tsx"));
const ManagerLayout = lazy(() => import("./modules/products/vendorManager/ManagerLayout.tsx"));
const AdminLayout = lazy(() => import("./modules/admin/layout/AdminLayout.tsx"));
const HrLayout = lazy(() => import("./modules/hr/layout/HrLayout.tsx"));
const WarehouseLayout = lazy(() => import("./modules/warehouse_manager/layout/WarehouseLayout.tsx"));
const FleaMarketLayout = lazy(() => import("./modules/flea_market/layout/FleaMarketLayout.tsx"));
const ServiceLayout = lazy(() => import("./modules/service/serviceManager/ServiceLayout.tsx"));
const ServicePartnerLayout = lazy(() => import("./modules/service/servicePartner/ServicePartnerLayout.tsx"));

/* Dashboards */
const VendorDashboard = lazy(() => import("./modules/products/vendor/Dashboard.tsx"));
const ManagerDashboard = lazy(() => import("./modules/products/vendorManager/Dashboard.tsx"));
const ManagerEmployeeDirectory = lazy(
  () => import("./modules/products/vendorManager/employees/EmployeeDirectory.tsx"),
);
const ManagerCompanyEmployees = lazy(
  () => import("./modules/products/vendorManager/employees/CompanyEmployees.tsx"),
);
const HrDashboard = lazy(() => import("./modules/hr/dashboard/HrDashboard.tsx"));
const WarehouseDashboard = lazy(() => import("./modules/warehouse_manager/dashboard/WarehouseDashboard.tsx"));
const FleaMarketDashboard = lazy(() => import("./modules/flea_market/dashboard/FleaMarketDashboard.tsx"));
const FleaMarketBillingPage = lazy(() => import("./modules/flea_market/component/billing/BillingPage.tsx"));
const FleaMarketSchedulePage = lazy(() => import("./modules/flea_market/component/schedule/SchedulePage.tsx"));
const FleaMarketStockPage = lazy(() => import("./modules/flea_market/component/allocations/StockPage.tsx"));
const FleaMarketAllProductsPage = lazy(() => import("./modules/flea_market/component/products/AllProductsPage.tsx"));
const FleaMarketVendorSalesReportPage = lazy(
  () => import("./modules/flea_market/component/reports/VendorSalesReportPage.tsx"),
);
const FleaMarketPurchaseHistoryPage = lazy(
  () => import("./modules/flea_market/component/reports/PurchaseHistoryPage.tsx"),
);
const FleaMarketInvoiceDetailPage = lazy(
  () => import("./modules/flea_market/component/invoices/InvoiceDetailPage.tsx"),
);
const EmployeeOnboarding = lazy(() => import("./modules/hr/onboarding/EmployeeOnboarding.tsx"));
const EmployeeList = lazy(() => import("./modules/hr/employees/EmployeeList.tsx"));

const ProductApprovalList = lazy(() => import("./modules/products/vendorManager/ProductApprovalList.tsx"));
const CategoryManagement = lazy(() => import("./modules/products/vendorManager/category/Categories.tsx"));
const SubcategoryManagement = lazy(() => import("./modules/products/vendorManager/category/Subcategories.tsx"));
const DocumentManagement = lazy(() => import("./modules/products/vendorManager/document/DocumentAdd.tsx"));
const DocumentCategoryManagement = lazy(() => import("./modules/products/vendorManager/document/DocumentCategory.tsx"));
const SubSubCategoryManagement = lazy(() => import("./modules/products/vendorManager/category/Subsubcategories.tsx"));
const ProductViewPage = lazy(() => import("./modules/products/vendorManager/ProductViewPage.tsx"));
const Onboarding = lazy(() => import("./modules/products/vendor/Onboarding.tsx"));
const ChangePasswordPage = lazy(() => import("./common/auth/changePassword.tsx"));
const EditProfilePage = lazy(() => import("./common/auth/EditProfile.tsx"));
const ProductListingDynamic = lazy(() => import("./modules/products/screens/ProductAdd.tsx"));
const ProductManagerList = lazy(() => import("./modules/products/screens/ProductList.tsx"));
const ProductManage = lazy(() => import("./modules/products/screens/ProductManage.tsx"));
const ProductVariantEdit = lazy(() => import("./modules/products/screens/ProductVariantEdit.tsx"));
const ProductVariantImages = lazy(() => import("./modules/products/screens/ProductVariantImage.tsx"));
const EditProductPage = lazy(() => import("./modules/products/screens/ProductEdit.tsx"));
const ReviewProductPage = lazy(() => import("./modules/products/screens/ProductView.tsx"));
const VendorApprovalList = lazy(() => import("./modules/products/vendorManager/VendorApprovalList.tsx"));
const VendorApprovalForm = lazy(() => import("./modules/products/vendorManager/VendorApprovalForm.tsx"));
const AdminDashboard = lazy(() => import("./modules/admin/dashboard/AdminDashboard.tsx"));
const AdminServicesPage = lazy(() => import("./modules/admin/services/AdminServicesPage.tsx"));
const AdminVendorApprovalList = lazy(() => import("./modules/admin/vendors/AdminVendorApprovalList.tsx"));
const AdminVendorApprovalForm = lazy(() => import("./modules/admin/vendors/AdminVendorApprovalForm.tsx"));
const AdminProductApprovalList = lazy(() => import("./modules/admin/products/AdminProductApprovalList.tsx"));
const AdminProductViewPage = lazy(() => import("./modules/admin/products/AdminProductViewPage.tsx"));
const NotFoundPage = lazy(() => import("./common/auth/NotFound.tsx"));

// Vendor Orders
const OrderSummary = lazy(() => import("./modules/products/vendor/OrderSummary.tsx"));
const OrderDetail = lazy(() => import("./modules/products/vendor/OrderDetail.tsx"));
const VendorReportPage = lazy(() => import("./modules/products/vendor/reports/VendorReportPage.tsx"));
const VendorTutorialsFaq = lazy(() => import("./modules/products/vendor/tutorials/VendorTutorialsFaq.tsx"));

// Manager Order
const OrderList = lazy(() => import("./modules/products/vendorManager/order/OrderList.tsx"));
const OrderView = lazy(() => import("./modules/products/vendorManager/order/OrderView.tsx"));
const ManagerReportPage = lazy(() => import("./modules/products/vendorManager/reports/ManagerReportPage.tsx"));

// Service
const ServiceEnquiries = lazy(() => import("./modules/products/inHouseServices/ServiceEnquiries.tsx"));
const ServiceDetails = lazy(() => import("./modules/products/inHouseServices/ServiceDetails.tsx"));
const ServiceOrderList = lazy(() => import("./modules/products/inHouseServices/ServiceOrderList.tsx"));
const ServiceOrderView = lazy(() => import("./modules/products/inHouseServices/ServiceOrderView.tsx"));
const ServiceCancellationRequest = lazy(
  () => import("./modules/products/inHouseServices/ServiceCancellationRequest.tsx"),
);
const ServiceCancellationDetail = lazy(
  () => import("./modules/products/inHouseServices/ServiceCancellationDetail.tsx"),
);

// Manage Rewards
const RewardRule = lazy(() => import("./modules/products/vendorManager/reward/RewardRule.tsx"));
const RewardForm = lazy(() => import("./modules/products/vendorManager/reward/RewardForm.tsx"));
const ProductRewardMapping = lazy(() => import("./modules/products/vendorManager/reward/ProductRewardMapping.tsx"));

/* Attribute */
const AttributeManagement = lazy(() => import("./modules/products/vendorManager/attribute/attributes.tsx"));
const FlashSaleList = lazy(() => import("./modules/products/vendorManager/flashSale/FlashSaleList.tsx"));
const FlashSaleEditor = lazy(() => import("./modules/products/vendorManager/flashSale/FlashSaleEditor.tsx"));

/* Sales */
// import FlashSaleCreate from "./vendor/components/feature/manager/flashSale/FlashSaleCreate";
// import FlashSaleList from "./vendor/components/feature/manager/flashSale/FlashSaleList";
// import FlashSaleVariant from "./vendor/components/feature/manager/flashSale/FlashSaleVariant";

/* Order */
const CancellationRequest = lazy(() => import("./modules/products/vendorManager/order/CancellationRequest.tsx"));
const CancellationDetail = lazy(() => import("./modules/products/vendorManager/order/CancellationDetail.tsx"));
const ManageRewards = lazy(() => import("./modules/hr/rewards/ManageRewards.tsx"));

// Service Partners (Services vertical)
const ServicePartnerList = lazy(() => import("./modules/service/serviceManager/servicePartners/pages/ServicePartnerList.tsx"));
const ServicePartnerOnboard = lazy(() => import("./modules/service/serviceManager/servicePartners/pages/ServicePartnerOnboard.tsx"));
const ServicePartnerProfile = lazy(() => import("./modules/service/serviceManager/servicePartners/pages/ServicePartnerProfile.tsx"));
const PartnerManagerList = lazy(() => import("./modules/service/serviceManager/partnerManagers/pages/PartnerManagerList.tsx"));
const PartnerManagerOnboard = lazy(() => import("./modules/service/serviceManager/partnerManagers/pages/PartnerManagerOnboard.tsx"));
const ServiceDashboard = lazy(() => import("./modules/service/serviceManager/dashboard/pages/ServiceDashboard.tsx"));
const ServiceListingsPage = lazy(() => import("./modules/service/serviceManager/serviceListings/pages/ServiceListingsPage.tsx"));
const ServiceCatalogPage = lazy(() => import("./modules/service/serviceManager/serviceListings/pages/ServiceCatalogPage.tsx"));
const BookingsPage = lazy(() => import("./modules/service/serviceManager/bookings/pages/BookingsPage.tsx"));
const ServiceReportsPage = lazy(() => import("./modules/service/serviceManager/reports/pages/ServiceReportsPage.tsx"));
const ServiceSettingsPage = lazy(() => import("./modules/service/serviceManager/settings/pages/ServiceSettingsPage.tsx"));

// Service Partner self-service portal
const ServicePartnerDashboard = lazy(() => import("./modules/service/servicePartner/dashboard/pages/ServicePartnerDashboard.tsx"));
const MyProfile = lazy(() => import("./modules/service/servicePartner/profile/pages/MyProfile.tsx"));
const ServicePartnerOnboarding = lazy(() => import("./modules/service/servicePartner/profile/pages/ServicePartnerOnboarding.tsx"));
const MyServicesList = lazy(() => import("./modules/service/servicePartner/services/pages/MyServicesList.tsx"));
const MyServiceForm = lazy(() => import("./modules/service/servicePartner/services/pages/MyServiceForm.tsx"));
const RateCardPage = lazy(() => import("./modules/service/servicePartner/services/pages/RateCardPage.tsx"));
const BookingsList = lazy(() => import("./modules/service/servicePartner/bookings/pages/BookingsList.tsx"));
const BookingDetails = lazy(() => import("./modules/service/servicePartner/bookings/pages/BookingDetails.tsx"));
const ReviewsList = lazy(() => import("./modules/service/servicePartner/reviews/pages/ReviewsList.tsx"));
const DocumentsPage = lazy(() => import("./modules/service/servicePartner/documents/pages/DocumentsPage.tsx"));
const SettingsPage = lazy(() => import("./modules/service/servicePartner/settings/pages/SettingsPage.tsx"));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-12 h-12 border-[3px] border-transparent border-t-[#852BAF] border-r-[#FC3F78] rounded-full animate-spin" />
    </div>
  );
}

function resolveDashboardPath(role?: string) {
  switch (role) {
    case "vendor":
      return routes.vendor.dashboard;
    case "vendor_manager":
      return routes.manager.dashboard;
    case "warehouse_manager":
      return routes.warehouse.dashboard;
    case "hr":
      return routes.hr.dashboard;
    case "admin":
      return routes.admin.dashboard;
    case "service_manager":
      return routes.service.dashboard;
    case "service_partner":
      return routes.servicePartner.dashboard;
    case "flea_market_manager":
      return routes.fleaMarket.dashboard;
    default:
      return "/login";
  }
}

export default function App() {
  // const { user, loading } = useAuth();
  const { user, initializing } = useAuth();

  // if (loading ) {
  //   return null;
  // }

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-tr from-[#38bdf8] via-[#a855f7] to-[#ec4899]">
        <div className="px-8 py-6 text-center bg-white shadow-xl rounded-2xl">
          <div className="animate-spin h-8 w-8 mx-auto mb-3 rounded-full border-4 border-[#852BAF] border-t-transparent" />
          <p className="text-sm font-semibold text-gray-600">
            Preparing application...
          </p>
        </div>
      </div>
    );
  }
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
      {/* ========== ROOT ========== */}
      <Route
        path="/"
        element={
          <Navigate
            to={user ? resolveDashboardPath(user.role) : "/login"}
            replace
          />
        }
      />

      {/* ========== AUTH ========== */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-otp" element={<VerifyOtpPage />} />
        <Route path="/client-onboarding" element={<ClientOnboarding />} />
      </Route>

      {/* ========== VENDOR ========== */}
      <Route element={<VendorLayout />}>
        <Route path={routes.vendor.dashboard} element={<VendorDashboard />} />

        <Route path={routes.vendor.onboarding} element={<Onboarding />} />

        <Route
          path={routes.vendor.changePassword}
          element={<ChangePasswordPage />}
        />

        <Route path={routes.vendor.profile} element={<EditProfilePage />} />

        <Route
          path={routes.vendor.products.add}
          element={<ProductListingDynamic />}
        />

        <Route
          path={routes.vendor.products.list}
          element={<ProductManagerList />}
        />

        <Route
          path={routes.vendor.products.review}
          element={<ReviewProductPage />}
        />

        <Route
          path={routes.vendor.products.edit}
          element={<EditProductPage />}
        />

        {/* Manage Product page */}
        <Route
          path={routes.vendor.products.manageProduct}
          element={<ProductManage />}
        />

        {/* Variant Edit */}
        <Route
          path={routes.vendor.products.variantEdit}
          element={<ProductVariantEdit />}
        />

        {/* Variant Image */}
        <Route
          path={routes.vendor.products.variantImage}
          element={<ProductVariantImages />}
        />

        <Route
          path={routes.vendor.productManagerList}
          element={<ProductManagerList />}
        />

        {/* Orders */}
        <Route path={routes.vendor.orders.summary} element={<OrderSummary />} />

        <Route path={routes.vendor.orders.details} element={<OrderDetail />} />
        <Route path={routes.vendor.reports.stock} element={<VendorReportPage type="stock" />} />
        <Route path={routes.vendor.reports.products} element={<VendorReportPage type="products" />} />
        <Route path={routes.vendor.reports.orders} element={<VendorReportPage type="orders" />} />
        <Route path={routes.vendor.tutorialsFaq} element={<VendorTutorialsFaq />} />

        <Route
          path={routes.vendor.fleaMarketPurchases}
          element={<Navigate to={`${routes.vendor.orders.summary}?tab=flea-market`} replace />}
        />
      </Route>

      {/* ========== MANAGER ========== */}
      <Route element={<ManagerLayout />}>
        <Route path={routes.manager.dashboard} element={<ManagerDashboard />} />
        <Route path={routes.manager.vendors} element={<VendorApprovalList />} />
        <Route path={routes.manager.employees} element={<ManagerEmployeeDirectory />} />
        <Route path={routes.manager.companyEmployees} element={<ManagerCompanyEmployees />} />
        <Route
          path={routes.manager.changePassword}
          element={<ChangePasswordPage />}
        />
        <Route path={routes.manager.profile} element={<EditProfilePage />} />
        <Route
          path={routes.manager.products}
          element={<ProductApprovalList />}
        />
        <Route
          path={routes.manager.productView}
          element={<ProductViewPage />}
        />
        <Route
          path={routes.manager.vendorReview}
          element={<VendorApprovalForm />}
        />

        {/* Category */}
        <Route
          path={routes.manager.categories}
          element={<CategoryManagement />}
        />
        <Route
          path={routes.manager.subcategories}
          element={<SubcategoryManagement />}
        />
        <Route
          path={routes.manager.subsubcategories}
          element={<SubSubCategoryManagement />}
        />

        {/* Document */}
        <Route
          path={routes.manager.addDocument}
          element={<DocumentManagement />}
        />

        <Route
          path={routes.manager.linkDocument}
          element={<DocumentCategoryManagement />}
        />

        {/* Attribute */}
        <Route
          path={routes.manager.attributes}
          element={<AttributeManagement />}
        />

        <Route path={routes.manager.flashSales.list} element={<FlashSaleList />} />
        <Route path={routes.manager.flashSales.create} element={<FlashSaleEditor />} />
        <Route path={routes.manager.flashSales.edit} element={<FlashSaleEditor />} />

        {/* Orders */}
        <Route path={routes.manager.orders.orderList} element={<OrderList />} />

        <Route path={routes.manager.orders.details} element={<OrderView />} />
        <Route path={routes.manager.reports.usage} element={<ManagerReportPage type="usage" />} />
        <Route path={routes.manager.reports.stock} element={<ManagerReportPage type="stock" />} />
        <Route path={routes.manager.reports.orders} element={<ManagerReportPage type="orders" />} />

        <Route
          path={routes.manager.orders.cancellationRequest}
          element={<CancellationRequest />}
        />

        <Route
          path={routes.manager.orders.cancellationDetail}
          element={<CancellationDetail />}
        />

        {/* Rewards */}
        <Route
          path={routes.manager.rewards.rewardRule}
          element={<RewardRule />}
        />

        <Route
          path={routes.manager.rewards.rewardRule}
          element={<RewardRule />}
        />

        <Route path={routes.manager.rewards.create} element={<RewardForm />} />

        <Route path={routes.manager.rewards.edit} element={<RewardForm />} />

        <Route
          path={routes.manager.rewards.mapping}
          element={<ProductRewardMapping />}
        />

      </Route>

      {/* ========== ADMIN ========== */}
      <Route element={<AdminLayout />}>
        <Route path={routes.admin.dashboard} element={<AdminDashboard />} />
        <Route
          path={routes.admin.vendors}
          element={<AdminVendorApprovalList />}
        />
        <Route
          path={routes.admin.changePassword}
          element={<ChangePasswordPage />}
        />
        <Route path={routes.admin.profile} element={<EditProfilePage />} />
        <Route
          path={routes.admin.products}
          element={<AdminProductApprovalList />}
        />
        <Route
          path={routes.admin.productView}
          element={<AdminProductViewPage />}
        />
        <Route
          path={routes.admin.vendorReview}
          element={<AdminVendorApprovalForm />}
        />
        <Route path={routes.admin.services} element={<AdminServicesPage />} />
      </Route>

      {/* ========== SERVICES ========== */}
      <Route element={<ServiceLayout />}>
        <Route path={routes.service.dashboard} element={<ServiceDashboard />} />
        <Route path={routes.service.profile} element={<EditProfilePage />} />
        <Route path={routes.service.changePassword} element={<ChangePasswordPage />} />
        <Route path={routes.service.catalog} element={<ServiceCatalogPage />} />
        <Route path={routes.service.enquiries} element={<ServiceEnquiries />} />
        <Route path={routes.service.enquiryDetail} element={<ServiceDetails />} />
        <Route path={routes.service.orders} element={<ServiceOrderList />} />
        <Route path={routes.service.orderDetail} element={<ServiceOrderView />} />
        <Route path={routes.service.cancellations} element={<ServiceCancellationRequest />} />
        <Route path={routes.service.cancellationDetail} element={<ServiceCancellationDetail />} />

        {/* Service Partners */}
        <Route
          path={routes.service.servicePartners.list}
          element={<ServicePartnerList />}
        />
        <Route
          path={routes.service.servicePartners.onboard}
          element={<ServicePartnerOnboard />}
        />
        <Route
          path={routes.service.servicePartners.edit}
          element={<ServicePartnerOnboard />}
        />
        <Route
          path={routes.service.servicePartners.profile}
          element={<ServicePartnerProfile />}
        />

        {/* Partner Managers */}
        <Route
          path={routes.service.partnerManagers.list}
          element={<PartnerManagerList />}
        />
        <Route
          path={routes.service.partnerManagers.onboard}
          element={<PartnerManagerOnboard />}
        />
        <Route
          path={routes.service.partnerManagers.edit}
          element={<PartnerManagerOnboard />}
        />

        <Route path={routes.service.serviceListings} element={<ServiceListingsPage />} />
        <Route path={routes.service.bookings} element={<BookingsPage />} />
        <Route path={routes.service.reports} element={<ServiceReportsPage />} />
        <Route path={routes.service.settings} element={<ServiceSettingsPage />} />
      </Route>

      {/* ========== SERVICE PARTNER (self-service portal) ========== */}
      <Route element={<ServicePartnerLayout />}>
        <Route
          path={routes.servicePartner.dashboard}
          element={<ServicePartnerDashboard />}
        />
        <Route
          path={routes.servicePartner.onboarding}
          element={<ServicePartnerOnboarding />}
        />
        <Route
          path={routes.servicePartner.changePassword}
          element={<ChangePasswordPage />}
        />
        <Route path={routes.servicePartner.profile} element={<MyProfile />} />

        {/* My Services */}
        <Route
          path={routes.servicePartner.services.list}
          element={<MyServicesList />}
        />
        <Route
          path={routes.servicePartner.services.add}
          element={<MyServiceForm />}
        />
        <Route
          path={routes.servicePartner.services.edit}
          element={<MyServiceForm />}
        />

        <Route path={routes.servicePartner.rateCard} element={<RateCardPage />} />

        {/* Bookings */}
        <Route
          path={routes.servicePartner.bookings.list}
          element={<BookingsList />}
        />
        <Route
          path={routes.servicePartner.bookings.details}
          element={<BookingDetails />}
        />

        <Route path={routes.servicePartner.reviews} element={<ReviewsList />} />
        <Route path={routes.servicePartner.documents} element={<DocumentsPage />} />
        <Route path={routes.servicePartner.settings} element={<SettingsPage />} />
      </Route>

      {/* ========== WAREHOUSE ========== */}
      <Route element={<WarehouseLayout />}>
        <Route
          path={routes.warehouse.dashboard}
          element={<WarehouseDashboard />}
        />
        <Route
          path={routes.warehouse.changePassword}
          element={<ChangePasswordPage />}
        />
        <Route path={routes.warehouse.profile} element={<EditProfilePage />} />
      </Route>

      {/* ========== FLEA MARKET ========== */}
      <Route element={<FleaMarketLayout />}>
        <Route
          path={routes.fleaMarket.dashboard}
          element={<FleaMarketDashboard />}
        />
        <Route
          path={routes.fleaMarket.changePassword}
          element={<ChangePasswordPage />}
        />
        <Route path={routes.fleaMarket.profile} element={<EditProfilePage />} />
        <Route
          path={routes.fleaMarket.manageEvent}
          element={<FleaMarketSchedulePage />}
        />
        <Route
          path={routes.fleaMarket.billing.page}
          element={<FleaMarketBillingPage />}
        />
        <Route
          path={routes.fleaMarket.stock}
          element={<FleaMarketStockPage />}
        />
        <Route
          path={routes.fleaMarket.allProducts}
          element={<FleaMarketAllProductsPage />}
        />
        <Route
          path={routes.fleaMarket.reports.vendorSales}
          element={<FleaMarketVendorSalesReportPage />}
        />
        <Route
          path={routes.fleaMarket.reports.purchaseHistory}
          element={<FleaMarketPurchaseHistoryPage />}
        />
        <Route
          path={routes.fleaMarket.invoices.detail}
          element={<FleaMarketInvoiceDetailPage />}
        />
      </Route>

      {/* ========== HR ========== */}
      <Route element={<HrLayout />}>
        <Route path={routes.hr.dashboard} element={<HrDashboard />} />
        <Route path={routes.hr.onboarding} element={<EmployeeOnboarding />} />
        <Route path={routes.hr.employees} element={<EmployeeList />} />
        <Route
          path={routes.hr.changePassword}
          element={<ChangePasswordPage />}
        />
        <Route path={routes.hr.profile} element={<EditProfilePage />} />
        <Route path={routes.hr.rewards} element={<ManageRewards />} />
      </Route>

      {/* ========== FALLBACK ========== */}
      <Route
        path="*"
        element={user ? <NotFoundPage /> : <Navigate to="/login" replace />}
      />
      </Routes>
    </Suspense>

);
}
