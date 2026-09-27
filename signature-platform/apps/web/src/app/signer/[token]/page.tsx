"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { FormEvent, useEffect, useState } from "react";
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
};
type Invitation = {
  recipient: { name: string; email: string; role: string; status: string };
  envelope: { title: string; message: string };
  documents: {
    id: string;
    name: string;
    mimeType: string;
    url: string;
    fields: PublicField[];
  }[];
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
  const isApprover = invitation?.recipient.role === "APPROVER";
  return (
    <main className="signer-shell">
      <header className="signer-header">
        <Link href="/" className="brand">
          <span className="brand-mark">s.</span>signeo
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
                            };
                            const setValue = (value: string) =>
                              setFieldValues((values) => ({
                                ...values,
                                [field.id]: value,
                              }));
                            const inputClass =
                              "signer-positioned-field signer-field-" +
                              field.type.toLowerCase();
                            if (field.type === "SIGN_DATE")
                              return (
                                <span
                                  key={field.id}
                                  className={inputClass}
                                  style={style}
                                >
                                  {new Date().toLocaleDateString("fr-FR")}
                                </span>
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
                                  onChange={(event) => {
                                    if (field.type === "SIGNATURE")
                                      setSignatureName(event.target.value);
                                    else setValue(event.target.value);
                                  }}
                                />
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
                <div className="signature-preview">
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
                Signeo conserve votre décision avec son horodatage dans
                l’historique de l’enveloppe. Cette version n’appose pas encore
                de certificat cryptographique dans le fichier PDF.
              </p>
              {error && (
                <p className="upload-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="envelope-next send-button"
                disabled={busy || !consent}
              >
                {busy
                  ? "Enregistrement…"
                  : isApprover
                    ? "Approuver le document →"
                    : "Signer le document →"}
              </button>
            </form>
          </>
        )
      )}
    </main>
  );
}
