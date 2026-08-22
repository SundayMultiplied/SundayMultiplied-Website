import Link from "next/link";

const resources = [
  {
    name: "Monday Multiplied",
    moment: "Remember",
    copy: "A concise, pastoral recap that returns people to the message while Sunday is still close.",
  },
  {
    name: "Family Multiplied",
    moment: "Talk + practice",
    copy: "A 10–15 minute conversation that helps parents and children connect the sermon to home.",
  },
  {
    name: "Group Multiplied",
    moment: "Discuss + apply",
    copy: "A sermon-rooted guide that moves groups beyond review and into shared practice.",
  },
  {
    name: "Midweek Reinforcement",
    moment: "Return",
    copy: "A timely prompt that brings the week’s truth back into view when life gets loud.",
  },
];

function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

export default function Home() {
  return (
    <main>
      <section className="hero">
        <div className="hero-noise" aria-hidden="true" />
        <div className="hero-copy">
          <p className="eyebrow light">Cultivating fruit beyond Sunday</p>
          <h1>The sermon is<br /><em>not the finish line.</em></h1>
          <p className="hero-lead">
            Sunday Multiplied helps churches turn one faithful message into intentional rhythms that carry God’s Word into the other 167 hours.
          </p>
          <div className="hero-actions">
            <Link className="button button-light" href="#approach">See the approach <span>↓</span></Link>
            <Link className="text-link light" href="/contact?interest=pilot">Explore a pilot <Arrow /></Link>
          </div>
        </div>
        <div className="hero-orbit" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit-center"><strong>1</strong><span>sermon</span></div>
          <span className="orbit-label label-one">Remember</span>
          <span className="orbit-label label-two">Discuss</span>
          <span className="orbit-label label-three">Practice</span>
          <span className="orbit-label label-four">Share</span>
        </div>
        <div className="hero-index"><span>01</span><span>Mission</span></div>
      </section>

      <section className="tension section-pad" id="approach">
        <div>
          <p className="eyebrow">The Thursday tension</p>
          <h2>Sunday was meaningful.<br />Then the week happened.</h2>
        </div>
        <div className="tension-copy">
          <p className="lead-serif">The message does not lose its truth. It loses its place in people’s attention.</p>
          <p>Work, school, family, notifications, and ordinary pressure crowd in. By Thursday, many people remember the feeling of Sunday more clearly than the truth they heard.</p>
          <p>We help churches create simple, sermon-rooted touchpoints that bring that truth back into view—without asking pastors to build another ministry program.</p>
        </div>
      </section>

      <section className="rhythm section-pad" id="resources">
        <div className="section-heading">
          <p className="eyebrow light">One sermon. Multiple touchpoints.</p>
          <h2>A weekly rhythm built from what your church actually heard.</h2>
          <p>Pastoral in tone. Branded for your church. Designed for formation, not content volume.</p>
        </div>
        <div className="resource-grid">
          {resources.map((resource, index) => (
            <article className="resource-card" key={resource.name}>
              <div className="resource-top"><span>0{index + 1}</span><span>{resource.moment}</span></div>
              <h3>{resource.name}</h3>
              <p>{resource.copy}</p>
              <div className="resource-line" />
            </article>
          ))}
        </div>
      </section>

      <section className="formation section-pad">
        <div className="formation-quote">
          <span className="quote-mark">“</span>
          <blockquote>God produces the fruit.<br />We cultivate the conditions<br />for people to <em>abide.</em></blockquote>
        </div>
        <div className="formation-note">
          <p className="eyebrow">Conviction + craft</p>
          <p>Sunday Multiplied is not a theological shift. It is a pedagogical one—joining confidence in the Spirit’s work with thoughtful rhythms of remembering, conversation, and practice.</p>
        </div>
      </section>

      <section className="founder-home section-pad" id="founder">
        <div className="founder-home-mark" aria-hidden="true"><span>19</span><small>years in learning design</small></div>
        <div className="founder-home-copy">
          <p className="eyebrow">Why Sunday Multiplied is different</p>
          <h2>Built by a learning designer.<br />Made to serve the pastor’s message.</h2>
          <p>AI helps with scale. It is not the product. The real value is the instructional-design judgment behind every resource: finding the sermon’s actual emphasis, designing for different audiences, and creating a clear path from hearing to practice.</p>
          <Link className="text-link" href="/about">Meet Brian and see the approach <Arrow /></Link>
        </div>
      </section>

      <section className="pilot section-pad" id="pilot">
        <div className="pilot-number" aria-hidden="true">8</div>
        <div className="pilot-copy">
          <p className="eyebrow">A focused way to begin</p>
          <h2>See the whole rhythm across eight Sundays.</h2>
          <p>An 8-week pilot lets your team experience sermon-based resources in the real pace of ministry, gather feedback, and see what fits before making a longer commitment.</p>
          <Link className="button" href="/contact?interest=pilot">Plan an 8-week pilot <Arrow /></Link>
        </div>
        <div className="pilot-list">
          <span>Weekly sermon-to-resource production</span>
          <span>Church-branded deliverables</span>
          <span>Family + group + individual touchpoints</span>
          <span>Staff feedback and refinement</span>
        </div>
      </section>

    </main>
  );
}
