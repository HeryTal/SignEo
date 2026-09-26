import type { Metadata } from "next";
import AuthPage from "@/app/ui/auth-page";

export const metadata: Metadata = { title: "Connexion — Signeo", description: "Connectez-vous à votre espace Signeo." };

export default function LoginPage() {
  return <AuthPage mode="login" />;
}
