import { DashboardAuthGuard } from "@/app/ui/dashboard/dashboard-auth-guard";
import "../dashboard.css";

export default function DashboardRouteLayout({ children }: LayoutProps<"/dashboard">) {
  return <DashboardAuthGuard>{children}</DashboardAuthGuard>;
}
