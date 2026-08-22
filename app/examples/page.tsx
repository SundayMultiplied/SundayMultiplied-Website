import Link from "next/link";
import { ExampleGallery } from "../../components/example-gallery";

export default function ExamplesPage() {
  return (
    <main>
      <section className="page-hero examples-hero">
        <p className="eyebrow light">Examples · See the experience</p>
        <h1>Familiar enough to use.<br /><em>Fresh enough to matter.</em></h1>
        <p>Every touchpoint carries the same sermon into a different environment—while respecting the people, time, and conversation that belong there.</p>
      </section>

      <section className="page-section examples-section">
        <div className="page-section-lead">
          <p className="eyebrow">Inside the weekly rhythm</p>
          <h2>Explore what each resource is designed to do.</h2>
        </div>
        <ExampleGallery />
      </section>

      <section className="principles-section page-section">
        <div className="page-section-lead compact">
          <p className="eyebrow light">What stays consistent</p>
          <h2>Not templates. Design principles.</h2>
        </div>
        <div className="principle-grid">
          <article><span>01</span><h3>Pastor-rooted</h3><p>The resource follows the message your church heard, not a generic study on the passage.</p></article>
          <article><span>02</span><h3>Audience-aware</h3><p>A family conversation should not sound like a leader guide. Each environment gets its own design.</p></article>
          <article><span>03</span><h3>Practice-forward</h3><p>The goal is not simply remembering more information. It is helping people respond faithfully.</p></article>
        </div>
      </section>

      <section className="inline-cta page-section">
        <p className="eyebrow">Your church will not look like a demo.</p>
        <h2>Let’s build from your message, your people, and your rhythm.</h2>
        <div><Link className="button" href="/contact?interest=samples">Request a tailored sample ↗</Link><Link className="text-link" href="/services">Explore the services ↗</Link></div>
      </section>
    </main>
  );
}
