"use client";

import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { DashboardLayout } from "@/app/ui/dashboard/dashboard-layout";
import { InvitationContent } from "@/app/ui/branded-invitation";
import { AccountPanel } from "./account-panel";
import styles from "./settings.module.css";
import { SigneoMark } from "@/app/ui/signeo-logo";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const universes = [
  {
    name: "Botanique",
    subtitle: "Naturel. Intemporel.",
    accentColor: "#496b50",
    textColor: "#24352b",
    signatureColor: "#315b45",
    textFont: "SANS",
    signatureFont: "SCRIPT",
    paper: "#e6eddd",
    ink: "#294d38",
    glyph: "B",
    ornament: "✳",
  },
  {
    name: "Éditorial",
    subtitle: "Du fond. Du caractère.",
    accentColor: "#873f33",
    textColor: "#3e302a",
    signatureColor: "#873f33",
    textFont: "SERIF",
    signatureFont: "SERIF",
    paper: "#efe1cb",
    ink: "#873f33",
    glyph: "É",
    ornament: "&",
  },
  {
    name: "Studio",
    subtitle: "Libre. Singulier.",
    accentColor: "#575080",
    textColor: "#343044",
    signatureColor: "#575080",
    textFont: "SANS",
    signatureFont: "SANS",
    paper: "#e5dff1",
    ink: "#575080",
    glyph: "S",
    ornament: "✦",
  },
  {
    name: "Monochrome",
    subtitle: "L’essentiel, simplement.",
    accentColor: "#242b2a",
    textColor: "#242b2a",
    signatureColor: "#242b2a",
    textFont: "MONO",
    signatureFont: "SANS",
    paper: "#e6e7e2",
    ink: "#242b2a",
    glyph: "M",
    ornament: "+",
  },
] as const;
type Branding = {
  displayName: string;
  accentColor: string;
  logoUrl: string;
  textFont: "SANS" | "SERIF" | "MONO";
  signatureFont: "SCRIPT" | "SERIF" | "SANS";
  textColor: string;
  signatureColor: string;
  textSize: number;
  signatureSize: number;
};
type IdentityVerification = {
  status: "NOT_STARTED" | "PENDING" | "VERIFIED" | "REJECTED";
  provider: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
};
type Billing = {
  organization: { id: string; name: string };
  billingEmail: string | null;
  plan: string;
  subscriptionStatus: string;
  usage: { envelopesThisMonth: number; includedEnvelopesPerMonth: number };
};

