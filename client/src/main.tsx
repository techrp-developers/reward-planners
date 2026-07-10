import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { AuthProvider } from "./common/auth/AuthProvider";
import { NotificationProvider } from "./common/notifications/NotificationProvider";
import "./index.css";
import "datatables.net-dt/css/dataTables.dataTables.min.css";
import "datatables.net-responsive-dt/css/responsive.dataTables.min.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename="/crm">
      <AuthProvider>
        <NotificationProvider>
          <App />
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
