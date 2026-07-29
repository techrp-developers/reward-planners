import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import App from "./App";
import { AuthProvider } from "./common/auth/AuthProvider";
import { NotificationProvider } from "./common/notifications/NotificationProvider";
import "./index.css";
import "datatables.net-dt/css/dataTables.dataTables.min.css";
import "datatables.net-responsive-dt/css/responsive.dataTables.min.css"

// Conservative defaults: this app's data (wallets, stock, sessions) is
// mutated server-side by other actors, so stale cached reads are worse than
// an extra request — no background refetch-on-focus surprises mid-checkout.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/crm">
        <AuthProvider>
          <NotificationProvider>
            <App />
            <Toaster position="top-right" richColors closeButton />
          </NotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
