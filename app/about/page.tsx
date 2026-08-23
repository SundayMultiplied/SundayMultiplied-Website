import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Brian Davis | Sunday Multiplied",
  description: "How 19 years of instructional design, adult learning, and systems thinking shape Sunday Multiplied.",
};

const expertise = [
  {
    number: "01",
    title: "Instructional design",
    copy: "Finding the clearest path from hearing an idea to understanding it, remembering it, and using it when it matters.",
  },
  {
    number: "02",
    title: "Adult learning + facilitation",
    copy: "Designing questions and experiences that invite honest participation, useful reflection, and meaningful conversation.",
  },
  {
    number: "03",
    title: "Systems thinking",
    copy: "Turning a good idea into a sustainable weekly rhythm with clear inputs, dependable outputs, and room to improve.",
  },
  {
    number: "04",
    title: "Audience-centered design",
    copy: "Respecting that an individual reflection, a family dinner-table conversation, and a small-group gathering should not feel the same.",
  },
];

const judgment = [
  ["Listen", "What did the pastor actually emphasize—not merely what could be said about the passage?"],
  ["Distill", "What central truth and real-life tension should hold the week together?"],
  ["Design", "What would help this specific audience remember, discuss, connect, and practice it?"],
  ["Review", "Does the finished resource sound pastoral, remain faithful to the message, and work in the time people actually have?"],
];

export default function AboutPage() {
  return (
    <main>
      <section className="page-hero about-hero">
        <p className="eyebrow light">About Sunday Multiplied</p>
        <h1>Learning design<br />in service of <em>discipleship.</em></h1>
        <p>I’m Brian Davis. For 19 years, my work has centered on a practical question: how do we help people do something meaningful with what they hear?</p>
      </section>

      <section className="about-origin page-section">
        <div className="about-profile" aria-label="Brian Davis, founder of Sunday Multiplied">
          <div className="about-profile-orbit">
            <img className="profile-photo" src="/bdavis.webp" alt="Brian Davis, founder of Sunday Multiplied" />
            <span className="profile-tag tag-design">Design</span>
            <span className="profile-tag tag-practice">Practice</span>
            <span className="profile-tag tag-reflect">Reflect</span>
          </div>
          <p><strong>Brian Davis</strong><span>Founder · Instructional Designer</span></p>
        </div>
        <div className="about-story">
          <p className="eyebrow">The question behind the work</p>
          <h2>I could see the gap between a faithful message and a crowded week.</h2>
          <p className="about-lead">Sunday can be meaningful. People can leave encouraged, challenged, and ready to respond. Then work, school, family, notifications, and ordinary pressure compete for their attention.</p>
          <p>My background is in corporate learning and development, where success is not measured by whether information was delivered. The real question is whether people understood it, remembered it, and could apply it in the moment they needed it.</p>
          <p>Sunday Multiplied began by bringing that same design question into discipleship: how can one church’s actual sermon keep creating opportunities to remember, reflect, discuss, and practice throughout the week?</p>
        </div>
      </section>

      <section className="experience-section page-section">
        <div className="experience-heading">
          <p className="eyebrow light">What I bring to the table</p>
          <h2>Nineteen years of designing for what happens <em>after</em> the message.</h2>
          <p>The setting may be different, but the human challenge is familiar: attention fades, understanding varies, and good intentions need a path into action.</p>
        </div>
        <div className="expertise-grid">
          {expertise.map(item => (
            <article key={item.number}>
              <span>{item.number}</span>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="not-prompting page-section">
        <div className="not-prompting-heading">
          <p className="eyebrow">The human difference</p>
          <h2>AI can generate words.<br />That is not the same as designing formation.</h2>
        </div>
        <div className="not-prompting-copy">
          <p className="about-lead">AI helps Sunday Multiplied work at a weekly pace. It is a tool in the process—not the product, the strategy, or the judgment behind it.</p>
          <p>The difference is knowing what to listen for in the sermon, what must remain intact, what each audience needs, what a natural conversation sounds like, and what kind of practice genuinely belongs to that message.</p>
          <p>I’m not replacing the pastor’s voice. I’m designing what helps people return to it.</p>
        </div>
        <div className="judgment-track">
          {judgment.map(([title, copy], index) => (
            <article key={title}>
              <span>0{index + 1}</span><h3>{title}</h3><p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-conviction page-section">
        <div className="about-conviction-quote">
          <p className="eyebrow light">The conviction underneath it</p>
          <blockquote>Only the Holy Spirit changes a heart. Thoughtful design can help people keep returning to the truth He uses.</blockquote>
        </div>
        <div className="about-conviction-note">
          <p>Sunday Multiplied is not a theological shift. It is a pedagogical one. The work is to create continuity around the message—not more content for people to consume.</p>
          <p className="signature light">Brian Davis <span>Founder, Sunday Multiplied</span></p>
        </div>
      </section>

      <section className="inline-cta page-section">
        <p className="eyebrow">One sermon deserves more than one moment.</p>
        <h2>Let’s explore what a thoughtful weekly rhythm could look like for your church.</h2>
        <div><Link className="button" href="/contact">Start a conversation ↗</Link><Link className="text-link" href="/examples">See the work ↗</Link></div>
      </section>
    </main>
  );
}
