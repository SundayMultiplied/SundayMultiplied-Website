import Link from "next/link";
import { SystemHealth } from "../../components/system-health";

const tools = [
  {
    href: "/production",
    eyebrow: "Weekly production",
    title: "Resource Production",
    copy: "Upload a sermon transcript, generate the canonical analysis and configured resources, preview them, and release them into pastoral review.",
    action: "Open production →",
  },
  {
    href: "/approvals",
    eyebrow: "Pastoral review",
    title: "Approval Packages",
    copy: "Track review packages, decisions, notification history, approvals, and revision requests without the production queue competing for space.",
    action: "Open approvals →",
  },
  {
    href: "/revisions",
    eyebrow: "Requested changes",
    title: "Revision Workspace",
    copy: "Review pastoral feedback, regenerate targeted sections, accept revised resources, and send them back for final approval.",
    action: "Open revisions →",
  },
  {
    href: "/onboarding",
    eyebrow: "Church setup",
    title: "Church Onboarding",
    copy: "Research a church, capture branding and sources, upload logos, and create the configuration that powers weekly production.",
    action: "Open onboarding →",
  },
];

export default function AdminHome() {
  return (
    <main className="admin-home">
      <section className="admin-home-hero">
        <div>
          <p className="admin-home-kicker">Operations</p>
          <h1>Sunday Multiplied Admin</h1>
          <p>One place to move a sermon from transcript to approved, archived discipleship resources.</p>
        </div>
        <Link className="admin-public-link" href="https://www.sundaymultiplied.com">View public site ↗</Link>
      </section>

      <SystemHealth />

      <section className="admin-tool-grid" aria-label="Admin tools">
        {tools.map((tool) => (
          <Link href={tool.href} className="admin-tool-card" key={tool.title}>
            <span>{tool.eyebrow}</span>
            <h2>{tool.title}</h2>
            <p>{tool.copy}</p>
            <strong>{tool.action}</strong>
          </Link>
        ))}
      </section>

      <section className="admin-workflow-strip" aria-label="Theme management shortcut">
        <span>Already onboarded?</span><b>→</b><Link href="/theme-editor"><strong>Edit a church resource theme →</strong></Link>
      </section>

      <section className="admin-workflow-strip">
        <span>Onboard church</span><b>→</b><span>Produce resources</span><b>→</b><span>Pastoral review</span><b>→</b><span>Revise if needed</span><b>→</b><span>Approve + archive</span>
      </section>
    </main>
  );
}
