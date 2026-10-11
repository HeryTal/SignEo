"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { clearEnvelopeDraft, loadEnvelopeDraft, saveEnvelopeDraft } from "@/app/ui/envelope-draft-store";
import { SigneoMark } from "@/app/ui/signeo-logo";

const PdfPages = dynamic(() => import("@/app/ui/pdf-pages"), {
  ssr: false,
  loading: () => (
    <p className="pdf-viewer-message">Ouverture de l’aperçu PDF…</p>
  ),
});

type Recipient = {
  id: string;
  name: string;
  email: string;
  role: "SIGNER" | "APPROVER";
  signatureLevel: "SIMPLE" | "ADVANCED" | "QUALIFIED";
  authenticationMethod: "NONE" | "EMAIL_OTP" | "SMS_OTP";
};
type DocumentFile = { file: File; previewUrl?: string; hiddenRecipientIds?: string[] };
type CollectionRequestDraft = {
  id: string;
  label: string;
  recipientId: string;
  required: boolean;
};
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
const FIELD_TOOLS: { type: FieldType; label: string; icon: string }[] = [
  { type: "SIGNATURE", label: "Signature", icon: "✍" },
  { type: "SIGN_DATE", label: "Date de signature", icon: "▦" },
  { type: "SIGNER_NAME", label: "Nom du signataire", icon: "♙" },
  { type: "SIGNER_EMAIL", label: "E-mail du signataire", icon: "✉" },
  { type: "INITIALS", label: "Paraphes", icon: "AB" },
  { type: "READ_ONLY_TEXT", label: "Texte en lecture seule", icon: "Tt" },
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
  recipientId: string;
  fontFamily: "SANS" | "SERIF" | "MONO" | "SCRIPT";
  fontSize: number;
  fontColor: string;
  signatureDisplay: "MINIMAL" | "DETAILED";
  width: number;
  height: number;
  dateValue?: string;
};
type StyleDefaults = { textFont: "SANS" | "SERIF" | "MONO"; signatureFont: "SCRIPT" | "SERIF" | "SANS"; textColor: string; signatureColor: string; textSize: number; signatureSize: number };
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function PreparationModal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="preparation-modal" onCancel={close} aria-label={title}>
    <header><h2>{title}</h2><button type="button" aria-label="Fermer" onClick={close}>×</button></header>{children}
  </dialog>;
}

