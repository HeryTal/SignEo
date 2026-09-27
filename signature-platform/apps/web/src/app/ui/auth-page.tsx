"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

type AuthPageProps = { mode: "login" | "signup" };

export default function AuthPage({ mode }: AuthPageProps) {
  const isSignup = mode === "signup";
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!isSignup && new URLSearchParams(window.location.search).get("created") === "1") {
      setAccountCreated(true);
    }
    if (!isSignup) {
      const token = localStorage.getItem("signeo_access_token");
      if (token) {
        fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
          .then((response) => { if (response.ok) router.replace("/dashboard"); })
          // Si l'API est momentanément arrêtée, on laisse le formulaire accessible.
          // La connexion affichera ensuite un message utile au lieu d'une rejection non gérée.
          .catch(() => undefined);
      }
    }
  }, [isSignup, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/auth/${isSignup ? "signup" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(Array.isArray(payload.message) ? payload.message.join(" ") : payload.message ?? "Impossible de terminer l’authentification.");
      if (isSignup) {
        localStorage.removeItem("signeo_access_token");
        localStorage.removeItem("signeo_user");
        router.push("/connexion?created=1");
      } else {
        localStorage.setItem("signeo_access_token", payload.accessToken);
        localStorage.setItem("signeo_user", JSON.stringify(payload.user));
        router.push("/dashboard");
      }
    } catch (submitError) {
      setError(submitError instanceof TypeError
        ? "Impossible de joindre l’API Signeo (localhost:3001). Vérifiez qu’elle est démarrée, puis réessayez."
        : submitError instanceof Error ? submitError.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <aside className="auth-aside">
        <Link href="/" className="brand auth-brand" aria-label="Signeo, accueil">
          <span className="brand-mark" aria-hidden="true">s.</span>signeo
        </Link>
        <div className="auth-story">
          <span className="auth-star" aria-hidden="true">✳</span>
          <p className="eyebrow">LES BELLES HISTOIRES COMMENCENT ICI</p>
          <h1>Un accord de plus.<br /><em>Un beau projet qui commence.</em></h1>
          <p>Retrouvez vos documents et faites avancer vos collaborations, simplement.</p>
        </div>
        <p className="auth-aside-note">Simplement. Humainement.</p>
      </aside>

      <section className="auth-content" aria-labelledby="auth-title">
        <div className="auth-mobile-brand">
          <Link href="/" className="brand" aria-label="Signeo, accueil"><span className="brand-mark" aria-hidden="true">s.</span>signeo</Link>
        </div>
        <div className="auth-card">
          <p className="eyebrow">VOTRE ESPACE SIGNEO</p>
          <h2 id="auth-title">{isSignup ? "Créez votre espace." : "Ravi de vous revoir."}</h2>
          <p className="auth-intro">{isSignup ? "Un point de départ simple pour vos prochains accords." : "Connectez-vous pour retrouver vos projets."}</p>
          {accountCreated && <p className="auth-success" role="status">Votre espace est créé. Connectez-vous pour commencer.</p>}

          <form className="auth-form" onSubmit={handleSubmit}>
            {isSignup && <div className="auth-field"><label htmlFor="full-name">Prénom et nom</label><input id="full-name" name="name" type="text" autoComplete="name" placeholder="Camille Martin" required /></div>}
            <div className="auth-field"><label htmlFor="email">Adresse e-mail</label><input id="email" name="email" type="email" autoComplete="email" placeholder="vous@exemple.fr" required /></div>
            <div className="auth-field">
              <div className="auth-label-row"><label htmlFor="password">Mot de passe</label>{!isSignup && <button className="auth-text-button" type="button" onClick={() => setError("La récupération du mot de passe sera bientôt disponible.")}>Mot de passe oublié ?</button>}</div>
              <div className="auth-password"><input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete={isSignup ? "new-password" : "current-password"} minLength={8} placeholder="8 caractères minimum" required /><button type="button" className="auth-reveal" aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Masquer" : "Afficher"}</button></div>
            </div>
            {isSignup && <label className="auth-consent"><input type="checkbox" required /><span>J’accepte les conditions d’utilisation et la politique de confidentialité.</span></label>}
            {!isSignup && <label className="auth-consent"><input type="checkbox" /><span>Garder ma session ouverte</span></label>}
            <button className="button auth-submit" type="submit" disabled={loading}>{loading ? "Connexion…" : isSignup ? "Créer mon espace" : "Se connecter"}<span aria-hidden="true">↗</span></button>
          </form>

          {error && <p className="auth-error" role="alert">{error}</p>}
          <p className="auth-switch">{isSignup ? "Vous avez déjà un compte ?" : "Pas encore de compte ?"} <Link href={isSignup ? "/connexion" : "/inscription"}>{isSignup ? "Se connecter" : "Créer un espace"}</Link></p>
          <Link className="auth-back" href="/">← Retour au site</Link>
        </div>
        <p className="auth-legal">En continuant, vos informations resteront protégées.</p>
      </section>
    </main>
  );
}
