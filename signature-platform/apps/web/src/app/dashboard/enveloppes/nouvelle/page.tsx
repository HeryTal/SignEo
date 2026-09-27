"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

const PdfPages = dynamic(() => import("@/app/ui/pdf-pages"), {
  ssr: false,
  loading: () => (
    <p className="pdf-viewer-message">Ouverture de l’aperçu PDF…</p>
  ),
});

type Recipient = { name: string; email: string; role: "SIGNER" | "APPROVER" };
type DocumentFile = { file: File; previewUrl?: string };
type FieldType =
  | "SIGNATURE"
  | "SIGN_DATE"
  | "SIGNER_NAME"
  | "SIGNER_EMAIL"
  | "TEXT"
  | "MENTION"
  | "CHECKBOX"
  | "RADIO";
const FIELD_TOOLS: { type: FieldType; label: string; icon: string }[] = [
  { type: "SIGNATURE", label: "Signature", icon: "✍" },
  { type: "SIGN_DATE", label: "Date de signature", icon: "▦" },
  { type: "SIGNER_NAME", label: "Nom du signataire", icon: "♙" },
  { type: "SIGNER_EMAIL", label: "E-mail du signataire", icon: "✉" },
  { type: "TEXT", label: "Saisie de texte", icon: "Tt" },
  { type: "MENTION", label: "Mention", icon: "❞" },
  { type: "CHECKBOX", label: "Case à cocher", icon: "☑" },
  { type: "RADIO", label: "Bouton radio", icon: "◉" },
];
type PlacedField = {
  id: string;
  type: FieldType;
  documentIndex: number;
  pageNumber: number;
  x: number;
  y: number;
  label: string;
  options?: string[];
};
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function NewEnvelopePage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const documentsRef = useRef<DocumentFile[]>([]);
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [selected, setSelected] = useState(0);
  const [fields, setFields] = useState<PlacedField[]>([]);
  const [placingType, setPlacingType] = useState<FieldType | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([
    { name: "", email: "", role: "SIGNER" },
  ]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invitationLinks, setInvitationLinks] = useState<
    {
      name: string;
      email: string;
      role: "SIGNER" | "APPROVER";
      signingUrl: string;
    }[]
  >([]);
  const [copied, setCopied] = useState(false);

  documentsRef.current = documents;
  useEffect(
    () => () =>
      documentsRef.current.forEach(
        (item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl),
      ),
    [],
  );

  function addFiles(fileList: FileList | File[]) {
    setError("");
    const additions: DocumentFile[] = [];
    for (const file of Array.from(fileList)) {
      const valid =
        file.name.toLowerCase().endsWith(".pdf") ||
        file.name.toLowerCase().endsWith(".docx");
      if (!valid) {
        setError(
          `${file.name} : seuls les fichiers PDF et DOCX sont acceptés.`,
        );
        continue;
      }
      if (file.size > 50 * 1024 * 1024) {
        setError(`${file.name} dépasse la limite de 50 Mo.`);
        continue;
      }
      additions.push({
        file,
        previewUrl: file.name.toLowerCase().endsWith(".pdf")
          ? URL.createObjectURL(file)
          : undefined,
      });
    }
    if (documents.length + additions.length > 10) {
      additions.forEach(
        (item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl),
      );
      setError("Une enveloppe peut contenir jusqu'à 10 documents.");
      return;
    }
    setDocuments((current) => [...current, ...additions]);
    if (!title && additions[0])
      setTitle(additions[0].file.name.replace(/\.[^.]+$/, ""));
  }

  function onInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addFiles(event.target.files);
    event.target.value = "";
  }
  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }
  function removeDocument(index: number) {
    setDocuments((items) => {
      const removed = items[index];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      const next = items.filter((_, i) => i !== index);
      setSelected(Math.max(0, Math.min(index, next.length - 1)));
      return next;
    });
  }
  function updateRecipient(index: number, key: keyof Recipient, value: string) {
    setRecipients((current) =>
      current.map((recipient, i) =>
        i === index ? { ...recipient, [key]: value } : recipient,
      ),
    );
  }

  function placeField(pageNumber: number, x: number, y: number) {
    if (!placingType) return;
    const definition = FIELD_TOOLS.find((tool) => tool.type === placingType)!;
    setFields((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        type: placingType,
        documentIndex: selected,
        pageNumber,
        x: Math.max(1, Math.min(90, x)),
        y: Math.max(2, Math.min(95, y)),
        label:
          placingType === "MENTION" ? "Mention à saisir" : definition.label,
        ...(placingType === "RADIO"
          ? { options: ["Option 1", "Option 2"] }
          : {}),
      },
    ]);
    setPlacingType(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!documents.length) {
      setStep(1);
      setError("Ajoutez au moins un document.");
      return;
    }
    if (
      !recipients.some(
        (recipient) =>
          recipient.role === "SIGNER" &&
          recipient.name.trim() &&
          recipient.email.trim(),
      )
    ) {
      setError("Ajoutez au moins un signataire avec son nom et son e-mail.");
      return;
    }
    const token = localStorage.getItem("signeo_access_token");
    if (!token) {
      router.replace("/connexion");
      return;
    }
    setBusy(true);
    try {
      const data = new FormData();
      documents.forEach(({ file }) => data.append("files", file));
      data.append("title", title);
      data.append("message", message);
      data.append(
        "fields",
        JSON.stringify(
          fields.map(
            ({
              id,
              type,
              documentIndex,
              pageNumber,
              x,
              y,
              label,
              options,
            }) => ({
              id,
              type,
              documentIndex,
              pageNumber,
              x,
              y,
              label,
              options,
            }),
          ),
        ),
      );
      data.append(
        "recipients",
        JSON.stringify(
          recipients.filter(
            (recipient) => recipient.name.trim() && recipient.email.trim(),
          ),
        ),
      );
      const created = await fetch(`${API}/envelopes`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: data,
      });
      if (!created.ok) {
        const payload = await created.json().catch(() => null);
        throw new Error(payload?.message ?? "Impossible de créer l'enveloppe.");
      }
      const envelope = await created.json();
      const sent = await fetch(`${API}/envelopes/${envelope.id}/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!sent.ok) {
        const payload = await sent.json().catch(() => null);
        throw new Error(
          payload?.message ??
            "L'enveloppe est créée mais n'a pas pu être envoyée.",
        );
      }
      const payload = await sent.json();
      setInvitationLinks(payload.invitations ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Une erreur est survenue.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyLinks() {
    await navigator.clipboard.writeText(
      invitationLinks
        .map(
          ({ name, email, signingUrl }) => `${name} (${email}) : ${signingUrl}`,
        )
        .join("\n"),
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (invitationLinks.length)
    return (
      <main className="envelope-shell">
        <section className="send-success">
          <span className="success-mark">✓</span>
          <p className="eyebrow">ENVELOPPE ENVOYÉE</p>
          <h1>Votre document est en route.</h1>
          <p>
            Les liens sont prêts. Transmettez à chaque personne son lien privé.
            L’envoi automatique par e-mail sera ajouté avec la configuration
            d’un service d’e-mail.
          </p>
          <div className="invitation-link-list">
            {invitationLinks.map((invite) => (
              <article key={invite.email}>
                <div>
                  <b>{invite.name}</b>
                  <small>
                    {invite.email} ·{" "}
                    {invite.role === "APPROVER" ? "Approbateur" : "Signataire"}
                  </small>
                </div>
                <a href={invite.signingUrl} target="_blank" rel="noreferrer">
                  Ouvrir le lien ↗
                </a>
              </article>
            ))}
          </div>
          <div className="success-actions">
            <button className="envelope-next" onClick={copyLinks}>
              {copied ? "Liens copiés ✓" : "Copier tous les liens"}
            </button>
            <Link className="secondary-action" href="/dashboard/enveloppes">
              Suivre l’enveloppe
            </Link>
          </div>
        </section>
      </main>
    );

  const current = documents[selected];
  return (
    <main className="envelope-shell">
      <header className="envelope-header">
        <Link href="/dashboard" className="envelope-brand">
          <span className="brand-mark" aria-hidden="true">
            s.
          </span>
          <span>{title || "Nouvelle enveloppe"}</span>
        </Link>
        <div className="envelope-steps">
          <span className={step === 1 ? "active" : "complete"}>
            <b>1</b> Préparation
          </span>
          <i>›</i>
          <span className={step === 2 ? "active" : ""}>
            <b>2</b> Paramètres
          </span>
        </div>
        <button
          className="envelope-next"
          type="button"
          disabled={!documents.length || step === 2}
          onClick={() => {
            setError("");
            setStep(2);
          }}
        >
          Suivant <span aria-hidden="true">→</span>
        </button>
      </header>
      {documents.length === 0 ? (
        <section className="upload-page">
          <div
            className={
              dragging ? "upload-dropzone dragging" : "upload-dropzone"
            }
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <div className="upload-icon" aria-hidden="true">
              ↑
            </div>
            <h1>Commencez par votre document</h1>
            <p>Déposez un PDF ou DOCX · 50 Mo maximum par fichier</p>
            <span className="upload-or">ou</span>
            <button type="button" onClick={() => inputRef.current?.click()}>
              +<span className="sr-only">Choisir des fichiers</span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.docx"
              multiple
              onChange={onInput}
              hidden
            />
          </div>
          {error && (
            <p className="upload-error" role="alert">
              {error}
            </p>
          )}
        </section>
      ) : step === 1 ? (
        <section className="preparation-workspace">
          <aside className="document-list">
            <div className="document-list-title">
              <span>▤</span>
              <b>Documents à envoyer</b>
              <em>{documents.length}</em>
              <button type="button" onClick={() => inputRef.current?.click()}>
                +
              </button>
            </div>
            {documents.map(({ file }, index) => (
              <div
                className={
                  selected === index
                    ? "document-list-item selected"
                    : "document-list-item"
                }
                key={`${file.name}-${index}`}
              >
                <button type="button" onClick={() => setSelected(index)}>
                  <span>{index + 1}</span>
                  <b>{file.name}</b>
                </button>
                <button
                  type="button"
                  aria-label={`Supprimer ${file.name}`}
                  onClick={() => removeDocument(index)}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              className="document-add"
              type="button"
              onClick={() => inputRef.current?.click()}
            >
              ⊕ &nbsp;Ajouter des documents
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.docx"
              multiple
              onChange={onInput}
              hidden
            />
          </aside>
          <div
            className={`document-preview${placingType ? " placing-text" : ""}`}
          >
            <div className="preview-tools">
              <span>
                {placingType
                  ? `Clique pour placer : ${FIELD_TOOLS.find((tool) => tool.type === placingType)?.label}`
                  : "Choisis un champ à droite"}
              </span>
              {placingType && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setPlacingType(null);
                  }}
                >
                  Terminer
                </button>
              )}
            </div>
            {current?.previewUrl ? (
              <PdfPages
                file={current.file}
                onPageClick={placingType ? placeField : undefined}
                renderOverlay={(pageNumber) =>
                  fields
                    .filter(
                      (field) =>
                        field.documentIndex === selected &&
                        field.pageNumber === pageNumber,
                    )
                    .map((field) => (
                      <div
                        className={`placed-field-preview field-${field.type.toLowerCase()}`}
                        key={field.id}
                        style={{ left: `${field.x}%`, top: `${field.y}%` }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <span>
                          {
                            FIELD_TOOLS.find((tool) => tool.type === field.type)
                              ?.icon
                          }
                        </span>
                        <input
                          aria-label="Libellé du champ"
                          value={field.label}
                          onChange={(event) =>
                            setFields((items) =>
                              items.map((item) =>
                                item.id === field.id
                                  ? { ...item, label: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                        <button
                          type="button"
                          aria-label="Supprimer le champ"
                          onClick={() =>
                            setFields((items) =>
                              items.filter((item) => item.id !== field.id),
                            )
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))
                }
              />
            ) : (
              <div className="docx-placeholder">
                <span>▤</span>
                <h2>{current?.file.name}</h2>
                <p>Aperçu PDF disponible après conversion du document.</p>
              </div>
            )}
          </div>
          <aside className="fields-panel">
            <div className="fields-heading">
              <b>Préparation</b>
              <span>
                {documents.length} fichier{documents.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="field-tool-grid">
              {FIELD_TOOLS.map((tool) => (
                <button
                  key={tool.type}
                  type="button"
                  className={
                    placingType === tool.type
                      ? "field-option selected-field-tool"
                      : "field-option"
                  }
                  onClick={() =>
                    setPlacingType(placingType === tool.type ? null : tool.type)
                  }
                >
                  <span>{tool.icon}</span>
                  {tool.label}
                </button>
              ))}
            </div>
            <p className="workflow-hint">
              {
                fields.filter((field) => field.documentIndex === selected)
                  .length
              }{" "}
              champ(s). Choisis un outil puis clique à l’endroit voulu dans le
              document.
            </p>
            <button
              className="envelope-next panel-next"
              type="button"
              onClick={() => setStep(2)}
            >
              Configurer les signataires →
            </button>
          </aside>
        </section>
      ) : (
        <section className="settings-workspace">
          <form onSubmit={submit} className="settings-card">
            <button
              className="back-step"
              type="button"
              onClick={() => setStep(1)}
            >
              ← Retour à la préparation
            </button>
            <p className="eyebrow">ÉTAPE 2 · PARAMÈTRES</p>
            <h1>À qui envoyer le document ?</h1>
            <p className="settings-intro">
              Un lien privé sera créé pour chaque signataire. Vous pourrez le
              copier après l’envoi.
            </p>
            <label className="form-field">
              Nom de l’enveloppe
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={160}
                placeholder="Ex. Contrat de prestation"
              />
            </label>
            <label className="form-field">
              Message d’accompagnement
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={3}
                placeholder="Bonjour, merci de consulter et signer ce document."
              />
            </label>
            <div className="settings-section-title">
              <div>
                <b>Destinataires</b>
                <small>Au moins un signataire est nécessaire.</small>
              </div>
              <button
                type="button"
                onClick={() =>
                  setRecipients((current) => [
                    ...current,
                    { name: "", email: "", role: "SIGNER" },
                  ])
                }
              >
                + Ajouter
              </button>
            </div>
            {recipients.map((recipient, index) => (
              <div className="recipient-form-row" key={index}>
                <span className="recipient-number">{index + 1}</span>
                <label className="form-field">
                  Nom
                  <input
                    required
                    value={recipient.name}
                    onChange={(event) =>
                      updateRecipient(index, "name", event.target.value)
                    }
                    placeholder="Nom complet"
                  />
                </label>
                <label className="form-field">
                  E-mail
                  <input
                    required
                    type="email"
                    value={recipient.email}
                    onChange={(event) =>
                      updateRecipient(index, "email", event.target.value)
                    }
                    placeholder="nom@exemple.fr"
                  />
                </label>
                <label className="form-field">
                  Rôle
                  <select
                    value={recipient.role}
                    onChange={(event) =>
                      updateRecipient(index, "role", event.target.value)
                    }
                  >
                    <option value="SIGNER">Signataire</option>
                    <option value="APPROVER">Approbateur</option>
                  </select>
                </label>
                {recipients.length > 1 && (
                  <button
                    className="remove-recipient"
                    type="button"
                    aria-label="Supprimer le destinataire"
                    onClick={() =>
                      setRecipients((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <div className="send-notice">
              <span>✦</span>
              <p>
                Le lien de signature est privé et propre à chaque destinataire.
                Pour cette version, transmettez-le vous-même après l’envoi.
              </p>
            </div>
            {error && (
              <p className="upload-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="envelope-next send-button"
              type="submit"
              disabled={busy}
            >
              {busy ? "Envoi en cours…" : "Envoyer l’enveloppe →"}
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
