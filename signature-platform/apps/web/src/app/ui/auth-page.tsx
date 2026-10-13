"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { SigneoLogo } from "./signeo-logo";

type AuthPageProps = { mode: "login" | "signup" };

export default function AuthPage({ mode }: AuthPageProps) {
  const isSignup = mode === "signup";
  const [showPassword, setShowPassword] = useState(false);
  const [requestError, setError] = useState("");
  const [requestLoading, setLoading] = useState(false);
  const query = useSearchParams();
  const googleError = query.get("google_error");
  const error = requestError || (googleError ? (googleError === "cancelled" ? "La connexion Google a été annulée." : "La connexion Google n’a pas pu être validée. Réessayez.") : "");
  const loading = requestLoading || (Boolean(query.get("google_code")) && !error);
  const accountCreated = !isSignup && query.get("created") === "1";
  const [resetDismissed, setResetDismissed] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);
  const passwordResetMode = resetRequested || (Boolean(query.get("reset")) && !resetDismissed);
  const resetToken = resetDismissed ? "" : query.get("reset") ?? "";
  const [resetNotice, setResetNotice] = useState("");
  const googleExchangeStarted = useRef(false);
  const router = useRouter();

  useEffect(() => {
    const googleCode = query.get("google_code");
    if (googleCode && !googleExchangeStarted.current) {
      googleExchangeStarted.current = true;
      fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/auth/google/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: googleCode }),
      })
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.message ?? "La connexion Google a expiré. Réessayez.");
          localStorage.setItem("signeo_access_token", payload.accessToken);
          localStorage.setItem("signeo_user", JSON.stringify(payload.user));
          router.replace("/dashboard");
        })
        .catch(() => {
          setError("La connexion Google a expiré. Réessayez.");
          setLoading(false);
        });
      return;
    }
    if (!isSignup) {
      const token = localStorage.getItem("signeo_access_token");
      if (token) {
        fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
          .then(() => undefined)
          // Si l'API est momentanément arrêtée, on laisse le formulaire accessible.
          // La connexion affichera ensuite un message utile au lieu d'une rejection non gérée.
          .catch(() => undefined);
      }
    }
  }, [isSignup, router, query]);

  function loginWithGoogle() {
    window.location.assign(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/auth/google`);
  }

  async function requestPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setLoading(true);
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/auth/password-reset/request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      if (!response.ok) throw new Error("Impossible d’envoyer le lien pour le moment.");
      setResetNotice("Si cette adresse est connue, un lien valable une heure vient d’être envoyé.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erreur réseau."); }
    finally { setLoading(false); }
  }

  async function confirmPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const values = new FormData(event.currentTarget); const password = String(values.get("password") ?? "");
    if (password !== String(values.get("passwordConfirmation") ?? "")) { setError("Les deux mots de passe doivent être identiques."); return; }
    setLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/auth/password-reset/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: resetToken, password }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Impossible de modifier le mot de passe.");
      setResetNotice("Mot de passe modifié. Vous pouvez maintenant vous connecter."); setResetDismissed(true); setResetRequested(false); router.replace("/connexion");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erreur réseau."); }
    finally { setLoading(false); }
  }

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
        <Link href="/" className="brand auth-brand" aria-label="Signeo.it, accueil"><SigneoLogo /></Link>
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
          <Link href="/" className="brand" aria-label="Signeo.it, accueil"><SigneoLogo /></Link>
        </div>
        <div className="auth-card">
          <p className="eyebrow">VOTRE ESPACE SIGNEO</p>
          <h2 id="auth-title">{isSignup ? "Créez votre espace." : "Ravi de vous revoir."}</h2>
          <p className="auth-intro">{isSignup ? "Un point de départ simple pour vos prochains accords." : "Connectez-vous pour retrouver vos projets."}</p>
          {accountCreated && <p className="auth-success" role="status">Votre espace est créé. Connectez-vous pour commencer.</p>}

          {passwordResetMode ? <form className="auth-form" onSubmit={resetToken ? confirmPasswordReset : requestPasswordReset}>
            <p className="auth-intro">{resetToken ? "Choisissez un nouveau mot de passe pour votre compte." : "Indiquez votre adresse e-mail. Nous vous enverrons un lien sécurisé."}</p>
            {!resetToken && <div className="auth-field"><label htmlFor="reset-email">Adresse e-mail</label><input id="reset-email" name="email" type="email" autoComplete="email" placeholder="vous@exemple.fr" required /></div>}
            {resetToken && <><div className="auth-field"><label htmlFor="reset-password">Nouveau mot de passe</label><input id="reset-password" name="password" type="password" autoComplete="new-password" minLength={12} placeholder="12 caractères minimum" required /></div><div className="auth-field"><label htmlFor="reset-password-confirmation">Confirmez le mot de passe</label><input id="reset-password-confirmation" name="passwordConfirmation" type="password" autoComplete="new-password" minLength={12} required /></div></>}
            <button className="button auth-submit" type="submit" disabled={loading}>{loading ? "Envoi…" : resetToken ? "Enregistrer le mot de passe" : "Envoyer le lien"}<span aria-hidden="true">↗</span></button>
            <button type="button" className="auth-text-button" onClick={() => { setResetDismissed(true); setResetRequested(false); }}>← Retour à la connexion</button>
          </form> : <>
          <button className="google-auth-button" type="button" onClick={loginWithGoogle} disabled={loading}>
            <svg className="google-auth-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M21.35 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.24a4.48 4.48 0 0 1-1.94 2.94v2.51h3.14c1.84-1.69 2.91-4.18 2.91-7.28Z" />
              <path fill="#34A853" d="M12 21.75c2.63 0 4.84-.87 6.45-2.24l-3.14-2.51c-.87.58-1.99.92-3.31.92-2.54 0-4.69-1.71-5.46-4.01H3.3v2.59A9.75 9.75 0 0 0 12 21.75Z" />
              <path fill="#FBBC05" d="M6.54 13.91A5.87 5.87 0 0 1 6.23 12c0-.66.11-1.3.31-1.91V7.5H3.3A9.75 9.75 0 0 0 2.25 12c0 1.62.39 3.15 1.05 4.5l3.24-2.59Z" />
              <path fill="#EA4335" d="M12 6.08c1.44 0 2.73.5 3.75 1.48l2.81-2.81C16.84 3.13 14.63 2.25 12 2.25A9.75 9.75 0 0 0 3.3 7.5l3.24 2.59c.77-2.3 2.92-4.01 5.46-4.01Z" />
            </svg>
            Continuer avec Google
          </button>
          <div className="auth-divider"><span>ou avec votre e-mail</span></div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {isSignup && <div className="auth-field"><label htmlFor="full-name">Prénom et nom</label><input id="full-name" name="name" type="text" autoComplete="name" placeholder="Camille Martin" required /></div>}
            <div className="auth-field"><label htmlFor="email">Adresse e-mail</label><input id="email" name="email" type="email" autoComplete="email" placeholder="vous@exemple.fr" required /></div>
            <div className="auth-field">
              <div className="auth-label-row"><label htmlFor="password">Mot de passe</label>{!isSignup && <button className="auth-text-button" type="button" onClick={() => { setError(""); setResetNotice(""); setResetRequested(true); }}>Mot de passe oublié ?</button>}</div>
              <div className="auth-password"><input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete={isSignup ? "new-password" : "current-password"} minLength={isSignup ? 12 : 8} placeholder="12 caractères minimum" required /><button type="button" className="auth-reveal" aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Masquer" : "Afficher"}</button></div>
            </div>
            {isSignup && <label className="auth-consent"><input type="checkbox" required /><span>J’accepte les <a href="/conditions" target="_blank" rel="noreferrer">conditions d’utilisation</a> et la <a href="/confidentialite" target="_blank" rel="noreferrer">politique de confidentialité</a>.</span></label>}
            {!isSignup && <label className="auth-consent"><input type="checkbox" /><span>Garder ma session ouverte</span></label>}
            <button className="button auth-submit" type="submit" disabled={loading}>{loading ? "Connexion…" : isSignup ? "Créer mon espace" : "Se connecter"}<span aria-hidden="true">↗</span></button>
          </form></>}

          {resetNotice && <p className="auth-success" role="status">{resetNotice}</p>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <p className="auth-switch">{isSignup ? "Vous avez déjà un compte ?" : "Pas encore de compte ?"} <Link href={isSignup ? "/connexion" : "/inscription"}>{isSignup ? "Se connecter" : "Créer un espace"}</Link></p>
          <Link className="auth-back" href="/">← Retour au site</Link>
        </div>
        <p className="auth-legal">En continuant, vos informations resteront protégées.</p>
      </section>
    </main>
  );
}
