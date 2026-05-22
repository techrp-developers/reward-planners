import { Routes, Route } from "react-router-dom";
import { routes } from "./routes";
import { Navigate } from "react-router-dom";
import { useAuth } from "./auth/useAuth";

/* Auth */
import AuthLayout from "./layouts/AuthLayout";
import LoginPage from "./auth/LoginPage";
import RegisterPage from "./auth/RegisterPage";
import ForgotPassword from "./auth/ForgotPassword";
import ResetPassword from "./auth/ResetPassword";
import VerifyOtpPage from "./auth/VerifyOtpPage";

/* Layouts */
import VendorLayout from "./layouts/VendorLayout";
import ManagerLayout from "./layouts/ManagerLayout";
import AdminLayout from "./layouts/AdminLayout";
import HrLayout from "./layouts/HrLayout";

/* Dashboards */
import VendorDashboard from "./pages/vendor/Dashboard";
import ManagerDashboard from "./pages/vendor_manager/Dashboard";
import HrDashboard from "./pages/hr/Dashboard";
import EmployeeOnboarding from "./components/feature/hr/onboarding/EmployeeOnboarding.tsx";
import EmployeeList from "./components/feature/hr/EmployeeList.tsx";

import ProductApprovalList from "./components/feature/manager/product/ProductApprovalList";
import CategoryManagement from "./components/feature/manager/category/Categories";
import SubcategoryManagement from "./components/feature/manager/category/Subcategories";
import DocumentManagement from "./components/feature/manager/document/DocumentAdd";
import DocumentCategoryManagement from "./components/feature/manager/document/DocumentCategory";
import SubSubCategoryManagement from "./components/feature/manager/category/Subsubcategories";
import ProductViewPage from "./components/feature/manager/product/ProductViewPage";
import Onboarding from "./components/feature/vendor/onboarding/Onboarding";
import ChangePasswordPage from "./pages/changePassword";
import ProductListingDynamic from "./components/feature/vendor/products/ProductAdd";
import ProductManagerList from "./components/feature/vendor/products/ProductList";
import ProductManage from "./components/feature/vendor/products/ProductManage";
import ProductVariantEdit from "./components/feature/vendor/products/ProductVariantEdit";
import ProductVariantImages from "./components/feature/vendor/products/ProductVariantImage";
import EditProductPage from "./components/feature/vendor/products/ProductEdit";
import ReviewProductPage from "./components/feature/vendor/products/ProductView";
import VendorApprovalList from "./components/feature/manager/vendor/VendorApprovalList";
import VendorApprovalForm from "./components/feature/manager/vendor/VendorApprovalForm";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminServicesPage from "./pages/admin/Services.tsx";
import AdminVendorApprovalList from "./components/feature/admin/vendor/VendorApprovalList";
import AdminVendorApprovalForm from "./components/feature/admin/vendor/VendorApprovalForm";
import AdminProductApprovalList from "./components/feature/admin/product/ProductApprovalList";
import AdminProductViewPage from "./components/feature/admin/product/ProductViewPage";
import NotFoundPage from "./pages/NotFound";

// Vendor Orders
import OrderSummary from "./components/feature/vendor/orders/OrderSummary";
import OrderDetail from "./components/feature/vendor/orders/OrderDetail";

// Manager Order
import OrderList from "./components/feature/manager/order/OrderList";
import OrderView from "./components/feature/manager/order/OrderView";

// Manage Rewards
import RewardRule from "./components/feature/manager/reward/RewardRule";
import RewardForm from "./components/feature/manager/reward/RewardForm";
import ProductRewardMapping from "./components/feature/manager/reward/ProductRewardMapping";

/* Attribute */
import AttributeManagement from "./components/feature/manager/attribute/attributes";

/* Sales */
import FlashSaleCreate from "./components/feature/manager/flashSale/FlashSaleCreate";
import FlashSaleList from "./components/feature/manager/flashSale/FlashSaleList";
import FlashSaleVariant from "./components/feature/manager/flashSale/FlashSaleVariant";
import CancellationRequest from "./components/feature/manager/order/CancellationRequest";
import CancellationDetail from "./components/feature/manager/order/CancellationDetail";
import ManageRewards from "./components/feature/hr/ManageRewards.tsx";

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
    <Routes>
      {/* ========== AUTH ========== */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-otp" element={<VerifyOtpPage />} />
      </Route>

      {/* ========== VENDOR ========== */}
      <Route element={<VendorLayout />}>
        <Route path={routes.vendor.dashboard} element={<VendorDashboard />} />

        <Route path={routes.vendor.onboarding} element={<Onboarding />} />

        <Route
          path={routes.vendor.changePassword}
          element={<ChangePasswordPage />}
        />

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
      </Route>

      {/* ========== MANAGER ========== */}
      <Route element={<ManagerLayout />}>
        <Route path={routes.manager.dashboard} element={<ManagerDashboard />} />
        <Route path={routes.manager.vendors} element={<VendorApprovalList />} />
        <Route
          path={routes.manager.changePassword}
          element={<ChangePasswordPage />}
        />
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

        {/* Flash Sale */}
        <Route path={routes.manager.flashlist} element={<FlashSaleList />} />

        <Route
          path={routes.manager.flashCreate}
          element={<FlashSaleCreate />}
        />

        <Route path="/manager/flash-sale/:id" element={<FlashSaleCreate />} />

        <Route
          path="/manager/flash-variants/:flashId"
          element={<FlashSaleVariant />}
        />

        {/* Orders */}
        <Route path={routes.manager.orders.orderList} element={<OrderList />} />

        <Route path={routes.manager.orders.details} element={<OrderView />} />

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

        <Route path={routes.manager.rewards.mapping} element={<ProductRewardMapping />} />
      </Route>

      {/* ========== ADMIN ========== */}
      <Route element={<AdminLayout />}>
        <Route path={routes.admin.dashboard} element={<AdminDashboard />} />
        <Route path={routes.admin.vendors} element={<AdminVendorApprovalList />} />
        <Route path={routes.admin.changePassword} element={<ChangePasswordPage />} />
        <Route path={routes.admin.products} element={<AdminProductApprovalList />} />
        <Route path={routes.admin.productView} element={<AdminProductViewPage />} />
        <Route path={routes.admin.vendorReview} element={<AdminVendorApprovalForm />} />
        <Route path={routes.admin.services} element={<AdminServicesPage />} />
      </Route>

      {/* ========== HR ========== */}
      <Route element={<HrLayout />}>
        <Route path={routes.hr.dashboard} element={<HrDashboard />} />
        <Route path={routes.hr.onboarding} element={<EmployeeOnboarding />} />
        <Route path={routes.hr.employees} element={<EmployeeList />} />
        <Route path={routes.hr.changePassword} element={<ChangePasswordPage />} />
          <Route path={routes.hr.rewards} element={<ManageRewards />} />

      </Route>

      {/* ========== FALLBACK ========== */}
      <Route
        path="*"
        element={user ? <NotFoundPage /> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}
