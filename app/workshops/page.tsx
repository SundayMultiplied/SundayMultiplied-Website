import Link from "next/link";

const workshops = [
  {
    number: "01",
    title: "Facilitate for Formation",
    audience: "Small-group leaders · 90 minutes",
    promise: "Turn discussion leaders into guides who help people notice, name, and practice truth.",
    skills: ["Ask questions people can answer honestly", "Move from insight to application", "Handle silence and dominant voices", "Build participation without forcing vulnerability"],
  },
  {
    number: "02",
    title: "Map the 167 Hours",
    audience: "Pastors + ministry teams · Working session",
    promise: "See where your sermon already travels—and where one thoughtful touchpoint could make the biggest difference.",
    skills: ["Map existing ministry environments", "Identify the Thursday tension", "Choose sustainable weekly rhythms", "Clarify ownership and delivery"],
  },
  {
    number: "03",
    title: "From Sermon to Practice",
    audience: "Ministry leaders · Applied lab",
    promise: "Learn to translate a sermon’s truth into meaningful conversation, decisions, and real-life practice.",
    skills: ["Distill without oversimplifying", "Design for different audiences", "Create sermon-rooted practice", "Build a repeatable workflow"],
  },
];

export default function WorkshopsPage() {
  return (
    <main>
      <section className="page-hero workshop-hero">
        <p className="eyebrow light">Workshops · Leader development</p>
        <h1>Better questions.<br /><em>Braver conversations.</em></h1>
        <p>Practical, participatory workshops that help leaders move beyond covering content and create the conditions for honest reflection, shared practice, and growth.</p>
      </section>

      <section className="page-section workshop-list-section">
        <div className="page-section-lead">
          <p className="eyebrow">Choose the capability</p>
          <h2>Give leaders something they can use at the very next gathering.</h2>
        </div>
        <div className="workshop-list">
          {workshops.map((workshop, index) => (
            <details key={workshop.title} open={index === 0}>
              <summary>
                <span className="workshop-number">{workshop.number}</span>
                <span><small>{workshop.audience}</small><strong>{workshop.title}</strong></span>
                <span className="plus" aria-hidden="true">+</span>
              </summary>
              <div className="workshop-detail">
                <p className="workshop-promise">{workshop.promise}</p>
                <div>{workshop.skills.map(skill => <span key={skill}>✓ {skill}</span>)}</div>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="workshop-method page-section">
        <div>
          <p className="eyebrow light">Not a lecture about leading</p>
          <h2>Leaders learn by leading.</h2>
          <p>Each workshop models the same kind of experience we want leaders to create: brief teaching, realistic practice, useful feedback, and a clear next move.</p>
        </div>
        <div className="method-wheel" aria-label="Workshop learning cycle">
          <span>Learn</span><span>Try</span><span>Reflect</span><span>Plan</span>
          <strong>Practice<br />together</strong>
        </div>
      </section>

      <section className="inline-cta page-section">
        <p className="eyebrow">Virtual or in person · Scoped to your team</p>
        <h2>Build the workshop your leaders need now.</h2>
        <div><Link className="button" href="/contact?interest=workshop">Talk through a workshop ↗</Link><Link className="text-link" href="/pricing">See how workshop pricing works ↗</Link></div>
      </section>
    </main>
  );
}
