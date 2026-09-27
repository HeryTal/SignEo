import { DashboardLayout } from "@/app/ui/dashboard/dashboard-layout";
import { EmptyPage } from "@/app/ui/dashboard/empty-page";
export default function SettingsPage() { return <DashboardLayout title="Paramètres" description="Gérez votre profil et les préférences de votre espace."><EmptyPage icon="⚙" title="Vos paramètres arrivent bientôt." text="Vous pourrez modifier votre profil, votre sécurité et vos notifications." action="Modifier mon profil" /></DashboardLayout>; }
