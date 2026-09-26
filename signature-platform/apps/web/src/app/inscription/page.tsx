import type { Metadata } from "next";
import AuthPage from "@/app/ui/auth-page";

export const metadata: Metadata = { title: "Créer un espace — Signeo", description: "Créez votre espace Signeo pour vos prochains accords." };

export default function SignupPage() {
  return <AuthPage mode="signup" />;
}
