import { lazy, Suspense, type ReactNode } from "react";
import { Route, Routes } from "react-router-dom";

import { FullPageLoader } from "@/components/feedback/FullPageLoader";
import { AppLayout } from "@/components/layout/AppLayout";
import { UserRole } from "@/types/role";
import { APP_ROUTES } from "@/constants/routes";
import { ProtectedRoute } from "./ProtectedRoute";
import { RoleGuard } from "./RoleGuard";
import { ModuleGuard } from "./ModuleGuard";
import { IndexRedirect } from "./IndexRedirect";

const LoginPage = lazy(() => import("@/pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const AdminDashboardPage = lazy(() =>
  import("@/pages/AdminDashboardPage").then((module) => ({ default: module.AdminDashboardPage }))
);
const StaffManagementPage = lazy(() =>
  import("@/pages/StaffManagementPage").then((module) => ({ default: module.StaffManagementPage }))
);
const AttendancePage = lazy(() =>
  import("@/pages/AttendancePage").then((module) => ({ default: module.AttendancePage }))
);
const IngredientEntryPage = lazy(() =>
  import("@/pages/IngredientEntryPage").then((module) => ({ default: module.IngredientEntryPage }))
);
const AdditionalEntryPage = lazy(() =>
  import("@/pages/AdditionalEntryPage").then((module) => ({ default: module.AdditionalEntryPage }))
);
const ItemEntryPage = lazy(() =>
  import("@/pages/ItemEntryPage").then((module) => ({ default: module.ItemEntryPage }))
);
const OffersPage = lazy(() =>
  import("@/pages/OffersPage").then((module) => ({ default: module.OffersPage }))
);
const InvoicesPage = lazy(() =>
  import("@/pages/InvoicesPage").then((module) => ({ default: module.InvoicesPage }))
);
const GamingPage = lazy(() =>
  import("@/pages/GamingPage").then((module) => ({ default: module.GamingPage }))
);
const StockAuditPage = lazy(() =>
  import("@/pages/StockAuditPage").then((module) => ({ default: module.StockAuditPage }))
);
const DumpWastagePage = lazy(() =>
  import("@/pages/DumpWastagePage").then((module) => ({ default: module.DumpWastagePage }))
);
const CashAuditPage = lazy(() =>
  import("@/pages/CashAuditPage").then((module) => ({ default: module.CashAuditPage }))
);
const OutletsPage = lazy(() =>
  import("@/pages/OutletsPage").then((module) => ({ default: module.OutletsPage }))
);
const AdminOrdersPage = lazy(() =>
  import("@/pages/AdminOrdersPage").then((module) => ({ default: module.AdminOrdersPage }))
);
const SalesStaticsPage = lazy(() =>
  import("@/pages/SalesStaticsPage").then((module) => ({ default: module.SalesStaticsPage }))
);
const CustomerDataPage = lazy(() =>
  import("@/pages/CustomerDataPage").then((module) => ({ default: module.CustomerDataPage }))
);
const SuppliersPage = lazy(() =>
  import("@/pages/SuppliersPage").then((module) => ({ default: module.SuppliersPage }))
);
const PurchasePage = lazy(() =>
  import("@/pages/PurchasePage").then((module) => ({ default: module.PurchasePage }))
);
const AssetsEntryPage = lazy(() =>
  import("@/pages/AssetsEntryPage").then((module) => ({ default: module.AssetsEntryPage }))
);
const ReportsPage = lazy(() =>
  import("@/pages/ReportsPage").then((module) => ({ default: module.ReportsPage }))
);
const ProfilePage = lazy(() => import("@/pages/ProfilePage").then((module) => ({ default: module.ProfilePage })));
const ModulePlaceholderPage = lazy(() =>
  import("@/pages/ModulePlaceholderPage").then((module) => ({ default: module.ModulePlaceholderPage }))
);
const NotFoundPage = lazy(() =>
  import("@/pages/NotFoundPage").then((module) => ({ default: module.NotFoundPage }))
);

const Suspended = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<FullPageLoader message="Loading module..." />}>{children}</Suspense>
);

