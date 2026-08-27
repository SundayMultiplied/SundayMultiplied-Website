import { ReviewLink as Link } from "../../components/review-link";
import { ExampleGallery } from "../../components/example-gallery";

const comparisons = [
  { label: "Audience", monday: "One person", family: "Parents + children", group: "Adults together", midweek: "Whole church" },
  { label: "Experience", monday: "Recall + reflect", family: "Talk + practice", group: "Discuss + rehearse", midweek: "Notice + respond" },
  { label: "Time", monday: "5 min", family: "10–15 min", group: "45–60 min", midweek: "1 min" },
  { label: "Movement", monday: "Hearing → remembering", family: "Remembering → conversation", group: "Conversation → practice", midweek: "Practice → perseverance" },
];

export default function ExamplesPage() {
  return (
    <main>
      <section className="page-hero examples-hero">
        <p className="eyebrow light">Demonstration collection · Sample Church</p>
        <h1>See what one sermon<br /><em>can become.</em></h1>
        <p>One message about Genesis 1:1–2 becomes four distinct touchpoints—each faithful to the pastor’s emphasis and designed for the people, time, and conversation where it will be used.</p>
      </section>
      <section className="sample-brief page-section">
        <div className="sample-brief-heading"><p className="eyebrow">The source sermon</p><h2>“In the Beginning”</h2><p>This collection is a transparent demonstration created for Sample Church. It shows the actual resource design—not a fictional client story or invented result.</p></div>
        <div className="sermon-brief-card">
          <div><span>Scripture</span><strong>Genesis 1:1–2</strong></div>
          <div><span>Big idea</span><strong>The eternal Creator has rightful authority—and remains attentively near.</strong></div>
          <div><span>The tension</span><strong>We let culture, preference, or fear define us, then wonder whether God is distant when life feels unfinished.</strong></div>
          <div><span>Desired response</span><strong>Trust the Creator’s authority, rest in his nearness, and respond with conviction and care.</strong></div>
        </div>
      </section>
      <section className="page-section examples-section">
        <div className="page-section-lead"><p className="eyebrow">The weekly journey</p><h2>Same sermon truth.<br />A different experience each time.</h2></div>
        <ExampleGallery />
      </section>
      <section className="comparison-section page-section">
        <div className="page-section-lead compact"><p className="eyebrow light">Designed—not duplicated</p><h2>What changes across the week.</h2></div>
        <div className="comparison-table-wrap">
          <table className="comparison-table">
            <caption className="sr-only">Resource design comparison</caption>
            <thead><tr><th scope="col" /><th scope="col">Monday</th><th scope="col">Family</th><th scope="col">Group</th><th scope="col">Midweek</th></tr></thead>
            <tbody>{comparisons.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.monday}</td><td>{row.family}</td><td>{row.group}</td><td>{row.midweek}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
      <section className="design-commentary page-section">
        <div><p className="eyebrow">What stays constant</p><h2>The message remains the source.</h2></div>
        <div className="commentary-grid">
          <article><span>01</span><h3>Pastoral emphasis</h3><p>Every resource preserves the sermon’s movement from the Creator’s authority to his attentive nearness and gospel light.</p></article>
          <article><span>02</span><h3>Biblical throughline</h3><p>Genesis 1:1–2 remains central while the language and activity change to fit the environment.</p></article>
          <article><span>03</span><h3>Faithful response</h3><p>Each touchpoint helps people receive identity from God, trust him in unfinished places, and respond with truth and care.</p></article>
        </div>
        <blockquote>Good reinforcement does not repeat the same resource four times. It helps the same truth do <em>different formation work</em> across the week.</blockquote>
      </section>
      <section className="inline-cta page-section">
        <p className="eyebrow">What could your sermon become?</p><h2>Start with your message, your people, and your ministry rhythm.</h2>
        <div><Link className="button" href="/contact?interest=samples">Explore what your week could become ↗</Link><Link className="text-link" href="/services">See the resources ↗</Link></div>
      </section>
    </main>
  );
}
