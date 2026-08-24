import Link from "next/link";

const resources = [
  ["Monday Multiplied", "Remember", "A concise, pastoral return to the message while Sunday is still close."],
  ["Family Multiplied", "Talk + practice", "A 10–15 minute conversation that helps parents and children connect the sermon to home."],
  ["Group Multiplied", "Discuss + apply", "A sermon-rooted guide that moves groups beyond review and into shared practice."],
  ["Midweek Reinforcement", "Return", "A timely prompt that brings the week’s truth back into view when life gets loud."],
];

export default function HybridHome() {
  return <main>
    <section className="hero hybrid-hero">
      <div className="hero-noise" aria-hidden="true" />
      <div className="hero-copy">
        <p className="eyebrow light">Cultivating fruit beyond Sunday</p>
        <h1>The sermon is<br /><em>not the finish line.</em></h1>
        <p className="hero-lead">Sunday Multiplied helps churches turn one faithful message into intentional rhythms that carry God’s Word into the other 167 hours.</p>
        <div className="hero-actions">
          <Link className="button button-light" href="/draft-hybrid/contact">Explore what your week could become <span>↗</span></Link>
          <Link className="text-link light" href="#approach">See the approach <span>↓</span></Link>
        </div>
      </div>
      <div className="hero-orbit" aria-hidden="true">
        <div className="orbit orbit-one" /><div className="orbit orbit-two" />
        <div className="orbit-center"><strong>1</strong><span>sermon</span></div>
        <span className="orbit-label label-one">Remember</span><span className="orbit-label label-two">Discuss</span><span className="orbit-label label-three">Practice</span><span className="orbit-label label-four">Share</span>
      </div>
      <div className="hero-index"><span>01</span><span>Mission</span></div>
    </section>

    <section className="hybrid-proof" aria-label="What churches receive">
      <p>Built from your actual sermon</p><p>Church-branded</p><p>Ready for staff to share</p><p>PDF + mobile-friendly HTML</p>
    </section>

    <section className="tension section-pad" id="approach">
      <div><p className="eyebrow">The Thursday tension</p><h2>Sunday was meaningful.<br />Then the week happened.</h2></div>
      <div className="tension-copy"><p className="lead-serif">The message does not lose its truth. It loses its place in people’s attention.</p><p>Work, school, family, notifications, and ordinary pressure crowd in. By Thursday, many people remember the feeling of Sunday more clearly than the truth they heard.</p><p>We help churches create simple, sermon-rooted touchpoints that bring that truth back into view—without asking pastors to build another ministry program.</p></div>
    </section>

    <section className="rhythm section-pad">
      <div className="section-heading"><p className="eyebrow light">One sermon. Multiple touchpoints.</p><h2>A weekly rhythm built from what your church actually heard.</h2><p>Pastoral in tone. Branded for your church. Designed for formation, not content volume.</p></div>
      <div className="resource-grid">{resources.map(([name,moment,copy],index)=><article className="resource-card" key={name}><div className="resource-top"><span>0{index+1}</span><span>{moment}</span></div><h3>{name}</h3><p>{copy}</p><div className="resource-line" /></article>)}</div>
      <Link className="text-link light hybrid-section-link" href="/draft-hybrid/services">Explore the complete weekly rhythm ↗</Link>
    </section>

    <section className="hybrid-benefits section-pad">
      <div><p className="eyebrow">Strengthen what already exists</p><h2>Support the ministry rhythm your church already has.</h2><p>Sunday Multiplied acts as connective tissue between the sermon and the environments where discipleship continues.</p></div>
      <ul><li>Reinforce the pastor’s teaching throughout the week.</li><li>Equip families, groups, and leaders with sermon-rooted next steps.</li><li>Reduce weekly preparation for staff and volunteer leaders.</li><li>Move people from hearing toward faithful practice.</li><li>Strengthen existing ministries without adding another program.</li></ul>
    </section>

    <section className="hybrid-process section-pad">
      <div className="section-heading"><p className="eyebrow light">A dependable weekly process</p><h2>Pastoral leadership stays at the center.</h2><p>Sunday Multiplied supports the message and the ministry environments your team already leads.</p></div>
      <ol><li><span>01</span><div><h3>You preach.</h3><p>The sermon and its pastoral emphasis remain the source.</p></div></li><li><span>02</span><div><h3>We listen + design.</h3><p>We create audience-specific touchpoints rooted in what your church actually heard.</p></div></li><li><span>03</span><div><h3>Your team reviews + shares.</h3><p>Staff receives polished, branded resources ready for the channels you already use.</p></div></li></ol>
    </section>

    <section className="formation section-pad"><div className="formation-quote"><span className="quote-mark">“</span><blockquote>God produces the fruit.<br />We cultivate the conditions<br />for people to <em>abide.</em></blockquote></div><div className="formation-note"><p className="eyebrow">Conviction + craft</p><p>Sunday Multiplied is not a theological shift. It is a pedagogical one—joining confidence in the Spirit’s work with thoughtful rhythms of remembering, conversation, and practice.</p></div></section>

    <section className="founder-home section-pad"><div className="founder-home-mark" aria-hidden="true"><span>19</span><small>years in learning design</small></div><div className="founder-home-copy"><p className="eyebrow">Why Sunday Multiplied is different</p><h2>Built by a learning designer.<br />Made to serve the pastor’s message.</h2><p>AI helps with scale. It is not the product. The real value is the instructional-design judgment behind every resource: finding the sermon’s actual emphasis, designing for different audiences, and creating a clear path from hearing to practice.</p><Link className="text-link" href="/draft-hybrid/about">Meet Brian and see the approach ↗</Link></div></section>

    <section className="hybrid-conversation section-pad"><p className="eyebrow">Start with the ministry need—not a package.</p><h2>What could your other 167 hours become?</h2><p>Every church already has a rhythm between Sundays. Let’s identify where the message currently travels, where people lose contact with it, and which touchpoint could make the most meaningful difference.</p><div><Link className="button button-light" href="/draft-hybrid/contact">Start a conversation ↗</Link><Link className="text-link light" href="/draft-hybrid/examples">See what one sermon can become ↗</Link></div></section>
  </main>;
}
