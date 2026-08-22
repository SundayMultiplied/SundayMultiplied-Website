import Link from "next/link";
import { PricingCalculator } from "../../components/pricing-calculator";

export default function PricingPage() {
  return (
    <main>
      <section className="page-hero pricing-hero">
        <p className="eyebrow light">Pricing · Start at the right scale</p>
        <h1>Clear enough to budget.<br /><em>Flexible enough to fit.</em></h1>
        <p>Begin with one weekly resource, test the connected rhythm through a focused pilot, or equip your leaders through a tailored workshop.</p>
      </section>

      <section className="page-section pricing-section">
        <div className="page-section-lead">
          <p className="eyebrow">Weekly service pricing</p>
          <h2>Find your Group Multiplied rate.</h2>
        </div>
        <PricingCalculator />
      </section>

      <section className="other-pricing page-section">
        <div className="page-section-lead compact">
          <p className="eyebrow light">Connect more of the week</p>
          <h2>Two more ways to begin.</h2>
        </div>
        <div className="pricing-cards">
          <article>
            <p className="eyebrow">8-week pilot</p>
            <h3>Experience the full rhythm.</h3>
            <p>Connect individual, family, group, and midweek touchpoints around eight consecutive sermons. Scope and pricing are shaped around the resources your team wants to test.</p>
            <Link className="text-link" href="/contact?interest=pilot">Scope a pilot ↗</Link>
          </article>
          <article>
            <p className="eyebrow">Workshops</p>
            <h3>One flat engagement rate.</h3>
            <p>Workshop pricing is based on the format, length, preparation, and travel—not a per-person fee—so you can invite the leaders who need to be in the room.</p>
            <Link className="text-link" href="/contact?interest=workshop">Request a workshop scope ↗</Link>
          </article>
        </div>
      </section>

      <section className="pricing-faq page-section">
        <div className="page-section-lead compact"><p className="eyebrow">Useful details</p><h2>Before you put it in the budget.</h2></div>
        <div className="faq-list">
          <details><summary>Who distributes the weekly resources?<span>+</span></summary><p>Sunday Multiplied delivers the finished files to your church staff. Your team decides how and where to share them.</p></details>
          <details><summary>Can we start with only Group Multiplied?<span>+</span></summary><p>Yes. Group Multiplied is a complete standalone weekly service and a practical place to begin.</p></details>
          <details><summary>Are these generic Bible-study templates?<span>+</span></summary><p>No. Each guide is built from the actual sermon and reflects the pastor’s emphasis, language, illustrations, and application.</p></details>
          <details><summary>What does the pilot help us learn?<span>+</span></summary><p>It lets your team test production timing, distribution, staff workflow, audience response, and the right mix of weekly touchpoints before a longer engagement.</p></details>
        </div>
      </section>
    </main>
  );
}
