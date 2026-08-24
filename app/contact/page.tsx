import { ContactForm } from "../../components/contact-form";
import { ReviewLink as Link } from "../../components/review-link";

export default function ContactPage() {
  return (
    <main>
      <section className="contact-hero page-section">
        <div className="contact-intro">
          <p className="eyebrow light">Contact · Start a useful conversation</p>
          <h1>What could the other<br /><em>167 hours</em> look like?</h1>
          <p>Share what your church is working toward. We’ll begin with the ministry need—not a package.</p>
          <a className="contact-email" href="mailto:hello@sundaymultiplied.com">hello@sundaymultiplied.com ↗</a>
        </div>
        <div className="contact-form-wrap"><ContactForm /></div>
      </section>

      <section className="founder-section page-section">
        <div className="founder-mark" aria-hidden="true"><span>BD</span><i /></div>
        <div>
          <p className="eyebrow">A note from Brian</p>
          <h2>I built Sunday Multiplied for a tension I could see from both sides.</h2>
          <p>Churches preach faithful messages every week. People genuinely want those messages to shape how they live. But the space between hearing and living is crowded.</p>
          <p>My background in instructional design taught me to pay attention to that space: what people remember, where they get stuck, what helps a conversation become practice. Sunday Multiplied brings that craft into the service of discipleship—without confusing a system with the Spirit’s work.</p>
          <Link className="text-link" href="/about">Read the full story ↗</Link>
          <p className="signature">Brian Davis <span>Founder, Sunday Multiplied</span></p>
        </div>
      </section>
    </main>
  );
}