export default function NewEnvelopePage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const documentsRef = useRef<DocumentFile[]>([]);
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [selected, setSelected] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [signingMode, setSigningMode] = useState<"SIMULTANEOUS" | "SEQUENTIAL" | "CUSTOM">("SIMULTANEOUS");
  const [visibilityDraft, setVisibilityDraft] = useState<string[][] | null>(null);
  const [fieldDraft, setFieldDraft] = useState<PlacedField | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [fields, setFields] = useState<PlacedField[]>([]);
  const [styleDefaults, setStyleDefaults] = useState<StyleDefaults>({ textFont: "SANS", signatureFont: "SCRIPT", textColor: "#24352b", signatureColor: "#315b45", textSize: 11, signatureSize: 22 });
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [placingType, setPlacingType] = useState<FieldType | null>(null);
  const [selectedRecipientId, setSelectedRecipientId] = useState("recipient-1");
  const [recipients, setRecipients] = useState<Recipient[]>([
    { id: "recipient-1", name: "", email: "", role: "SIGNER", signatureLevel: "SIMPLE", authenticationMethod: "NONE" },
  ]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [expiresAt, setExpiresAt] = useState(() => {
    const value = new Date();
    value.setMonth(value.getMonth() + 6);
    return value.toISOString().slice(0, 10);
  });
  const [allowDecline, setAllowDecline] = useState(false);
  const [collectionRequests, setCollectionRequests] = useState<
    CollectionRequestDraft[]
  >([]);
  const [step, setStep] = useState<1 | 2>(1);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invitationLinks, setInvitationLinks] = useState<
    {
      name: string;
      email: string;
      role: "SIGNER" | "APPROVER";
      active?: boolean;
      signingUrl: string;
      delivered?: boolean;
      deliveryReason?: string;
    }[]
  >([]);
  const [copied, setCopied] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const [previewRecipientId, setPreviewRecipientId] = useState<string | null>(null);

  useEffect(() => { documentsRef.current = documents; }, [documents]);
  useEffect(() => {
    loadEnvelopeDraft()
      .then((draft) => {
        if (!draft) return;
        setDocuments(draft.documents.map((document) => ({ ...document, previewUrl: document.file.name.toLowerCase().endsWith(".pdf") ? URL.createObjectURL(document.file) : undefined })));
        setSelected(draft.selected); setFields(draft.fields as PlacedField[]); setRecipients(draft.recipients as Recipient[]);
        setCollectionRequests(draft.collectionRequests as CollectionRequestDraft[]); setTitle(draft.title); setMessage(draft.message);
        setExpiresAt(draft.expiresAt); setAllowDecline(draft.allowDecline); setSigningMode(draft.signingMode as typeof signingMode); setStep(draft.step as 1 | 2);
        setSelectedRecipientId((draft.recipients as Recipient[]).find((recipient) => recipient.role === "SIGNER")?.id ?? "recipient-1");
        setDraftSavedAt(new Date(draft.updatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
      })
      .catch(() => setError("Le brouillon local n’a pas pu être restauré."))
      .finally(() => setDraftReady(true));
  }, []);
  useEffect(() => {
    if (!draftReady || invitationLinks.length) return;
    const timer = window.setTimeout(() => {
      saveEnvelopeDraft({ updatedAt: new Date().toISOString(), title, message, documents: documents.map(({ file, hiddenRecipientIds }) => ({ file, hiddenRecipientIds })), selected, fields, recipients, collectionRequests, expiresAt, allowDecline, signingMode, step })
        .then(() => setDraftSavedAt(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })))
        .catch(() => setError("Le brouillon local n’a pas pu être sauvegardé."));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [draftReady, title, message, documents, selected, fields, recipients, collectionRequests, expiresAt, allowDecline, signingMode, step, invitationLinks.length]);
  useEffect(
    () => () =>
      documentsRef.current.forEach(
        (item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl),
      ),
    [],
  );
  useEffect(() => {
    const token = localStorage.getItem("signeo_access_token");
    if (!token) return;
    fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => { if (response.ok) { const profile = await response.json(); if (profile.branding) setStyleDefaults(profile.branding); } })
      .catch(() => setError("Les styles enregistrés n’ont pas pu être chargés. Les styles par défaut seront utilisés."));
  }, []);

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
    if (documents.length + additions.length > 50) {
      additions.forEach(
        (item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl),
      );
      setError("Une enveloppe peut contenir jusqu'à 50 documents.");
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
    setFields((current) =>
      current
        .filter((field) => field.documentIndex !== index)
        .map((field) =>
          field.documentIndex > index
            ? { ...field, documentIndex: field.documentIndex - 1 }
            : field,
        ),
    );
    setDocuments((items) => {
      const removed = items[index];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      const next = items.filter((_, i) => i !== index);
      setSelected(Math.max(0, Math.min(index, next.length - 1)));
      return next;
    });
  }
  function reorderDocument(from: number, to: number) {
    if (to < 0 || to >= documents.length || from === to) return;
    const order = documents.map((_, index) => index);
    order.splice(to, 0, order.splice(from, 1)[0]);
    setDocuments(order.map((index) => documents[index]));
    setFields((items) => items.map((field) => ({ ...field, documentIndex: order.indexOf(field.documentIndex) })));
    setSelected(order.indexOf(selected));
  }
  function removeRecipient(id: string) {
    setRecipients((items) => items.filter((item) => item.id !== id));
    setFields((items) => items.filter((item) => item.recipientId !== id));
    setCollectionRequests((items) => items.filter((item) => item.recipientId !== id));
    if (selectedRecipientId === id) setSelectedRecipientId(recipients.find((item) => item.id !== id && item.role === "SIGNER")?.id ?? "");
  }
  function addRecipient(role: Recipient["role"]) {
    if (recipients.filter((item) => item.role === role).length >= (role === "SIGNER" ? 100 : 10)) return;
    const id = crypto.randomUUID();
    setRecipients((items) => [...items, { id, name: "", email: "", role, signatureLevel: "SIMPLE", authenticationMethod: "NONE" }]);
    if (role === "SIGNER") setSelectedRecipientId(id);
  }
  function reorderRecipient(index: number, offset: number) {
    setRecipients((items) => { const next = [...items]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; return next; });
  }
  function moveField(
    event: ReactPointerEvent<HTMLDivElement>,
    fieldId: string,
  ) {
    if ((event.target as HTMLElement).closest("input, button, select")) return;
    const page = event.currentTarget.closest(".pdf-page-canvas");
    if (!page) return;
    event.preventDefault();
    const bounds = page.getBoundingClientRect();
    const move = (pointer: PointerEvent) => {
      setFields((current) =>
        current.map((field) =>
          field.id === fieldId
            ? {
                ...field,
                x: Math.max(
                  1,
                  Math.min(
                    100 - field.width,
                    field.x + (pointer.movementX / bounds.width) * 100,
                  ),
                ),
                y: Math.max(
                  2,
                  Math.min(
                    100 - field.height,
                    field.y + (pointer.movementY / bounds.height) * 100,
                  ),
                ),
              }
            : field,
        ),
      );
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }
  function updateRecipient(index: number, key: keyof Recipient, value: string) {
    if (
      key === "role" &&
      value === "APPROVER" &&
      recipients[index].role !== "APPROVER" &&
      recipients.filter((recipient) => recipient.role === "APPROVER").length >=
        10
    ) {
      setError("Une invitation peut avoir au maximum 10 approbateurs.");
      return;
    }
    setRecipients((current) =>
      current.map((recipient, i) =>
        i === index ? { ...recipient, [key]: value } : recipient,
      ),
    );
    if (key === "role" && value === "APPROVER") {
      const id = recipients[index].id;
      setFields((items) => items.filter((item) => item.recipientId !== id));
      setCollectionRequests((items) => items.filter((item) => item.recipientId !== id));
      if (selectedRecipientId === id) setSelectedRecipientId(recipients.find((item) => item.id !== id && item.role === "SIGNER")?.id ?? "");
    }
  }

  function placeField(pageNumber: number, x: number, y: number, type = placingType) {
    if (!type || !FIELD_TOOLS.some((tool) => tool.type === type)) return;
    if (type !== "READ_ONLY_TEXT" && !recipients.some((item) => item.id === selectedRecipientId && item.role === "SIGNER")) { setError("Ajoutez et sélectionnez un signataire."); return; }
    if (documents[selected]?.hiddenRecipientIds?.includes(selectedRecipientId)) { setError("Ce document est masqué pour ce signataire. Modifiez sa visibilité avant d’ajouter un champ."); return; }
    const definition = FIELD_TOOLS.find((tool) => tool.type === type)!;
    const placingType = type;
    setFields((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        type: placingType,
        recipientId: selectedRecipientId,
        documentIndex: selected,
        pageNumber,
        x: Math.max(1, Math.min(68, x)),
        y: Math.max(2, Math.min(90, y)),
        width: 30,
        height: placingType === "SIGNATURE" ? 9 : 4,
        signatureDisplay: "MINIMAL",
        label:
          placingType === "MENTION"
            ? "Mention à saisir"
            : placingType === "READ_ONLY_TEXT"
              ? "Texte à afficher"
              : definition.label,
        fontFamily: placingType === "SIGNATURE" || placingType === "INITIALS" ? styleDefaults.signatureFont : styleDefaults.textFont,
        fontSize: placingType === "SIGNATURE" || placingType === "INITIALS" ? styleDefaults.signatureSize : styleDefaults.textSize,
        fontColor: placingType === "SIGNATURE" || placingType === "INITIALS" ? styleDefaults.signatureColor : styleDefaults.textColor,
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
    if (recipients.some((recipient) => !recipient.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email.trim()))) {
      setError("Complétez le nom et l’e-mail de chaque destinataire.");
      return;
    }
    if (fields.some((field) => !recipients.some((recipient) => recipient.id === field.recipientId && recipient.role === "SIGNER"))) {
      setError("Attribuez chaque champ à un signataire avant l’envoi.");
      return;
    }
    const signers = recipients.filter((recipient) => recipient.role === "SIGNER");
    const unsigned = signers.find((recipient) => !fields.some((field) => field.type === "SIGNATURE" && field.recipientId === recipient.id));
    if (unsigned) { setStep(1); setError(`Placez une signature pour ${unsigned.name || unsigned.email || "chaque signataire"}.`); return; }
    if (collectionRequests.some((request) => !request.label.trim() || !signers.some((recipient) => recipient.id === request.recipientId))) {
      setError("Complétez chaque demande de document à collecter."); return;
    }
    const invalidRadio = fields.find((field) => field.type === "RADIO" && (!field.options || field.options.length < 2 || field.options.some((option) => !option.trim())));
    if (invalidRadio) { setStep(1); setError("Chaque bouton radio doit avoir au moins deux choix valides."); return; }
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
      data.append("expiresAt", expiresAt + "T23:59:59.999Z");
      data.append("allowDecline", String(allowDecline));
      data.append("preparationSettings", JSON.stringify({ signingMode, documentVisibility: documents.map((document) => recipients.filter((recipient) => !document.hiddenRecipientIds?.includes(recipient.id)).map((recipient) => recipient.email.trim().toLowerCase())) }));
      data.append(
        "collectionRequests",
        JSON.stringify(
          collectionRequests.map(({ id, label, recipientId, required }) => ({
            id,
            label,
            recipientEmail: recipients.find(
              (recipient) => recipient.id === recipientId,
            )?.email,
            required,
          })),
        ),
      );
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
              recipientId,
              fontFamily,
              fontSize,
              fontColor,
              signatureDisplay,
              width,
              height,
              dateValue,
            }) => ({
              id,
              type,
              documentIndex,
              pageNumber,
              x,
              y,
              label,
              options,
              recipientEmail: recipients.find(
                (recipient) => recipient.id === recipientId,
              )?.email,
              fontFamily,
              fontSize,
              fontColor,
              signatureDisplay,
              width,
              height,
              dateValue,
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
      const deliveries = new Map(
        (payload.deliveries ?? []).map(
          (delivery: { email: string; delivered: boolean; reason?: string }) => [delivery.email, delivery],
        ),
      );
      setInvitationLinks(
        (payload.invitations ?? []).map((invite: { name: string; email: string; role: "SIGNER" | "APPROVER"; active?: boolean; signingUrl: string }) => {
          const delivery = deliveries.get(invite.email) as { delivered: boolean; reason?: string } | undefined;
          return { ...invite, delivered: delivery?.delivered, deliveryReason: delivery?.reason };
        }),
      );
      await clearEnvelopeDraft();
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

  if (invitationLinks.length) {
    const activeInvitations = invitationLinks.filter((invite) => invite.active !== false);
    const laterInvitations = invitationLinks.filter((invite) => invite.active === false);
    const deliveryFailures = activeInvitations.filter((invite) => invite.delivered === false);
    const deliveredCount = activeInvitations.filter((invite) => invite.delivered).length;
    return (
      <main className="envelope-shell">
        <section className="send-success">
          <span className="success-mark">✓</span>
          <p className="eyebrow">ENVELOPPE ENVOYÉE</p>
          <h1>Votre document est en route.</h1>
          <p>{deliveryFailures.length
            ? `${deliveredCount} e-mail${deliveredCount > 1 ? "s" : ""} envoyé${deliveredCount > 1 ? "s" : ""} pour le premier groupe. Les liens restent disponibles pour les invitations non distribuées.`
            : "L’enveloppe a été créée et les invitations du premier groupe sont prêtes."} {laterInvitations.length ? `${laterInvitations.length} destinataire${laterInvitations.length > 1 ? "s" : ""} recevront leur invitation après l’étape précédente.` : "Les liens privés restent disponibles ci-dessous."}</p>
          <div className="invitation-link-list">
            {invitationLinks.map((invite) => (
              <article key={invite.email}>
                <div>
                  <b>{invite.name}</b>
                  <small>
                    {invite.email} ·{" "}
                    {invite.role === "APPROVER" ? "Approbateur" : "Signataire"}
                    {invite.active === false ? " · Invitation après l’étape précédente" : ""}
                    {invite.delivered === true ? " · E-mail envoyé" : ""}
                    {invite.delivered === false ? " · E-mail non envoyé" : ""}
                  </small>
                  {invite.deliveryReason && <small>Raison : {invite.deliveryReason}</small>}
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
  }

  const current = documents[selected];
  return (
    <main className="envelope-shell">
      <header className="envelope-header">
        <Link href="/dashboard" className="envelope-brand">
          <SigneoMark />
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
        <small className="draft-status">{draftReady ? draftSavedAt ? `Brouillon sauvegardé à ${draftSavedAt}` : "Brouillon prêt" : "Restauration du brouillon…"}</small>
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
                draggable
                onDragStart={(event) => event.dataTransfer.setData("application/signeo-document", String(index))}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); const from = event.dataTransfer.getData("application/signeo-document"); if (from !== "") reorderDocument(Number(from), index); }}
              >
                <button type="button" onClick={() => setSelected(index)}>
                  <span>{index + 1}</span>
                  <b>{file.name}</b>
                </button>
                <button type="button" aria-label={`Monter ${file.name}`} disabled={index === 0} onClick={() => reorderDocument(index, index - 1)}>↑</button>
                <button type="button" aria-label={`Descendre ${file.name}`} disabled={index === documents.length - 1} onClick={() => reorderDocument(index, index + 1)}>↓</button>
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
            <section className="preparation-collection">
              <div className="document-list-title"><span>⇧</span><b>Documents à collecter</b><em>{collectionRequests.length}</em></div>
              {collectionRequests.map((request) => <p key={request.id}>{request.label || "Document à préciser"}<small>{recipients.find((item) => item.id === request.recipientId)?.name}</small></p>)}
              <button className="document-add" type="button" onClick={() => setCollecting(true)}>⊕ Demander un document</button>
            </section>
          </aside>
          <div
            className={`document-preview${placingType ? " placing-text" : ""}`}
          >
            <div className="preview-tools">
              <div className="preview-tool-group"><button type="button" aria-label="Réduire le zoom" disabled={zoom <= 50} onClick={() => setZoom(zoom - 25)}>−</button><output>{zoom}%</output><button type="button" aria-label="Augmenter le zoom" disabled={zoom >= 200} onClick={() => setZoom(zoom + 25)}>+</button></div>
              <div className="preview-tool-group"><button type="button" aria-label="Document précédent" disabled={selected === 0} onClick={() => setSelected(selected - 1)}>←</button><span>Doc. {selected + 1}/{documents.length} · {current?.file.name}</span><button type="button" aria-label="Document suivant" disabled={selected === documents.length - 1} onClick={() => setSelected(selected + 1)}>→</button></div>
              <button type="button" onClick={() => setVisibilityDraft(documents.map((document) => [...(document.hiddenRecipientIds ?? [])]))}>▤ Visible par {recipients.filter((recipient) => !current?.hiddenRecipientIds?.includes(recipient.id)).length} destinataire(s)</button>
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
                zoom={zoom}
                onFieldDrop={(page, x, y, type) => placeField(page, x, y, type as FieldType)}
                onPageClick={(page, x, y) => { setSelectedFieldId(null); if (placingType) placeField(page, x, y); }}
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
                        style={{ left: `${field.x}%`, top: `${field.y}%`, width: `${field.width}%`, minHeight: `${field.height}%`, color: field.fontColor, fontSize: `${field.fontSize}px`, fontFamily: field.fontFamily === "SCRIPT" || field.fontFamily === "SERIF" ? "Georgia, serif" : field.fontFamily === "MONO" ? "monospace" : "Arial, sans-serif", fontStyle: field.fontFamily === "SCRIPT" ? "italic" : "normal", background: recipients.findIndex((recipient) => recipient.id === field.recipientId) % 2 ? "#e5def8ee" : "#dfeefbee" }}
                        onPointerDown={(event) => { setSelectedFieldId(field.id); moveField(event, field.id); }}
                        onFocus={() => setSelectedFieldId(field.id)}
                        onClick={(event) => event.stopPropagation()}
                        onClickCapture={() => setSelectedFieldId(field.id)}
                      >
                        {field.type === "SIGNATURE" ? <div className="signature-stamp"><strong>{recipients.find((item) => item.id === field.recipientId)?.name || "Nom du signataire"}</strong>{field.signatureDisplay === "DETAILED" && <small>JJ/MM/AAAA · {recipients.find((item) => item.id === field.recipientId)?.email}</small>}<small>Signature électronique · Signeo</small></div> : <><span>
                          {
                            FIELD_TOOLS.find((tool) => tool.type === field.type)
                              ?.icon
                          }
                        </span>
                        <input
                          aria-label={FIELD_TOOLS.find((tool) => tool.type === field.type)?.label ?? "Libellé du champ"}
                          type={field.type === "SIGN_DATE" ? "date" : "text"}
                          readOnly={field.type === "SIGNER_NAME" || field.type === "SIGNER_EMAIL"}
                          placeholder={field.label}
                          value={field.type === "SIGNER_NAME"
                            ? recipients.find((recipient) => recipient.id === field.recipientId)?.name ?? ""
                            : field.type === "SIGNER_EMAIL"
                              ? recipients.find((recipient) => recipient.id === field.recipientId)?.email ?? ""
                              : field.type === "SIGN_DATE" ? field.dateValue ?? "" : field.label}
                          onChange={(event) =>
                            setFields((items) =>
                              items.map((item) =>
                                item.id === field.id
                                  ? field.type === "SIGN_DATE" ? { ...item, dateValue: event.target.value } : { ...item, label: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        /></>}
                        {selectedFieldId === field.id && <>
                        <button type="button" aria-label="Modifier le champ" onClick={() => setFieldDraft({ ...field })}>✎</button>
                        <button type="button" aria-label="Redimensionner le champ" onClick={() => setFieldDraft({ ...field })}>⤢</button>
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
                        </>}
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
            {error && <p className="upload-error" role="alert">{error}</p>}
            <div className="fields-heading">
              <b>Champs</b>
              <span>
                {documents.length} fichier{documents.length > 1 ? "s" : ""}
              </span>
            </div>
            <button type="button" className="preview-recipient-button" disabled={!recipients.some((recipient) => recipient.role === "SIGNER")} onClick={() => setPreviewRecipientId(selectedRecipientId || (recipients.find((recipient) => recipient.role === "SIGNER")?.id ?? null))}>Aperçu pour ce signataire</button>
            <label className="field-recipient-select">
              Champ destiné à
              <select
                value={selectedRecipientId}
                onChange={(event) => setSelectedRecipientId(event.target.value)}
              >
                {recipients
                  .filter((recipient) => recipient.role === "SIGNER")
                  .map((recipient) => (
                    <option key={recipient.id} value={recipient.id}>
                      {recipient.name ||
                        recipient.email ||
                        "Signataire " + (recipients.indexOf(recipient) + 1)}
                    </option>
                  ))}
              </select>
            </label>
            <div className="field-tool-grid">
              {FIELD_TOOLS.filter((tool) => ["READ_ONLY_TEXT", "INITIALS"].includes(tool.type)).map((tool) => (
                <button
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("application/signeo-field", tool.type)}
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
            <label className="custom-order-toggle"><input type="checkbox" checked={signingMode === "CUSTOM"} onChange={(event) => setSigningMode(event.target.checked ? "CUSTOM" : "SIMULTANEOUS")} />Ordre personnalisé des destinataires <span title="En mode personnalisé, chaque destinataire intervient dans l’ordre indiqué, quel que soit son rôle.">ⓘ</span></label>
            {(["APPROVER", "SIGNER"] as const).map((role) => <details className="preparation-recipients" key={role} open>
              <summary>{role === "SIGNER" ? "Signataires" : "Approbateurs"} <em>{recipients.filter((recipient) => recipient.role === role).length}</em></summary>
              {role === "SIGNER" && <div className="signing-mode"><button type="button" disabled={signingMode === "CUSTOM"} aria-pressed={signingMode === "SIMULTANEOUS"} onClick={() => setSigningMode("SIMULTANEOUS")}>Simultané {signingMode === "SIMULTANEOUS" && "✓"}</button><button type="button" disabled={signingMode === "CUSTOM"} aria-pressed={signingMode === "SEQUENTIAL"} onClick={() => setSigningMode("SEQUENTIAL")}>Séquentiel {signingMode === "SEQUENTIAL" && "✓"}</button></div>}
              {recipients.filter((recipient) => recipient.role === role).map((recipient) => {
                const index = recipients.indexOf(recipient);
                return <details key={recipient.id} className={`preparation-recipient recipient-color-${index % 2}`} open={recipient.id === selectedRecipientId || role === "APPROVER"}>
                  <summary><span className="recipient-avatar">{recipient.name.split(" ").map((part) => part[0]).join("").slice(0, 2) || index + 1}</span>{recipient.name || (role === "SIGNER" ? "Nouveau signataire" : "Nouvel approbateur")} <em>{fields.filter((field) => field.recipientId === recipient.id).length}</em></summary>
                  <div className="preparation-recipient-form">
                    <label className="form-field">Nom<input value={recipient.name} maxLength={120} onChange={(event) => updateRecipient(index, "name", event.target.value)} /></label>
                    <label className="form-field">E-mail<input type="email" value={recipient.email} onChange={(event) => updateRecipient(index, "email", event.target.value)} /></label>
                    <div className="recipient-inline-actions">{signingMode !== "SIMULTANEOUS" && <><span>Position {index + 1}</span><button type="button" disabled={index === 0} aria-label="Monter le destinataire" onClick={() => reorderRecipient(index, -1)}>↑</button><button type="button" disabled={index === recipients.length - 1} aria-label="Descendre le destinataire" onClick={() => reorderRecipient(index, 1)}>↓</button></>}<button type="button" onClick={() => removeRecipient(recipient.id)}>Supprimer</button></div>
                  </div>
                  {role === "SIGNER" && <div className="field-tool-grid">{FIELD_TOOLS.filter((tool) => !["READ_ONLY_TEXT", "INITIALS"].includes(tool.type)).map((tool) => <button key={tool.type} type="button" draggable onDragStart={(event) => { setSelectedRecipientId(recipient.id); event.dataTransfer.setData("application/signeo-field", tool.type); }} className={`field-option ${placingType === tool.type && selectedRecipientId === recipient.id ? "selected-field-tool" : ""}`} onClick={() => { setSelectedRecipientId(recipient.id); setPlacingType(tool.type); }}><span>⠿</span><span>{tool.icon}</span>{tool.label}</button>)}</div>}
                </details>;
              })}
              <button type="button" className="document-add" onClick={() => addRecipient(role)}>⊕ Ajouter un {role === "SIGNER" ? "signataire" : "approbateur"}</button>
            </details>)}
            <p className="workflow-hint">
              {
                fields.filter((field) => field.documentIndex === selected)
                  .length
              }{" "}
              champ(s). Choisis un outil puis clique à l’endroit voulu dans le
              document.
            </p>
            {fields.find((field) => field.id === selectedFieldId) && (() => {
              const selectedField = fields.find((field) => field.id === selectedFieldId)!;
              const isSignature = selectedField.type === "SIGNATURE" || selectedField.type === "INITIALS";
              return <div className="field-style-editor"><b>Style de « {selectedField.label} »</b>
                <label className="form-field">Police
                  <select value={selectedField.fontFamily} onChange={(event) => setFields((items) => items.map((field) => field.id === selectedField.id ? { ...field, fontFamily: event.target.value as PlacedField["fontFamily"] } : field))}>
                    {(isSignature ? ["SCRIPT", "SERIF", "SANS"] : ["SANS", "SERIF", "MONO"]).map((font) => <option key={font} value={font}>{font === "SCRIPT" ? "Italique" : font === "SERIF" ? "Sérif / classique" : font === "MONO" ? "Machine à écrire" : "Sans sérif / moderne"}</option>)}
                  </select>
                </label>
                <div className="style-control-row"><label className="form-field">Couleur<input type="color" value={selectedField.fontColor} onChange={(event) => setFields((items) => items.map((field) => field.id === selectedField.id ? { ...field, fontColor: event.target.value } : field))} /></label><label className="form-field">Taille ({selectedField.fontSize}px)<input type="range" min={isSignature ? 14 : 8} max={isSignature ? 30 : 18} value={selectedField.fontSize} onChange={(event) => setFields((items) => items.map((field) => field.id === selectedField.id ? { ...field, fontSize: Number(event.target.value) } : field))} /></label></div>
              </div>;
            })()}
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
            <label className="form-field">
              Date d’expiration (maximum un an)
              <input
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                max={(() => {
                  const value = new Date();
                  value.setFullYear(value.getFullYear() + 1);
                  return value.toISOString().slice(0, 10);
                })()}
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                required
              />
            </label>
            <label className="consent-check">
              <input
                type="checkbox"
                checked={allowDecline}
                onChange={(event) => setAllowDecline(event.target.checked)}
              />
              <span>Autoriser les destinataires à refuser la signature.</span>
            </label>
            <div className="settings-section-title">
              <div>
                <b>Documents à collecter</b>
                <small>
                  Pièces que les signataires doivent joindre avant de signer.
                </small>
              </div>
              <button
                type="button"
                disabled={collectionRequests.length >= 10}
                onClick={() =>
                  setCollectionRequests((current) => [
                    ...current,
                    {
                      id: crypto.randomUUID(),
                      label: "",
                      recipientId:
                        recipients.find(
                          (recipient) => recipient.role === "SIGNER",
                        )?.id ?? "",
                      required: true,
                    },
                  ])
                }
              >
                + Demander un document
              </button>
            </div>
            {collectionRequests.map((request) => (
              <div className="collection-request-row" key={request.id}>
                <label className="form-field">
                  Type de document
                  <input
                    required
                    value={request.label}
                    placeholder="Ex. Justificatif de domicile"
                    onChange={(event) =>
                      setCollectionRequests((items) =>
                        items.map((item) =>
                          item.id === request.id
                            ? { ...item, label: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
                <label className="form-field">
                  À fournir par
                  <select
                    value={request.recipientId}
                    onChange={(event) =>
                      setCollectionRequests((items) =>
                        items.map((item) =>
                          item.id === request.id
                            ? { ...item, recipientId: event.target.value }
                            : item,
                        ),
                      )
                    }
                  >
                    {recipients
                      .filter((recipient) => recipient.role === "SIGNER")
                      .map((recipient) => (
                        <option key={recipient.id} value={recipient.id}>
                          {recipient.name ||
                            recipient.email ||
                            "Signataire " + (recipients.indexOf(recipient) + 1)}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="consent-check">
                  <input
                    type="checkbox"
                    checked={request.required}
                    onChange={(event) =>
                      setCollectionRequests((items) =>
                        items.map((item) =>
                          item.id === request.id
                            ? { ...item, required: event.target.checked }
                            : item,
                        ),
                      )
                    }
                  />
                  <span>Obligatoire</span>
                </label>
                <button
                  type="button"
                  className="remove-recipient"
                  aria-label="Retirer le document demandé"
                  onClick={() =>
                    setCollectionRequests((items) =>
                      items.filter((item) => item.id !== request.id),
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <div className="settings-section-title">
              <div>
                <b>Destinataires</b>
                <small>Au moins un signataire est nécessaire.</small>
              </div>
              <button
                type="button"
                disabled={
                  recipients.filter((recipient) => recipient.role === "SIGNER")
                    .length >= 100
                }
                onClick={() =>
                  setRecipients((current) => [
                    ...current,
                    {
                      id: crypto.randomUUID(),
                      name: "",
                      email: "",
                      role: "SIGNER",
                      signatureLevel: "SIMPLE",
                      authenticationMethod: "NONE",
                    },
                  ])
                }
              >
                + Ajouter
              </button>
            </div>
            {recipients.map((recipient, index) => (
              <div className="recipient-form-row" key={index}>
                <span className="recipient-number">{index + 1}</span>
                <div className="recipient-order-actions">
                  <button
                    type="button"
                    aria-label="Monter le destinataire"
                    disabled={index === 0}
                    onClick={() =>
                      setRecipients((current) => {
                        const next = [...current];
                        [next[index - 1], next[index]] = [
                          next[index],
                          next[index - 1],
                        ];
                        return next;
                      })
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Descendre le destinataire"
                    disabled={index === recipients.length - 1}
                    onClick={() =>
                      setRecipients((current) => {
                        const next = [...current];
                        [next[index], next[index + 1]] = [
                          next[index + 1],
                          next[index],
                        ];
                        return next;
                      })
                    }
                  >
                    ↓
                  </button>
                </div>
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
                {recipient.role === "SIGNER" && <>
                  <label className="form-field">Niveau de signature
                    <select value={recipient.signatureLevel} onChange={(event) => updateRecipient(index, "signatureLevel", event.target.value)}>
                      <option value="SIMPLE">Simple (disponible)</option>
                      <option value="ADVANCED" disabled>Avancée (prestataire requis)</option>
                      <option value="QUALIFIED" disabled>Qualifiée (QTSP requis)</option>
                    </select>
                  </label>
                  <label className="form-field">Vérification du signataire
                    <select value={recipient.authenticationMethod} onChange={(event) => updateRecipient(index, "authenticationMethod", event.target.value)}>
                      <option value="NONE">Aucune vérification supplémentaire</option>
                      <option value="EMAIL_OTP">Code e-mail de vérification</option>
                      <option value="SMS_OTP" disabled>Code SMS (service requis)</option>
                    </select>
                  </label>
                </>}
                {recipients.length > 1 && (
                  <button
                    className="remove-recipient"
                    type="button"
                    aria-label="Supprimer le destinataire"
                    onClick={() => removeRecipient(recipient.id)}
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
      {fieldDraft && <PreparationModal title={fieldDraft.type === "SIGNATURE" ? "Signature" : "Modifier le champ"} close={() => setFieldDraft(null)}>
        <form onSubmit={(event) => { event.preventDefault(); setFields((items) => items.map((item) => item.id === fieldDraft.id ? fieldDraft : item)); setFieldDraft(null); }}>
          {fieldDraft.type === "SIGNATURE" && <><b>Aperçu de la signature</b><div className="signature-preview"><div className="signature-stamp"><strong style={{ color: fieldDraft.fontColor }}>{recipients.find((item) => item.id === fieldDraft.recipientId)?.name || "Nom du signataire"}</strong>{fieldDraft.signatureDisplay === "DETAILED" && <small>JJ/MM/AAAA · {recipients.find((item) => item.id === fieldDraft.recipientId)?.email}</small>}<small>Signature électronique · Signeo</small></div></div><div className="signature-display-options">{(["MINIMAL", "DETAILED"] as const).map((display) => <label key={display}><input type="radio" name="signature-display" checked={fieldDraft.signatureDisplay === display} onChange={() => setFieldDraft({ ...fieldDraft, signatureDisplay: display })} />Affichage {display === "MINIMAL" ? "minimal" : "détaillé"}</label>)}</div></>}
          <label className="form-field">Attribuer à<select value={fieldDraft.recipientId} onChange={(event) => setFieldDraft({ ...fieldDraft, recipientId: event.target.value })}>{recipients.filter((item) => item.role === "SIGNER" && !documents[fieldDraft.documentIndex].hiddenRecipientIds?.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{item.name || item.email || "Signataire"}</option>)}</select></label>
          {fieldDraft.type === "SIGN_DATE" ? <label className="form-field">Date<input type="date" value={fieldDraft.dateValue ?? ""} onChange={(event) => setFieldDraft({ ...fieldDraft, dateValue: event.target.value })} /></label>
            : fieldDraft.type === "SIGNER_NAME" || fieldDraft.type === "SIGNER_EMAIL" ? <label className="form-field">{fieldDraft.label}<input readOnly value={recipients.find((item) => item.id === fieldDraft.recipientId)?.[fieldDraft.type === "SIGNER_NAME" ? "name" : "email"] ?? ""} /></label>
              : fieldDraft.type !== "SIGNATURE" && <label className="form-field">{fieldDraft.type === "READ_ONLY_TEXT" ? "Texte à afficher" : "Libellé"}<input required maxLength={160} value={fieldDraft.label} onChange={(event) => setFieldDraft({ ...fieldDraft, label: event.target.value })} /></label>}
          {fieldDraft.type === "RADIO" && <label className="form-field">Choix (2 à 6, un par ligne)<textarea required value={fieldDraft.options?.join("\n")} onChange={(event) => setFieldDraft({ ...fieldDraft, options: event.target.value.split("\n") })} /></label>}
          <div className="signature-display-options"><label className="form-field">Largeur : {Math.round(fieldDraft.width)}%<input type="range" min={5} max={Math.min(70, 100 - fieldDraft.x)} value={fieldDraft.width} onChange={(event) => setFieldDraft({ ...fieldDraft, width: Number(event.target.value) })} /></label><label className="form-field">Hauteur : {Math.round(fieldDraft.height)}%<input type="range" min={2} max={Math.min(30, 100 - fieldDraft.y)} value={fieldDraft.height} onChange={(event) => setFieldDraft({ ...fieldDraft, height: Number(event.target.value) })} /></label></div>
          <footer><button type="button" onClick={() => setFieldDraft(null)}>Annuler</button><button className="envelope-next" type="submit" disabled={fieldDraft.type === "RADIO" && (!fieldDraft.options || fieldDraft.options.length < 2 || fieldDraft.options.length > 6 || fieldDraft.options.some((option) => !option.trim() || option.length > 80))}>Sauvegarder</button></footer>
        </form>
      </PreparationModal>}
      {visibilityDraft && <PreparationModal title="Gérer la visibilité des documents" close={() => setVisibilityDraft(null)}>
        <p className="visibility-notice">Choisissez les documents que chaque destinataire peut consulter. Un document contenant ses champs reste visible pour lui.</p>
        <div className="visibility-table-scroll"><table className="visibility-table"><thead><tr><th>Destinataire</th>{documents.map((document, index) => <th key={index}><span>▤ Doc. {index + 1}/{documents.length}</span>{document.file.name}</th>)}</tr></thead><tbody>{recipients.map((recipient) => <tr key={recipient.id}><th>{recipient.name || recipient.email || "Nouveau destinataire"}<small>{recipient.role === "SIGNER" ? "Signataire" : "Approbateur"}</small></th>{documents.map((_, index) => <td key={index}><label><input type="checkbox" checked={!visibilityDraft[index].includes(recipient.id)} disabled={fields.some((field) => field.documentIndex === index && field.recipientId === recipient.id)} onChange={(event) => setVisibilityDraft(visibilityDraft.map((ids, i) => i === index ? event.target.checked ? ids.filter((id) => id !== recipient.id) : [...ids, recipient.id] : ids))} />Peut consulter</label></td>)}</tr>)}</tbody></table></div>
        <footer><button type="button" onClick={() => setVisibilityDraft(null)}>Annuler</button><button type="button" className="envelope-next" onClick={() => { setDocuments((items) => items.map((document, index) => ({ ...document, hiddenRecipientIds: visibilityDraft[index] }))); setVisibilityDraft(null); }}>Enregistrer</button></footer>
      </PreparationModal>}
      {collecting && <PreparationModal title="Documents à collecter" close={() => setCollecting(false)}>
        <p>Demandez une pièce à joindre avant la signature.</p>
        {collectionRequests.map((request) => <div className="collection-draft" key={request.id}>
          <label className="form-field">Document demandé<input maxLength={160} placeholder="Ex. Justificatif de domicile" value={request.label} onChange={(event) => setCollectionRequests((items) => items.map((item) => item.id === request.id ? { ...item, label: event.target.value } : item))} /></label>
          <label className="form-field">À fournir par<select value={request.recipientId} onChange={(event) => setCollectionRequests((items) => items.map((item) => item.id === request.id ? { ...item, recipientId: event.target.value } : item))}>{recipients.filter((item) => item.role === "SIGNER").map((item) => <option key={item.id} value={item.id}>{item.name || item.email || "Signataire"}</option>)}</select></label>
          <label><input type="checkbox" checked={request.required} onChange={(event) => setCollectionRequests((items) => items.map((item) => item.id === request.id ? { ...item, required: event.target.checked } : item))} /> Obligatoire</label><button type="button" onClick={() => setCollectionRequests((items) => items.filter((item) => item.id !== request.id))}>Supprimer</button>
        </div>)}
        <footer><button type="button" disabled={collectionRequests.length >= 10 || !recipients.some((item) => item.role === "SIGNER")} onClick={() => setCollectionRequests((items) => [...items, { id: crypto.randomUUID(), label: "", recipientId: recipients.find((item) => item.role === "SIGNER")!.id, required: true }])}>+ Demander un document</button><button type="button" className="envelope-next" onClick={() => setCollecting(false)}>Terminer</button></footer>
      </PreparationModal>}
      {previewRecipientId && (() => {
        const recipient = recipients.find((item) => item.id === previewRecipientId);
        if (!recipient) return null;
        const visible = documents.map((document, index) => ({ document, index })).filter(({ document }) => !document.hiddenRecipientIds?.includes(recipient.id));
        const recipientFields = fields.filter((field) => field.recipientId === recipient.id);
        return <PreparationModal title={`Aperçu de ${recipient.name || recipient.email || "ce signataire"}`} close={() => setPreviewRecipientId(null)}>
          <p className="visibility-notice">Voici les documents et champs qui seront visibles par ce signataire.</p>
          <div className="recipient-preview-summary"><b>{visible.length} document{visible.length > 1 ? "s" : ""}</b><b>{recipientFields.length} champ{recipientFields.length > 1 ? "s" : ""} à compléter</b></div>
          {visible.map(({ document, index }) => <article className="recipient-preview-document" key={document.file.name + index}><b>▤ {document.file.name}</b><ul>{recipientFields.filter((field) => field.documentIndex === index).map((field) => <li key={field.id}>{FIELD_TOOLS.find((tool) => tool.type === field.type)?.label}</li>)}</ul>{!recipientFields.some((field) => field.documentIndex === index) && <small>Aucun champ à compléter sur ce document.</small>}</article>)}
          <footer><button type="button" className="envelope-next" onClick={() => setPreviewRecipientId(null)}>Fermer l’aperçu</button></footer>
        </PreparationModal>;
      })()}
    </main>
  );
}