export default function SettingsPage() {
  const [branding, setBranding] = useState<Branding>({
    displayName: "Signeo",
    accentColor: "#496b50",
    logoUrl: "",
    textFont: "SANS",
    signatureFont: "SCRIPT",
    textColor: "#24352b",
    signatureColor: "#315b45",
    textSize: 11,
    signatureSize: 22,
  });
  const [section, setSection] = useState<"brand" | "identity" | "billing" | "account">(
    "brand",
  );
  const [preview, setPreview] = useState<"invitation" | "document">(
    "invitation",
  );
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [expanded]);
  const [savedBranding, setSavedBranding] = useState<Branding | null>(null);
  const [loadError, setLoadError] = useState(false);
  const dirty =
    savedBranding !== null &&
    JSON.stringify(branding) !== JSON.stringify(savedBranding);
  const update = <K extends keyof Branding>(key: K, value: Branding[K]) =>
    setBranding((current) => ({ ...current, [key]: value }));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [role, setRole] = useState("");
  const [identity, setIdentity] = useState<IdentityVerification>({
    status: "NOT_STARTED",
    provider: null,
    verifiedAt: null,
    rejectionReason: null,
  });
  const [billing, setBilling] = useState<Billing | null>(null);
  const [billingEmail, setBillingEmail] = useState("");
  useEffect(() => {
    const token = localStorage.getItem("signeo_access_token");
    Promise.resolve().then(() => {
      if (!token) throw new Error("Session unavailable");
      return Promise.all([
      fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`${API}/billing`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);
    })
      .then(async ([profileResponse, billingResponse]) => {
        if (profileResponse.ok) {
          const profile = await profileResponse.json();
          if (profile.branding) {
            setBranding(profile.branding);
            setSavedBranding(profile.branding);
          }
          if (profile.identityVerification)
            setIdentity(profile.identityVerification);
          setRole(profile.activeWorkspace?.role ?? "");
        } else {
          setLoadError(true);
          setNotice(
            "Impossible de charger votre personnalisation. Actualisez la page pour réessayer.",
          );
        }
        if (billingResponse.ok) {
          const value = await billingResponse.json();
          setBilling(value);
          setBillingEmail(value.billingEmail ?? "");
        }
      })
      .catch(() => {
        setLoadError(true);
        setNotice(
          "Impossible de charger les paramètres. Vérifiez que l’API est démarrée.",
        );
      })
      .finally(() => setLoading(false));
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const token = localStorage.getItem("signeo_access_token");
      const response = await fetch(`${API}/auth/branding`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(branding),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          result?.message ?? "La personnalisation n’a pas été enregistrée.",
        );
      setSavedBranding({ ...branding });
      setNotice(
        "Identité de marque enregistrée. Les prochaines enveloppes l’utiliseront.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Erreur réseau.");
    } finally {
      setBusy(false);
    }
  }
  async function startIdentityVerification() {
    setBusy(true);
    setNotice("");
    try {
      const token = localStorage.getItem("signeo_access_token");
      const response = await fetch(`${API}/auth/identity-verification`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          result?.message ?? "La vérification n’a pas pu démarrer.",
        );
      setIdentity(result);
      setNotice(
        result.verificationUrl
          ? "Vérification créée. Ouvrez le parcours sécurisé du prestataire."
          : "Vérification en attente.",
      );
      if (result.verificationUrl)
        window.open(result.verificationUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Erreur réseau.");
    } finally {
      setBusy(false);
    }
  }
  async function saveBilling(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const token = localStorage.getItem("signeo_access_token");
      const response = await fetch(`${API}/billing`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ billingEmail }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          result?.message ?? "La facturation n’a pas pu être enregistrée.",
        );
      setBilling(result);
      setNotice("Adresse de facturation enregistrée.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Erreur réseau.");
    } finally {
      setBusy(false);
    }
  }
  async function billingAction(
    path: "checkout" | "portal",
    plan?: "BUSINESS" | "ENTERPRISE",
  ) {
    setBusy(true);
    setNotice("");
    try {
      const token = localStorage.getItem("signeo_access_token");
      const response = await fetch(`${API}/billing/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: plan ? JSON.stringify({ plan }) : undefined,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.url)
        throw new Error(
          result?.message ?? "Le portail Stripe n’est pas disponible.",
        );
      window.location.assign(result.url);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Erreur réseau.");
    } finally {
      setBusy(false);
    }
  }
  const textFamily =
    branding.textFont === "SERIF"
      ? "Georgia, serif"
      : branding.textFont === "MONO"
        ? "monospace"
        : "var(--sans)";
  const signatureFamily =
    branding.signatureFont === "SANS" ? "var(--sans)" : "Georgia, serif";
  const accent = branding.accentColor;
  const hex = accent.replace("#", "");
  const buttonInk =
    parseInt(hex.slice(0, 2), 16) * 0.299 +
      parseInt(hex.slice(2, 4), 16) * 0.587 +
      parseInt(hex.slice(4, 6), 16) * 0.114 >
    155
      ? "#172e24"
      : "#fff";
  const identityLabel = {
    VERIFIED: "Identité vérifiée",
    PENDING: "En cours de vérification",
    REJECTED: "Vérification à reprendre",
    NOT_STARTED: "À vérifier",
  }[identity.status];
  return (
    <DashboardLayout
      title="Paramètres"
      eyebrow="VOTRE ESPACE DE TRAVAIL"
      description="Les commandes de votre expérience Signeo."
    >
      <div
        className={styles.settings}
        style={{ "--brand-accent": accent } as CSSProperties}
      >
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.heroLabel}>
              <span /> SIGNEO BRAND STUDIO <small>VOL. 01</small>
            </span>
            <h1>
              Votre marque.
              <br />
              <em>Votre empreinte.</em>
            </h1>
            <p>
              Transformez une simple invitation en une expérience
              <br className={styles.desktopBreak} /> que l’on reconnaît au
              premier regard.
            </p>
            <a
              href="#brand-universes"
              onClick={() => setSection("brand")}
              className={styles.heroLink}
            >
              Composer mon univers <span>↗</span>
            </a>
          </div>
          <div className={styles.heroArt} aria-hidden="true">
            <div className={styles.orbit} />
            <div className={styles.artNote}>
              <span>UNE INVITATION À</span>
              <strong>
                faire
                <br />
                <i>impression.</i>
              </strong>
              <div />
              <small>LA SIGNATURE DU DÉTAIL</small>
            </div>
            <div
              className={styles.artBusiness}
              style={{ background: accent, color: buttonInk }}
            >
              <span>VOTRE MARQUE, PARTOUT.</span>
              <strong>
                {branding.displayName || "Votre marque"}
                <i>®</i>
              </strong>
              <div>
                <span>
                  Écrit avec soin.
                  <br />
                  Signé avec vous.
                </span>
                <span className={styles.artFlower}>✳</span>
              </div>
            </div>
            <div className={styles.artStamp}>
              VOTRE
              <br />
              <strong>signature</strong>
              <br />
              COMMENCE ICI ↗
            </div>
            <span className={styles.artCaption}>
              01 — L’ART DE LA PREMIÈRE IMPRESSION
            </span>
          </div>
          <div className={styles.heroFooter}>
            <span>
              <Icon name="brand" /> Une identité singulière
            </span>
            <span>
              <Icon name="eye" /> Une expérience cohérente
            </span>
            <span>
              <Icon name="shield" /> La confiance, dès le premier clic
            </span>
          </div>
        </header>
        <nav className={styles.tabs} aria-label="Rubriques des paramètres">
          {(
            [
              {
                id: "brand",
                icon: "brand",
                label: "Identité de marque",
                detail: "01",
              },
              {
                id: "identity",
                icon: "shield",
                label: "Vérification d’identité",
                detail: "02",
              },
              {
                id: "account", icon: "shield", label: "Compte & sécurité", detail: "03",
              },
              {
                id: "billing",
                icon: "card",
                label: "Facturation & abonnement",
                detail: "04",
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-current={section === tab.id ? "page" : undefined}
              onClick={() => setSection(tab.id)}
            >
              <Icon name={tab.icon} />
              <span>{tab.label}</span>
              <small>{tab.detail}</small>
            </button>
          ))}
        </nav>
        {notice && (
          <div className={styles.notice} role="status">
            <Icon name="info" />
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label="Fermer le message"
            >
              ×
            </button>
          </div>
        )}
        {section === "account" && <AccountPanel />}
        {section === "brand" && (
          <>
            <section id="brand-universes" className={styles.universes}>
              <div className={styles.universeHeading}>
                <div>
                  <span className={styles.kicker}>
                    01 / LA DIRECTION ARTISTIQUE
                  </span>
                  <h3>Quel est votre univers ?</h3>
                </div>
                <p>
                  Un point de départ, pas une limite.
                  <br />
                  Choisissez une ambiance, ajustez chaque détail.
                </p>
              </div>
              <div className={styles.universeGrid}>
                {universes.map((universe, index) => {
                  const active =
                    branding.accentColor === universe.accentColor &&
                    branding.textFont === universe.textFont &&
                    branding.signatureFont === universe.signatureFont &&
                    branding.textColor === universe.textColor &&
                    branding.signatureColor === universe.signatureColor;
                  return (
                    <button
                      type="button"
                      key={universe.name}
                      disabled={loading || busy || loadError}
                      aria-pressed={active}
                      className={styles.universeCard}
                      style={
                        {
                          "--universe-paper": universe.paper,
                          "--universe-ink": universe.ink,
                        } as CSSProperties
                      }
                      onClick={() =>
                        setBranding((current) => ({
                          ...current,
                          accentColor: universe.accentColor,
                          textColor: universe.textColor,
                          signatureColor: universe.signatureColor,
                          textFont: universe.textFont,
                          signatureFont: universe.signatureFont,
                        }))
                      }
                    >
                      <div className={styles.universeArt}>
                        <span className={styles.universeNumber}>
                          COLLECTION / 0{index + 1}
                        </span>
                        <strong
                          style={{
                            fontFamily:
                              universe.textFont === "MONO"
                                ? "monospace"
                                : "var(--serif)",
                          }}
                        >
                          {universe.glyph}
                          <i>{universe.ornament}</i>
                        </strong>
                        <span className={styles.universeSwatches}>
                          <i style={{ background: universe.ink }} />
                          <i style={{ background: universe.paper }} />
                          <i style={{ background: "#fffdf6" }} />
                        </span>
                        <span className={styles.universeCheck}>
                          {active ? <Icon name="check" /> : "↗"}
                        </span>
                      </div>
                      <div className={styles.universeName}>
                        <b>{universe.name}</b>
                        <small>{universe.subtitle}</small>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
            <div className={styles.intro}>
              <div>
                <span className={styles.kicker}>
                  02 / LA TOUCHE PERSONNELLE
                </span>
                <h3>Maintenant, faites-en votre signature.</h3>
                <p>
                  Quelques détails. Une expérience de signature à part entière.
                </p>
              </div>
              <span className={styles.live}>
                <i /> Aperçu en direct
              </span>
            </div>
            <div className={styles.studio}>
              <form id="brand-form" onSubmit={save} className={styles.editor}>
                <fieldset disabled={loading || busy || loadError}>
                  <section className={styles.editorSection}>
                    <div className={styles.sectionTitle}>
                      <span className={styles.sectionIcon}>
                        <Icon name="brand" />
                      </span>
                      <div>
                        <h4>Votre identité</h4>
                        <p>Le premier contact avec vos destinataires.</p>
                      </div>
                      <span className={styles.step}>01</span>
                    </div>
                    <label className={styles.field}>
                      Nom de l’expéditeur
                      <input
                        required
                        maxLength={80}
                        value={branding.displayName}
                        placeholder="Le nom de votre organisation"
                        onChange={(event) =>
                          update("displayName", event.target.value)
                        }
                      />
                    </label>
                    <div className={styles.logoRow}>
                      <div className={styles.logoTile}>
                        <BrandLogo url={branding.logoUrl} />
                      </div>
                      <label className={styles.field}>
                        Logo de votre organisation
                        <input
                          type="url"
                          pattern="https://.*"
                          placeholder="https://votre-site.fr/logo.png"
                          value={branding.logoUrl}
                          onChange={(event) =>
                            update("logoUrl", event.target.value)
                          }
                        />
                        <small>
                          Un lien HTTPS vers votre logo, idéalement sur fond
                          transparent.
                        </small>
                      </label>
                      {branding.logoUrl && (
                        <button
                          className={styles.iconButton}
                          type="button"
                          aria-label="Retirer le logo"
                          onClick={() => update("logoUrl", "")}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <label className={styles.field} htmlFor="accent">
                      Couleur de marque
                    </label>
                    <div className={styles.palette}>
                      {[
                        { color: "#496b50", name: "Sauge" },
                        { color: "#194e3d", name: "Forêt" },
                        { color: "#303b6f", name: "Indigo" },
                        { color: "#806290", name: "Prune" },
                        { color: "#b35e43", name: "Terre cuite" },
                        { color: "#242b2a", name: "Graphite" },
                      ].map(({ color, name }) => (
                        <button
                          type="button"
                          key={color}
                          title={name}
                          aria-label={name}
                          aria-pressed={accent.toLowerCase() === color}
                          style={{ background: color }}
                          onClick={() => update("accentColor", color)}
                        >
                          {accent.toLowerCase() === color && (
                            <Icon name="check" />
                          )}
                        </button>
                      ))}
                      <div className={styles.colorValue}>
                        <input
                          id="accent"
                          aria-label="Couleur de marque personnalisée"
                          type="color"
                          value={accent}
                          onChange={(event) =>
                            update("accentColor", event.target.value)
                          }
                        />
                        <span>{accent.toUpperCase()}</span>
                      </div>
                    </div>
                  </section>
                  <section className={styles.editorSection}>
                    <div className={styles.sectionTitle}>
                      <span className={styles.sectionIcon}>
                        <Icon name="type" />
                      </span>
                      <div>
                        <h4>Le sens du détail</h4>
                        <p>Une typographie qui donne le ton.</p>
                      </div>
                      <span className={styles.step}>02</span>
                    </div>
                    <span className={styles.fieldLabel}>
                      Police des documents
                    </span>
                    <div
                      className={styles.fontChoices}
                      role="group"
                      aria-label="Police des documents"
                    >
                      {(
                        [
                          {
                            value: "SANS",
                            label: "Essentielle",
                            family: "var(--sans)",
                          },
                          {
                            value: "SERIF",
                            label: "Éditoriale",
                            family: "Georgia, serif",
                          },
                          {
                            value: "MONO",
                            label: "Technique",
                            family: "monospace",
                          },
                        ] as const
                      ).map((font) => (
                        <button
                          key={font.value}
                          type="button"
                          aria-pressed={branding.textFont === font.value}
                          onClick={() => update("textFont", font.value)}
                        >
                          <span style={{ fontFamily: font.family }}>Aa</span>
                          <small>{font.label}</small>
                          {branding.textFont === font.value && (
                            <i>
                              <Icon name="check" />
                            </i>
                          )}
                        </button>
                      ))}
                    </div>
                    <div className={styles.controls}>
                      <label className={styles.field}>
                        Couleur du texte
                        <div className={styles.colorValue}>
                          <input
                            type="color"
                            value={branding.textColor}
                            onChange={(event) =>
                              update("textColor", event.target.value)
                            }
                          />
                          <span>{branding.textColor.toUpperCase()}</span>
                        </div>
                      </label>
                      <label className={styles.field}>
                        Taille du texte{" "}
                        <span className={styles.measure}>
                          {branding.textSize} px
                        </span>
                        <input
                          type="range"
                          min="8"
                          max="18"
                          value={branding.textSize}
                          onChange={(event) =>
                            update("textSize", Number(event.target.value))
                          }
                        />
                      </label>
                    </div>
                    <div className={styles.signatureControls}>
                      <label className={styles.field}>
                        Style de signature
                        <select
                          value={branding.signatureFont}
                          onChange={(event) =>
                            update(
                              "signatureFont",
                              event.target.value as Branding["signatureFont"],
                            )
                          }
                        >
                          <option value="SCRIPT">Manuscrite · Italique</option>
                          <option value="SERIF">Classique · Sérif</option>
                          <option value="SANS">
                            Contemporaine · Sans sérif
                          </option>
                        </select>
                      </label>
                      <div className={styles.controls}>
                        <label className={styles.field}>
                          Couleur de la signature
                          <div className={styles.colorValue}>
                            <input
                              type="color"
                              value={branding.signatureColor}
                              onChange={(event) =>
                                update("signatureColor", event.target.value)
                              }
                            />
                            <span>{branding.signatureColor.toUpperCase()}</span>
                          </div>
                        </label>
                        <label className={styles.field}>
                          Taille de la signature{" "}
                          <span className={styles.measure}>
                            {branding.signatureSize} px
                          </span>
                          <input
                            type="range"
                            min="14"
                            max="30"
                            value={branding.signatureSize}
                            onChange={(event) =>
                              update(
                                "signatureSize",
                                Number(event.target.value),
                              )
                            }
                          />
                        </label>
                      </div>
                    </div>
                  </section>
                </fieldset>
              </form>
              <aside
                className={`${styles.previewColumn} ${expanded ? styles.expandedPreview : ""}`}
                aria-label="Aperçu de votre personnalisation"
              >
                <div className={styles.previewTop}>
                  <span>LE RENDU FINAL</span>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-label={
                      expanded ? "Réduire l’aperçu" : "Agrandir l’aperçu"
                    }
                    onClick={() => setExpanded(!expanded)}
                  >
                    {expanded ? "Réduire ↙" : "Agrandir ↗"}
                  </button>
                </div>
                <div
                  className={styles.previewSwitch}
                  role="group"
                  aria-label="Type d’aperçu"
                >
                  <button
                    type="button"
                    aria-pressed={preview === "invitation"}
                    onClick={() => setPreview("invitation")}
                  >
                    Invitation
                  </button>
                  <button
                    type="button"
                    aria-pressed={preview === "document"}
                    onClick={() => setPreview("document")}
                  >
                    Document
                  </button>
                </div>
                <div className={styles.deviceToolbar}>
                  <div>
                    <button
                      type="button"
                      aria-pressed={device === "desktop"}
                      onClick={() => setDevice("desktop")}
                    >
                      Ordinateur
                    </button>
                    <button
                      type="button"
                      aria-pressed={device === "mobile"}
                      onClick={() => setDevice("mobile")}
                    >
                      Mobile
                    </button>
                  </div>
                  <span>
                    <i /> EN DIRECT
                  </span>
                </div>
                <div
                  className={`${styles.previewStage} ${device === "mobile" ? styles.mobilePreview : ""}`}
                >
                  <div className={styles.browserChrome}>
                    <span>
                      <i />
                      <i />
                      <i />
                    </span>
                    <small>
                      <Icon name="shield" /> Aperçu de signature
                    </small>
                    <span>↗</span>
                  </div>
                  <div
                    className={styles.previewPaper}
                    style={{ borderTopColor: accent }}
                  >
                    <div className={styles.paperBrand}>
                      <BrandLogo url={branding.logoUrl} />
                      <strong>
                        {branding.displayName || "Votre organisation"}
                      </strong>
                    </div>
                    {preview === "invitation" ? (
<InvitationContent brand={branding} />
) : (
                      <>
                        <span className={styles.paperEyebrow}>
                          APERÇU DU DOCUMENT
                        </span>
                        <h4>
                          Chaque détail
                          <br />
                          porte votre marque.
                        </h4>
                        <div
                          className={styles.documentText}
                          style={{
                            fontFamily: textFamily,
                            color: branding.textColor,
                            fontSize: branding.textSize,
                          }}
                        >
                          <b>Contrat de prestation</b>
                          <p>
                            Le présent document formalise notre collaboration et
                            les engagements convenus entre les parties.
                          </p>
                          <p>Lu et approuvé, pour accord.</p>
                        </div>
                        <div className={styles.signatureBox}>
                          <small>Votre signature</small>
                          <span
                            style={{
                              fontFamily: signatureFamily,
                              fontStyle:
                                branding.signatureFont === "SCRIPT"
                                  ? "italic"
                                  : "normal",
                              color: branding.signatureColor,
                              fontSize: branding.signatureSize,
                            }}
                          >
                            Camille Martin
                          </span>
                          <div />
                          <small>Le signataire</small>
                        </div>
                      </>
                    )}
                  </div>
                  <div className={styles.powered}>
                    Une expérience propulsée par <b>signeo.</b>
                  </div>
                </div>
                <p className={styles.previewCaption}>
                  <Icon name="info" /> Une illustration de l’expérience de vos
                  destinataires. Vos modifications s’affichent instantanément.
                </p>
                <div className={styles.tip}>
                  <span>✦</span>
                  <div>
                    <b>Une marque qui inspire confiance.</b>
                    <p>
                      Un nom reconnaissable et votre logo aident vos
                      destinataires à identifier vos invitations.
                    </p>
                  </div>
                </div>
              </aside>
            </div>
            <div className={styles.saveBar}>
              <div>
                <span className={dirty ? styles.unsavedDot : styles.savedDot} />
                <span>
                  {loading
                    ? "Chargement de votre marque…"
                    : loadError
                      ? "Paramètres indisponibles"
                      : dirty
                        ? "Modifications non enregistrées"
                        : "Votre marque est à jour"}
                  <small>
                    Appliqué à vos prochaines enveloppes uniquement.
                  </small>
                </span>
              </div>
              <div>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={!dirty || busy}
                  onClick={() => {
                    if (savedBranding) setBranding({ ...savedBranding });
                    setNotice("");
                  }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  form="brand-form"
                  className={styles.primary}
                  disabled={busy || loading || loadError || !dirty}
                >
                  <Icon name="check" />
                  {busy ? "Enregistrement…" : "Enregistrer les modifications"}
                </button>
              </div>
            </div>
          </>
        )}
        {section === "identity" && (
          <div className={styles.accountGrid}>
            <section className={styles.accountCard}>
              <span className={styles.largeIcon}>
                <Icon name="shield" />
              </span>
              <span className={styles.kicker}>LA CONFIANCE COMMENCE ICI</span>
              <h3>Votre identité, confirmée.</h3>
              <p>
                Retrouvez le statut de votre vérification et accédez au parcours
                sécurisé de notre prestataire.
              </p>
              <div className={styles.statusBadge}>
                {loading ? "Chargement…" : identityLabel}
              </div>
              {identity.rejectionReason && (
                <p role="alert">{identity.rejectionReason}</p>
              )}
              {identity.verifiedAt && (
                <p>
                  Vérifiée le{" "}
                  {new Date(identity.verifiedAt).toLocaleDateString("fr-FR")}
                </p>
              )}
              {identity.status !== "VERIFIED" && (
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => void startIdentityVerification()}
                  disabled={busy || loading || loadError}
                >
                  {busy
                    ? "Ouverture…"
                    : identity.status === "PENDING"
                      ? "Reprendre la vérification"
                      : "Vérifier mon identité"}
                  <span>↗</span>
                </button>
              )}
            </section>
            <aside className={styles.explainer}>
              <span className={styles.kicker}>COMMENT ÇA SE PASSE ?</span>
              <h3>
                Un parcours dédié.
                <br />
                En toute simplicité.
              </h3>
              {[
                "Ouvrez le parcours de vérification sécurisé.",
                "Suivez les étapes indiquées par le prestataire.",
                "Retrouvez votre statut dans cet espace.",
              ].map((text, index) => (
                <div key={text}>
                  <span>0{index + 1}</span>
                  <p>{text}</p>
                </div>
              ))}
            </aside>
          </div>
        )}
        {section === "billing" && (
          <div className={styles.accountGrid}>
            <section className={styles.accountCard}>
              <span className={styles.kicker}>VOTRE ESPACE DE FACTURATION</span>
              <h3>Tout est à sa place.</h3>
              {billing ? (
                <>
                  <p>{billing.organization.name}</p>
                  <div className={styles.planLine}>
                    <span>
                      Votre forfait<strong>{billing.plan}</strong>
                    </span>
                    <Icon name="card" />
                  </div>
                  <div className={styles.usage}>
                    <span>
                      Enveloppes ce mois
                      <b>
                        {billing.usage.envelopesThisMonth} /{" "}
                        {billing.usage.includedEnvelopesPerMonth}
                      </b>
                    </span>
                    <progress
                      max={Math.max(1, billing.usage.includedEnvelopesPerMonth)}
                      value={billing.usage.envelopesThisMonth}
                    />
                  </div>
                  {role === "ADMIN" ? (
                    <form onSubmit={saveBilling}>
                      <label className={styles.field}>
                        E-mail de facturation
                        <input
                          required
                          type="email"
                          value={billingEmail}
                          onChange={(event) =>
                            setBillingEmail(event.target.value)
                          }
                        />
                      </label>
                      <button
                        className={styles.primary}
                        type="submit"
                        disabled={
                          busy || billingEmail === (billing.billingEmail ?? "")
                        }
                      >
                        Enregistrer l’adresse
                      </button>
                    </form>
                  ) : (
                    <p>Seul un administrateur peut modifier la facturation.</p>
                  )}
                </>
              ) : (
                <p>
                  {loading
                    ? "Chargement de la facturation…"
                    : "La facturation est indisponible. Actualisez la page pour réessayer."}
                </p>
              )}
            </section>
            <aside className={styles.explainer}>
              <span className={styles.kicker}>
                DE LA PLACE POUR VOS AMBITIONS
              </span>
              <h3>
                Votre activité grandit.
                <br />
                Votre espace aussi.
              </h3>
              <p>
                Gérez votre abonnement, vos moyens de paiement et vos factures
                depuis le portail sécurisé Stripe.
              </p>
              {billing && role === "ADMIN" && (
                <div className={styles.billingActions}>
                  <button
                    className={styles.primary}
                    disabled={busy}
                    onClick={() => void billingAction("portal")}
                  >
                    Gérer mon abonnement ↗
                  </button>
                  <button
                    className={styles.secondary}
                    disabled={busy}
                    onClick={() => void billingAction("checkout", "BUSINESS")}
                  >
                    Découvrir Business ↗
                  </button>
                  <button
                    className={styles.secondary}
                    disabled={busy}
                    onClick={() => void billingAction("checkout", "ENTERPRISE")}
                  >
                    Découvrir Enterprise ↗
                  </button>
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function BrandLogo({ url }: { url: string }) {
  const [failedUrl, setFailedUrl] = useState("");
  // Remote organization logos cannot be enumerated in Next's image configuration.
  return url && failedUrl !== url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Logo de votre organisation"
      onError={() => setFailedUrl(url)}
    />
  ) : (
    <SigneoMark />
  );
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    brand: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" />
        <path d="m19 3 .5 1.5L21 5l-1.5.5L19 7l-.5-1.5L17 5l1.5-.5Z" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z" />
        <path d="m8.5 12 2.5 2.5 4.5-5" />
      </>
    ),
    card: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M3 10h18M7 15h4" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    type: (
      <>
        <path d="M4 5h12M10 5v14M7 19h6M4 5v3M16 5v3M17 12h5M19.5 12v7" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    file: (
      <>
        <path d="M14 3H5v18h14V8Z M14 3v5h5M8 12h8M8 16h5" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7v1" />
      </>
    ),
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
