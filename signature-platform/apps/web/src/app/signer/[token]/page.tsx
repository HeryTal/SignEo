"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { FormEvent, useEffect, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const PdfPages = dynamic(() => import("../../ui/pdf-pages"), {
  ssr: false,
  loading: () => <p className="pdf-viewer-message">Ouverture du document…</p>,
});
type FieldType =
  | "SIGNATURE"
  | "SIGN_DATE"
  | "SIGNER_NAME"
  | "SIGNER_EMAIL"
  | "INITIALS"
  | "READ_ONLY_TEXT"
  | "TEXT"
  | "MENTION"
  | "CHECKBOX"
  | "RADIO";
type PublicField = {
  id: string;
  type: FieldType;
  pageNumber: number;
  x: number;
  y: number;
  label: string;
  options?: string[];
  fontFamily?: "SANS" | "SERIF" | "MONO" | "SCRIPT";
  fontSize?: number;
  fontColor?: string;
  signatureDisplay?: "MINIMAL" | "DETAILED";
  width?: number;
  height?: number;
  dateValue?: string;
};
type PublicCollectionRequest = { id: string; label: string; required: boolean };
type Invitation = {
  recipient: { name: string; email: string; role: string; status: string };
  envelope: {
    title: string;
    message: string;
    allowDecline: boolean;
    expiresAt: string | null;
    signatureLevel: string;
    branding: { displayName: string; accentColor: string; logoUrl: string };
    cryptographicPdfEnabled: boolean;
  };
  documents: {
    id: string;
    name: string;
    mimeType: string;
    url: string;
    fields: PublicField[];
  }[];
  collectionRequests: PublicCollectionRequest[];
  collectionFiles: { requestId: string; name: string }[];
};

