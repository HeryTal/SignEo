import { DashboardLayout } from "@/app/ui/dashboard/dashboard-layout";
import { EmptyPage } from "@/app/ui/dashboard/empty-page";
export default function ModelsPage() { return <DashboardLayout title="Modèles" description="Gagnez du temps avec vos documents réutilisables."><EmptyPage icon="◌" title="Aucun modèle enregistré." text="Créez un modèle à partir d’un document que vous utilisez souvent." action="Créer un modèle" /></DashboardLayout>; }
