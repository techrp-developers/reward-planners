// import { list } from "postcss";

export const routes = {
  vendor: {
    dashboard: "/vendor/dashboard",
    onboarding: "/vendor/onboarding",
    changePassword: "/vendor/change-password",
   products: {
    add: "/vendor/products/add",
    list: "/vendor/products/list",
    edit: "/vendor/products/edit/:id",
    manageProduct:"/vendor/products/manage-product/:productId",
    variantEdit:"/vendor/products/variant-edit/:variantId",
    variantImage:"/vendor/products/variant-image/:variantId",
    review: "/vendor/products/review/:productId", 
    },
    orders:{
      summary: "/vendor/orders/summary",
      details: "/vendor/orders/details/:orderId",
    },
    productManagerList: "/vendor/product-managers",
  },
   manager: {
    dashboard: "/manager/dashboard",
    changePassword: "/manager/change-password",
    vendors: "/manager/vendors",
    products: "/manager/products",
    productView: "/manager/product/:id",
    vendorReview: "/manager/vendor-review/:id",
    categories: "/manager/category_management/categories",
    subcategories: "/manager/category_management/subcategories",
    subsubcategories: "/manager/category_management/subsubcategories",
    addDocument:"/manager/document/DocumentAdd",
    linkDocument:"/manager/document/DocumentCategory",
    attributes: "/manager/attributes",
    // flashlist: "/manager/flashlist",
    // flashCreate: "/manager/flash-sale",
    orders:{
      orderList: "/manager/orders",
      details: "/manager/order-view/:orderId",
      cancellationRequest: "/manager/cancellation-request",
      cancellationDetail: "/manager/cancellation-detail/:orderId",
    },
    services:{
      enquiries:"/manager/enquiries",
      details: "/manager/enquiry/:id",
      orders: "/manager/orders"
    },
    rewards:{
      rewardRule:"/manager/rewards-rule",
      create:"/manager/reward-create",
      edit:"/manager/reward-edit/:id",
      mapping:"/manager/reward-mapping",
    }
  },
  admin: {
    dashboard: "/admin/dashboard",
    changePassword: "/admin/change-password",
    vendors: "/admin/vendors",
    products: "/admin/products",
    services: "/admin/services",
    productView: "/admin/product/:id",
    vendorReview: "/admin/vendor-review/:id",
  
  },
  hr: {
    dashboard: "/hr/dashboard",
    changePassword: "/hr/change-password",
    onboarding: "/hr/onboarding",
    employees: "/hr/employees",
      rewards: "/hr/rewards", 

  },
};
