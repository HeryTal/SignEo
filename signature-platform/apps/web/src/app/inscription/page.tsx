import { Suspense } from "react";
import type { Metadata } from "next";
import AuthPage from "@/app/ui/auth-page";

export const metadata: Metadata = { title: "Créer un espace — Signeo", description: "Créez votre espace Signeo pour vos prochains accords." };

export default function SignupPage() {
  return <Suspense fallback={null}><AuthPage mode="signup" /></Suspense>;
}
