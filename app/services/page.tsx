import { ReviewLink as Link } from "../../components/review-link";
import { ResourceExplorer } from "../../components/resource-explorer";

export default function ServicesPage() {
  return (
    <main>
      <section className="page-hero">
        <p className="eyebrow light">Services · Weekly resources</p>
        <h1>Built from the sermon.<br /><em>Designed for the week.</em></h1>
        <p>Every resource begins with what your pastor actually preached—not generic curriculum or simply what was planned—then carries that message into the environments where formation continues.</p>
      </section>

      <section className="page-section resource-explorer-section">
        <div className="page-section-lead">
          <p className="eyebrow">Start where you are. Grow over time.</p>
          <h2>Begin with one environment—or connect several touchpoints into a thoughtful weekly rhythm.</h2>
        </div>
        <ResourceExplorer />
      </section>

      <section className="delivery-section page-section">
        <div className="page-section-lead compact">
          <p className="eyebrow light">Quietly handled each week</p>
          <h2>Designed to fit the pace of ministry.</h2>
          <p>Your team shares the sermon transcript, notes, or recording. We handle the weekly production workflow and return church-branded resources for your team to review, approve, and use.</p>
        </div>
        <div className="delivery-steps">
          {[
            ["01", "Listen", "We study the delivered sermon’s central truth, pastoral emphasis, illustrations, and application."],
            ["02", "Design", "We shape each touchpoint for its audience and moment—without flattening the message."],
            ["03", "Review", "Your team reviews the resources and requests any needed adjustments. Pastoral leadership keeps the final word."],
            ["04", "Deliver", "Approved, church-branded resources are prepared for the channels your ministry already uses."],
          ].map(([number, title, copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}
        </div>
      </section>

      <section className="inline-cta page-section">
        <p className="eyebrow">Start with one environment—or connect them all.</p>
        <h2>Let Sunday keep speaking.</h2>
        <div><Link className="button" href="/pricing">View pricing ↗</Link><Link className="text-link" href="/examples">See example experiences ↗</Link></div>
      </section>
    </main>
  );
}
