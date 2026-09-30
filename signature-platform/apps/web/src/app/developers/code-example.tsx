"use client";

import { useState } from "react";
import styles from "./developers.module.css";

export function CodeExample({ title, code }: { title: string; code: string }) {
  const [notice, setNotice] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(code); setNotice("Copié ✓"); }
    catch { setNotice("Sélectionnez le texte pour le copier."); }
  }
  return <div className={styles.code}><div><span>{title}</span><button onClick={copy} type="button">Copier</button></div><pre><code>{code}</code></pre>{notice && <p role="status">{notice}</p>}</div>;
}