export const AppRouter = () => {
  const placeholderPaths: string[] = [];

  return (
    <Routes>
      <Route
        path={APP_ROUTES.LOGIN}
        element={
          <Suspended>
            <LoginPage />
          </Suspended>
        }
      />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<IndexRedirect />} />
          <Route path={APP_ROUTES.DASHBOARD} element={<IndexRedirect />} />
          <Route element={<RoleGuard allow={[UserRole.ADMIN]} />}>
            <Route
              path={APP_ROUTES.ADMIN_DASHBOARD}
              element={
                <ModuleGuard allow={["dashboard"]}>
                  <Suspended>
                    <AdminDashboardPage />
                  </Suspended>
                </ModuleGuard>
              }
            />
            <Route
              path={APP_ROUTES.STAFF_MANAGEMENT}
              element={
                <ModuleGuard allow={["staff-management"]}>
                  <Suspended>
                    <StaffManagementPage />
                  </Suspended>
                </ModuleGuard>
              }
            />
            <Route
              path={APP_ROUTES.ATTENDANCE}
              element={
                <ModuleGuard allow={["attendance"]}>
                  <Suspended>
                    <AttendancePage />
                  </Suspended>
                </ModuleGuard>
              }
            />
            <Route
              path={APP_ROUTES.ORDERS}
              element={
                <ModuleGuard allow={["orders", "invoices"]}>
                  <Suspended>
                    <AdminOrdersPage />
                  </Suspended>
                </ModuleGuard>
              }
            />
            <Route
              path={APP_ROUTES.ITEMS_ENTRY}
              element={
                <ModuleGuard allow={["items-entry"]}>
                  <Suspended>
                    <ItemEntryPage />
                  </Suspended>
                </ModuleGuard>
              }
            />
            <Route
              path={APP_ROUTES.INGREDIENT_ENTRY}
              element={
                <ModuleGuard allow={["ingredient-entry"]}>
                  <Suspended>
                    <IngredientEntryPage />
                  </Suspended>
                </ModuleGuard>
              }
            />
            <Route
              path={APP_ROUTES.ADDITIONAL_ENTRY}
              element={
                <ModuleGuard allow={["additional-entry"]}>
                  <Suspended>
                    <AdditionalEntryPage />
                  </Suspended>
                </ModuleGuard>
              }
            />
            <Route
              path={APP_ROUTES.OFFERS}
              element={
                <ModuleGuard allow={["offers"]}>
                  <Suspended>
                    <OffersPage />
                  </Suspended>
                </ModuleGuard>
              }
            />
            <Route
              path={APP_ROUTES.SUPPLIERS}
              element={
                <ModuleGuard allow={["suppliers"]}>
                  <Suspended>
                    <SuppliersPage />
                  </Suspended>
                </ModuleGuard>
              }
            />
            <Route
              path={APP_ROUTES.PURCHASE}
              element={
                <ModuleGuard allow={["purchase"]}>
                  <Suspended>
                    <PurchasePage initialSection="orders" standalone />
                  </Suspended>
                </ModuleGuard>
              }
            />
            <Route
              path={APP_ROUTES.PURCHASE_PRODUCTS}
              element={
                <ModuleGuard allow={["purchase"]}>
                  <Suspended>
                    <PurchasePage initialSection="products" standalone />
                  </Suspended>
                </ModuleGuard>
              }
            />
            <Route
              path={APP_ROUTES.ASSETS_ENTRY}
              element={
                <ModuleGuard allow={["assets-entry"]}>
                  <Suspended>
                    <AssetsEntryPage />
                  </Suspended>
                </ModuleGuard>
              }
            />
            <Route
              path="/sales-statics"
              element={
                <ModuleGuard allow={["sales-statics", "dashboard"]}>
                  <Suspended>
                    <SalesStaticsPage />
                  </Suspended>
                </ModuleGuard>
              }
            />
            <Route
              path="/customer-data"
              element={
                <ModuleGuard allow={["customer-data"]}>
                  <Suspended>
                    <CustomerDataPage />
                  </Suspended>
                </ModuleGuard>
              }
            />
            <Route
              path={APP_ROUTES.REPORTS}
              element={
                <ModuleGuard allow={["reports"]}>
                  <Suspended>
                    <ReportsPage />
                  </Suspended>
                </ModuleGuard>
              }
            />
            <Route
              path={APP_ROUTES.INVOICES}
              element={
                <ModuleGuard allow={["invoices", "orders"]}>
                  <Suspended>
                    <InvoicesPage />
                  </Suspended>
                </ModuleGuard>
              }
            />
            <Route
              path={APP_ROUTES.STOCK_AUDIT}
              element={
                <ModuleGuard allow={["stock-audit"]}>
                  <Suspended>
                    <StockAuditPage />
                  </Suspended>
                </ModuleGuard>
              }
            />
            <Route
              path={APP_ROUTES.DUMP_WASTAGE}
              element={
                <ModuleGuard allow={["dump-wastage"]}>
                  <Suspended>
                    <DumpWastagePage />
                  </Suspended>
                </ModuleGuard>
              }
            />
            <Route
              path={APP_ROUTES.CASH_AUDIT}
              element={
                <ModuleGuard allow={["cash-audit"]}>
                  <Suspended>
                    <CashAuditPage />
                  </Suspended>
                </ModuleGuard>
              }
            />
            <Route
              path={APP_ROUTES.OUTLETS}
              element={
                <ModuleGuard allow={["outlets"]}>
                  <Suspended>
                    <OutletsPage />
                  </Suspended>
                </ModuleGuard>
              }
            />
            <Route
              path={APP_ROUTES.GAMING}
              element={
                <ModuleGuard allow={["gaming"]}>
                  <Suspended>
                    <GamingPage />
                  </Suspended>
                </ModuleGuard>
              }
            />
            {placeholderPaths.map((path) => (
              <Route
                key={path}
                path={path}
                element={
                  <Suspended>
                    <ModulePlaceholderPage />
                  </Suspended>
                }
              />
            ))}
          </Route>
          <Route
            path={APP_ROUTES.PROFILE}
            element={
              <Suspended>
                <ProfilePage />
              </Suspended>
            }
          />
        </Route>
      </Route>

      <Route
        path="*"
        element={
          <Suspended>
            <NotFoundPage />
          </Suspended>
        }
      />
    </Routes>
  );
};
