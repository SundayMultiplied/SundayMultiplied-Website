import { ReviewLink as Link } from "../../components/review-link";
import { ResourceExplorer } from "../../components/resource-explorer";

export default function ServicesPage() {
  return (
    <main>
      <section className="page-hero">
        <p className="eyebrow light">Services · Weekly resources</p>
        <h1>Built from the sermon.<br /><em>Designed for the week.</em></h1>
        <p>Every resource begins with what your pastor actually preached—then translates that message into the environments where formation continues.</p>
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
          <p>Your team shares the sermon transcript, notes, or recording. We return church-branded, staff-ready resources in the formats you need.</p>
        </div>
        <div className="delivery-steps">
          {[
            ["01", "Listen", "We study the sermon’s central truth, pastoral emphasis, illustrations, and application."],
            ["02", "Design", "We shape each touchpoint for its audience and moment—without flattening the message."],
            ["03", "Deliver", "Your staff receives branded PDF and HTML resources, ready to distribute as you choose."],
            ["04", "Refine", "One revision round and an organized archive keep the rhythm dependable week after week."],
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
