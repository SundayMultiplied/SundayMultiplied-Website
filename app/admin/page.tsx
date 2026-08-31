import Link from "next/link";

const tools = [
  {
    href: "/approvals",
    eyebrow: "Weekly production",
    title: "Resource Production",
    copy: "Upload a sermon transcript, generate Monday, Group, and Family resources, preview them, and send packages into pastoral review.",
    action: "Open production →",
  },
  {
    href: "/revisions",
    eyebrow: "Pastoral feedback",
    title: "Revision Workspace",
    copy: "Review requested changes, regenerate targeted sections, accept revised resources, and send them back for final approval.",
    action: "Open revisions →",
  },
  {
    href: "/approvals#approval-packages",
    eyebrow: "Review operations",
    title: "Approval Packages",
    copy: "See package status and notification history for resources already sent to church reviewers.",
    action: "View approval packages →",
  },
  {
    href: "/onboarding",
    eyebrow: "Church setup",
    title: "Church Onboarding",
    copy: "Launch the onboarding agent to research a church, capture branding and sources, upload logos, and create its production configuration.",
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

      <section className="admin-workflow-strip">
        <span>Onboard church</span><b>→</b><span>Produce resources</span><b>→</b><span>Pastoral review</span><b>→</b><span>Revise if needed</span><b>→</b><span>Approve + archive</span>
      </section>
    </main>
  );
}