export default function SignerPage() {
  const { token } = useParams<{ token: string }>();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [signatureName, setSignatureName] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [uploadedCollections, setUploadedCollections] = useState<
    Record<string, string>
  >({});
  const [uploadingCollection, setUploadingCollection] = useState<string | null>(
    null,
  );
  useEffect(() => {
    fetch(`${API}/envelopes/public/${token}`)
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Ce lien est invalide ou a déjà été utilisé.");
        return response.json();
      })
      .then((payload) => {
        setInvitation(payload);
        setSignatureName(payload.recipient.name);
        const today = new Date();
        const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        setFieldValues(Object.fromEntries((payload as Invitation).documents.flatMap((document) => document.fields.filter((field) => field.type === "SIGN_DATE").map((field) => [field.id, field.dateValue || localDate]))));
        setUploadedCollections(
          Object.fromEntries(
            (payload.collectionFiles ?? []).map(
              (file: { requestId: string; name: string }) => [
                file.requestId,
                file.name,
              ],
            ),
          ),
        );
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, [token]);
  async function sign(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API}/envelopes/public/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureName, consent, fieldValues }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          payload?.message ?? "La signature n’a pas pu être enregistrée.",
        );
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erreur inattendue.");
    } finally {
      setBusy(false);
    }
  }
  async function decline() {
    if (
      !window.confirm(
        "Refuser cette invitation ? Ce choix sera enregistré dans l’historique.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API}/envelopes/public/${token}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          payload?.message ?? "Le refus n’a pas pu être enregistré.",
        );
      setDeclined(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erreur inattendue.");
    } finally {
      setBusy(false);
    }
  }
  async function uploadCollection(requestId: string, file?: File) {
    if (!file) return;
    setUploadingCollection(requestId);
    setError("");
    try {
      const data = new FormData();
      data.append("file", file);
      const response = await fetch(
        `${API}/envelopes/public/${token}/collections/${requestId}`,
        { method: "POST", body: data },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          payload?.message ?? "Le document n’a pas pu être envoyé.",
        );
      setUploadedCollections((current) => ({
        ...current,
        [requestId]: payload.name,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erreur inattendue.");
    } finally {
      setUploadingCollection(null);
    }
  }
  const isApprover = invitation?.recipient.role === "APPROVER";
  return (
    <main className="signer-shell" style={{ ["--brand-accent" as string]: invitation?.envelope.branding?.accentColor || "#496b50" } as CSSProperties}>
      <header className="signer-header" style={{ borderBottomColor: invitation?.envelope.branding?.accentColor || undefined }}>
        <Link href="/" className="brand">
          {invitation?.envelope.branding?.logoUrl ? <img className="signer-logo" src={invitation.envelope.branding.logoUrl} alt="" /> : <span className="brand-mark">s.</span>}{invitation?.envelope.branding?.displayName || "Signeo"}
        </Link>
        <span>
          {isApprover ? "Approbation sécurisée" : "Signature sécurisée"}
        </span>
      </header>
      {loading ? (
        <p className="envelope-loading">Ouverture de votre invitation…</p>
      ) : error && !invitation ? (
        <section className="signer-message">
          <span>!</span>
          <h1>L’invitation n’est pas disponible</h1>
          <p>{error}</p>
        </section>
      ) : done ? (
        <section className="signer-message">
          <span>✓</span>
          <p className="eyebrow">
            {isApprover ? "APPROBATION ENREGISTRÉE" : "SIGNATURE ENREGISTRÉE"}
          </p>
          <h1>Merci, {signatureName}.</h1>
          <p>
            Votre réponse a été ajoutée à l’historique de l’enveloppe. Vous
            pouvez fermer cette page.
          </p>
        </section>
      ) : declined ? (
        <section className="signer-message">
          <span>↩</span>
          <p className="eyebrow">REFUS ENREGISTRÉ</p>
          <h1>Invitation refusée</h1>
          <p>
            Le créateur de l’enveloppe retrouvera ce refus dans son historique.
          </p>
        </section>
      ) : (
        invitation && (
          <>
            <section className="signer-intro">
              <p className="eyebrow">
                {isApprover ? "DOCUMENT À APPROUVER" : "DOCUMENT À SIGNER"}
              </p>
              <h1>{invitation.envelope.title}</h1>
              <p>
                Bonjour {invitation.recipient.name}.{" "}
                {invitation.envelope.message}
              </p>
              {!isApprover && <small>Niveau actuel : {invitation.envelope.signatureLevel === "SIMPLE" ? "signature simple" : invitation.envelope.signatureLevel.toLowerCase()}.</small>}
              {invitation.envelope.expiresAt && (
                <small>
                  À traiter avant le{" "}
                  {new Date(invitation.envelope.expiresAt).toLocaleDateString(
                    "fr-FR",
                  )}
                  .
                </small>
              )}
            </section>
            <section className="signer-documents">
              {invitation.documents.map((doc) => (
                <article key={doc.id}>
                  <div>
                    <span>▤</span>
                    <b>{doc.name}</b>
                  </div>
                  {doc.mimeType === "application/pdf" ? (
                    <PdfPages
                      file={`${API}${doc.url}`}
                      renderOverlay={(pageNumber) =>
                        doc.fields
                          .filter((field) => field.pageNumber === pageNumber)
                          .map((field) => {
                            const style = {
                              left: `${field.x}%`,
                              top: `${field.y}%`,
                              ...(field.width ? { width: `${field.width}%`, minWidth: 0, transform: "none" } : {}),
                              ...(field.height ? { minHeight: `${field.height}%` } : {}),
                              color: field.fontColor ?? "#24352b",
                              fontSize: `${field.fontSize ?? 11}px`,
                              fontFamily: field.fontFamily === "SCRIPT" || field.fontFamily === "SERIF" ? "Georgia, serif" : field.fontFamily === "MONO" ? "monospace" : "Arial, sans-serif",
                              fontStyle: field.fontFamily === "SCRIPT" ? "italic" : "normal",
                            };
                            const setValue = (value: string) =>
                              setFieldValues((values) => ({
                                ...values,
                                [field.id]: value,
                              }));
                            const inputClass =
                              "signer-positioned-field signer-field-" +
                              field.type.toLowerCase();
                            if (field.type === "READ_ONLY_TEXT")
                              return (
                                <span
                                  key={field.id}
                                  className={inputClass}
                                  style={style}
                                >
                                  {field.label}
                                </span>
                              );
                            if (field.type === "SIGN_DATE")
                              return (
                                <label
                                  key={field.id}
                                  className={inputClass}
                                  style={style}
                                >
                                  <input type="date" aria-label="Date de signature" required value={fieldValues[field.id] ?? ""} onChange={(event) => setValue(event.target.value)} />
                                </label>
                              );
                            if (field.type === "SIGNER_NAME")
                              return (
                                <span
                                  key={field.id}
                                  className={inputClass}
                                  style={style}
                                >
                                  {invitation.recipient.name}
                                </span>
                              );
                            if (field.type === "SIGNER_EMAIL")
                              return (
                                <span
                                  key={field.id}
                                  className={inputClass}
                                  style={style}
                                >
                                  {invitation.recipient.email}
                                </span>
                              );
                            if (field.type === "CHECKBOX")
                              return (
                                <label
                                  key={field.id}
                                  className={inputClass + " signer-choice"}
                                  style={style}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <input
                                    type="checkbox"
                                    checked={fieldValues[field.id] === "true"}
                                    onChange={(event) =>
                                      setValue(
                                        event.target.checked ? "true" : "false",
                                      )
                                    }
                                  />
                                  {field.label}
                                </label>
                              );
                            if (field.type === "RADIO")
                              return (
                                <fieldset
                                  key={field.id}
                                  className={
                                    inputClass + " signer-choice signer-radio"
                                  }
                                  style={style}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <legend>{field.label}</legend>
                                  {(field.options ?? []).map((option) => (
                                    <label key={option}>
                                      <input
                                        type="radio"
                                        name={field.id}
                                        value={option}
                                        checked={
                                          fieldValues[field.id] === option
                                        }
                                        onChange={() => setValue(option)}
                                      />
                                      {option}
                                    </label>
                                  ))}
                                </fieldset>
                              );
                            return (
                              <label
                                key={field.id}
                                className={inputClass}
                                style={style}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <span>{field.label}</span>
                                <input
                                  aria-label={field.label}
                                  placeholder={
                                    field.type === "SIGNATURE"
                                      ? "Signez en saisissant votre nom"
                                      : "Votre réponse"
                                  }
                                  value={
                                    field.type === "SIGNATURE"
                                      ? signatureName
                                      : (fieldValues[field.id] ?? "")
                                  }
                                  style={{ color: field.fontColor ?? "#24352b", fontSize: `${field.fontSize ?? 11}px`, fontFamily: field.fontFamily === "SCRIPT" || field.fontFamily === "SERIF" ? "Georgia, serif" : field.fontFamily === "MONO" ? "monospace" : "Arial, sans-serif", fontStyle: field.fontFamily === "SCRIPT" ? "italic" : "normal" }}
                                  onChange={(event) => {
                                    if (field.type === "SIGNATURE")
                                      setSignatureName(event.target.value);
                                    else setValue(event.target.value);
                                  }}
                                />
                                {field.type === "SIGNATURE" && field.signatureDisplay === "DETAILED" && <small>{new Date().toLocaleDateString("fr-FR")} · {invitation.recipient.email}</small>}
                              </label>
                            );
                          })
                      }
                    />
                  ) : (
                    <p>
                      Ce DOCX est bien reçu. L’aperçu dans le navigateur
                      nécessite une conversion PDF.
                    </p>
                  )}
                </article>
              ))}
            </section>
            {!!invitation.collectionRequests?.length && (
              <section className="collection-upload-list">
                <h2>Documents demandés</h2>
                {invitation.collectionRequests.map((request) => (
                  <div className="collection-upload-item" key={request.id}>
                    <span>
                      <b>{request.label}</b>
                      <small>
                        {request.required ? "Obligatoire" : "Facultatif"}
                        {uploadedCollections[request.id]
                          ? " · " + uploadedCollections[request.id]
                          : ""}
                      </small>
                    </span>
                    <label>
                      {uploadingCollection === request.id
                        ? "Envoi…"
                        : uploadedCollections[request.id]
                          ? "Remplacer"
                          : "Joindre un fichier"}
                      <input
                        type="file"
                        accept=".pdf,.docx,application/pdf"
                        hidden
                        disabled={uploadingCollection === request.id}
                        onChange={(event) => {
                          void uploadCollection(
                            request.id,
                            event.target.files?.[0],
                          );
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>
                ))}
              </section>
            )}
            <form className="signer-form" onSubmit={sign}>
              <p className="eyebrow">
                {isApprover ? "VOTRE APPROBATION" : "VOTRE SIGNATURE"}
              </p>
              <h2>
                {isApprover
                  ? "Confirmez votre approbation"
                  : "Confirmez votre identité"}
              </h2>
              <label className="form-field">
                {isApprover ? "Nom de l’approbateur" : "Nom à inscrire"}
                <input
                  required
                  value={signatureName}
                  onChange={(event) => setSignatureName(event.target.value)}
                />
              </label>
              {!isApprover && (
                <div className="signature-preview" style={(() => {
                  const signatureField = invitation.documents.flatMap((document) => document.fields).find((field) => field.type === "SIGNATURE");
                  return signatureField ? { color: signatureField.fontColor, fontSize: signatureField.fontSize, fontFamily: signatureField.fontFamily === "SCRIPT" || signatureField.fontFamily === "SERIF" ? "Georgia, serif" : "Arial, sans-serif", fontStyle: signatureField.fontFamily === "SCRIPT" ? "italic" : "normal" } : undefined;
                })()}>
                  {signatureName || "Votre nom"}
                </div>
              )}
              <label className="consent-check">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                <span>
                  {isApprover
                    ? "J’ai examiné le document et je confirme son approbation."
                    : "Je confirme avoir lu le document et je consens à enregistrer ma signature électronique."}
                </span>
              </label>
              <p className="prototype-note">
                Signeo conserve votre accord et son horodatage. {invitation.envelope.cryptographicPdfEnabled
                  ? "Après la dernière signature, le PDF sera scellé avec le certificat configuré par l’organisation."
                  : "Le scellement cryptographique du PDF n’est pas activé : l’organisation doit configurer son certificat serveur (.p12)."}
              </p>
              {error && (
                <p className="upload-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="envelope-next send-button"
                style={{ background: "var(--brand-accent)" }}
                disabled={busy || !consent}
              >
                {busy
                  ? "Enregistrement…"
                  : isApprover
                    ? "Approuver le document →"
                    : "Signer le document →"}
              </button>
              {invitation.envelope.allowDecline && (
                <button
                  type="button"
                  className="decline-invitation"
                  disabled={busy}
                  onClick={decline}
                >
                  Refuser l’invitation
                </button>
              )}
            </form>
          </>
        )
      )}
    </main>
  );
}
