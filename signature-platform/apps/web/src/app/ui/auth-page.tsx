"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";

type AuthPageProps = { mode: "login" | "signup" };

export default function AuthPage({ mode }: AuthPageProps) {
  const isSignup = mode === "signup";
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
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

          <form className="auth-form" onSubmit={handleSubmit}>
            {isSignup && <div className="auth-field"><label htmlFor="full-name">Prénom et nom</label><input id="full-name" name="name" type="text" autoComplete="name" placeholder="Camille Martin" required /></div>}
            <div className="auth-field"><label htmlFor="email">Adresse e-mail</label><input id="email" name="email" type="email" autoComplete="email" placeholder="vous@exemple.fr" required /></div>
            <div className="auth-field">
              <div className="auth-label-row"><label htmlFor="password">Mot de passe</label>{!isSignup && <button className="auth-text-button" type="button" onClick={() => setSubmitted(true)}>Mot de passe oublié ?</button>}</div>
              <div className="auth-password"><input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete={isSignup ? "new-password" : "current-password"} minLength={8} placeholder="8 caractères minimum" required /><button type="button" className="auth-reveal" aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Masquer" : "Afficher"}</button></div>
            </div>
            {isSignup && <label className="auth-consent"><input type="checkbox" required /><span>J’accepte les conditions d’utilisation et la politique de confidentialité.</span></label>}
            {!isSignup && <label className="auth-consent"><input type="checkbox" /><span>Garder ma session ouverte</span></label>}
            <button className="button auth-submit" type="submit">{isSignup ? "Créer mon espace" : "Se connecter"}<span aria-hidden="true">↗</span></button>
          </form>

          {submitted && <p className="auth-notice" role="status">L’espace Signeo est en préparation. La connexion aux comptes sera disponible prochainement.</p>}
          <p className="auth-switch">{isSignup ? "Vous avez déjà un compte ?" : "Pas encore de compte ?"} <Link href={isSignup ? "/connexion" : "/inscription"}>{isSignup ? "Se connecter" : "Créer un espace"}</Link></p>
          <Link className="auth-back" href="/">← Retour au site</Link>
        </div>
        <p className="auth-legal">En continuant, vos informations resteront protégées.</p>
      </section>
    </main>
  );
}
