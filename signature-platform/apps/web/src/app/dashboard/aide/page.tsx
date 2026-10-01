import type { Metadata } from "next";
import Link from "next/link";
import { DashboardLayout } from "@/app/ui/dashboard/dashboard-layout";
import styles from "./help.module.css";

export const metadata: Metadata = {
  title: "Aide | Signeo",
  description: "Guides et réponses aux questions fréquentes sur les enveloppes, les signatures et votre espace Signeo.",
};

const topics = [
  {
    icon: "✎",
    title: "Créer et envoyer",
    text: "Préparez une enveloppe, ajoutez vos destinataires et placez les champs à compléter.",
    href: "/dashboard/enveloppes/nouvelle",
    link: "Créer une enveloppe",
  },
  {
    icon: "▤",
    title: "Suivre les signatures",
    text: "Retrouvez vos dossiers, leur état et les personnes concernées.",
    href: "/dashboard/enveloppes",
    link: "Voir mes enveloppes",
  },
  {
    icon: "⌘",
    title: "Connecter vos outils",
    text: "Consultez la documentation publique et gérez séparément vos clés API.",
    href: "/developers",
    link: "Lire le guide API",
  },
  {
    icon: "⚙",
    title: "Personnaliser l’expérience",
    text: "Adaptez l’identité affichée sur les prochaines pages de signature.",
    href: "/dashboard/parametres",
    link: "Ouvrir les paramètres",
  },
];

const questions = [
  {
    question: "Comment préparer et envoyer une enveloppe ?",
    answer: (
      <>
        Ouvrez <Link href="/dashboard/enveloppes/nouvelle">Créer une enveloppe</Link>, ajoutez vos documents, puis indiquez le titre et les destinataires. Vous pouvez organiser les étapes de signature et placer les champs nécessaires sur les pages avant de vérifier puis d’envoyer le dossier.
      </>
    ),
  },
  {
    question: "Comment savoir si mon enveloppe a été signée ?",
    answer: (
      <>
        Consultez <Link href="/dashboard/enveloppes">Signatures</Link> pour retrouver vos enveloppes et leur statut. Ouvrez un dossier pour consulter ses détails et ses destinataires. La page <Link href="/dashboard/activite">Activité</Link> rassemble également les événements récents de votre espace.
      </>
    ),
  },
  {
    question: "Un destinataire n’a pas reçu son invitation. Que faire ?",
    answer: (
      <>
        Après l’envoi, vérifiez l’état de livraison indiqué pour chaque invitation. Si l’e-mail n’a pas pu être envoyé, le lien privé du destinataire reste disponible sur l’écran de confirmation : vous pouvez le copier et le lui transmettre directement. Chaque destinataire dispose de son propre lien.
      </>
    ),
  },
  {
    question: "Mon brouillon est-il enregistré automatiquement ?",
    answer: (
      <>
        Oui. La préparation est sauvegardée automatiquement dans le navigateur utilisé. Vous pouvez la retrouver en revenant à la création depuis ce même navigateur. Ce brouillon local n’est pas synchronisé entre appareils ; une fois l’enveloppe envoyée, retrouvez-la dans <Link href="/dashboard/enveloppes">Signatures</Link>.
      </>
    ),
  },
  {
    question: "Puis-je modifier la marque affichée aux signataires ?",
    answer: (
      <>
        Oui. Dans <Link href="/dashboard/parametres">Paramètres</Link>, vous pouvez modifier le nom, la couleur, le logo et certains styles. Les changements s’appliquent aux prochaines enveloppes ; celles déjà créées conservent leur identité enregistrée.
      </>
    ),
  },
  {
    question: "Comment connecter mon application à Signeo ?",
    answer: (
      <>
        Le guide <Link href="/developers">Documentation API</Link> est consultable sans compte. Il décrit l’authentification et l’endpoint de lecture des enveloppes. Pour créer ou révoquer une clé, ouvrez l’espace privé <Link href="/dashboard/developpeurs">Développeurs</Link>. Gardez votre clé secrète côté serveur et ne l’insérez pas dans du code public.
      </>
    ),
  },
  {
    question: "Je rencontre une erreur ou une page ne se charge pas.",
    answer: (
      <>
        Vérifiez votre connexion, rechargez la page et réessayez. Si le problème concerne une action, notez le message affiché et la page concernée. Pour un appel API, le journal des appels est disponible dans <Link href="/dashboard/developpeurs">Développeurs</Link> ; un appel journalisé n’indique pas forcément qu’il a réussi.
      </>
    ),
  },
];

export default function HelpPage() {
  return (
    <DashboardLayout
      title="Aide"
      description="Des repères simples pour préparer vos enveloppes et profiter de votre espace."
      eyebrow="CENTRE D’AIDE"
    >
      <div className={styles.page}>
        <section className={styles.intro} aria-labelledby="help-intro-title">
          <div>
            <p className={styles.kicker}>BESOIN D’UN REPÈRE ?</p>
            <h2 id="help-intro-title">On vous aide à avancer.</h2>
            <p>Retrouvez les accès utiles et les réponses aux questions les plus fréquentes.</p>
          </div>
          <span className={styles.introMark} aria-hidden="true">?</span>
        </section>

        <section className={styles.topicSection} aria-labelledby="help-topics-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.kicker}>ACCÈS RAPIDES</p>
              <h2 id="help-topics-title">Que souhaitez-vous faire ?</h2>
            </div>
          </div>
          <div className={styles.topicGrid}>
            {topics.map((topic) => (
              <article className={styles.topicCard} key={topic.title}>
                <span className={styles.topicIcon} aria-hidden="true">{topic.icon}</span>
                <h3>{topic.title}</h3>
                <p>{topic.text}</p>
                <Link href={topic.href}>{topic.link}<span aria-hidden="true"> →</span></Link>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.faqSection} aria-labelledby="help-faq-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.kicker}>QUESTIONS FRÉQUENTES</p>
              <h2 id="help-faq-title">Les réponses, tout simplement.</h2>
            </div>
            <p>Choisissez une question pour afficher sa réponse.</p>
          </div>
          <div className={styles.questions}>
            {questions.map(({ question, answer }) => (
              <details className={styles.question} key={question}>
                <summary>{question}<span aria-hidden="true">+</span></summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className={styles.bottomCard} aria-labelledby="help-bottom-title">
          <span aria-hidden="true">✳</span>
          <div>
            <h2 id="help-bottom-title">Prêt à continuer ?</h2>
            <p>Votre prochaine étape est à portée de clic.</p>
          </div>
          <Link href="/dashboard/enveloppes/nouvelle">Créer une enveloppe <span aria-hidden="true">↗</span></Link>
        </section>
      </div>
    </DashboardLayout>
  );
}
