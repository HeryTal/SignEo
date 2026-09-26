import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const fraunces = localFont({ src: [{ path: "./fonts/Fraunces_600SemiBold.ttf", weight: "600", style: "normal" }, { path: "./fonts/Fraunces_500Medium_Italic.ttf", weight: "500", style: "italic" }], variable: "--font-fraunces", display: "swap" });
const inter = localFont({ src: [{ path: "./fonts/Inter_400Regular.ttf", weight: "400", style: "normal" }, { path: "./fonts/Inter_500Medium.ttf", weight: "500", style: "normal" }, { path: "./fonts/Inter_600SemiBold.ttf", weight: "600", style: "normal" }], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Signeo — Vos accords. De nouveaux départs.",
  description: "Découvrez Signeo, une nouvelle expérience de signature de documents. Explorez notre démonstration gratuite, sans inscription.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr" className={`${fraunces.variable} ${inter.variable}`}><body>{children}</body></html>;
}
