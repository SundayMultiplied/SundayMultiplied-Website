const offers = [
  ["Monday Multiplied", "A concise sermon recap, reflection prompt, and guided prayer—ready to share while Sunday is still fresh."],
  ["Group Multiplied", "A sermon-specific small-group guide with thoughtful questions, leader prompts, and a meaningful practice activity."],
  ["Family Multiplied", "A 10–15 minute at-home conversation that helps parents and children remember, talk, connect, practice, and pray."],
];

export default function DraftTwoHome() {
  return <main>
    <section className="d2-hero">
      <div className="d2-wrap d2-hero-grid">
        <div>
          <p className="d2-kicker">Sermon-based discipleship resources</p>
          <h1>Turn Sunday’s sermon into <em>weeklong discipleship.</em></h1>
          <p className="d2-lead">Sunday Multiplied helps churches reinforce and extend Sunday’s teaching with practical weekly resources for individuals, families, groups, and leaders.</p>
          <div className="d2-actions"><a className="d2-primary" href="/draft-2/contact">Request a custom sample</a><a className="d2-secondary" href="/draft-2/services">Explore services</a></div>
        </div>
        <aside className="d2-hero-card">
          <span>One sermon</span><strong>Remember</strong><strong>Discuss</strong><strong>Practice</strong><strong>Live</strong>
          <p>Built from what your church actually preached—not generic content on the same passage.</p>
        </aside>
      </div>
    </section>

    <section className="d2-proof"><div className="d2-wrap"><p>Church-branded</p><p>Pastor-rooted</p><p>Ready for staff to share</p><p>PDF + mobile-friendly HTML</p></div></section>

    <section className="d2-section d2-problem"><div className="d2-wrap d2-two-col">
      <div><p className="d2-kicker">The gap we help close</p><h2>Powerful sermons often end on Sunday.</h2></div>
      <div><p className="d2-big-copy">You pour time, prayer, and preparation into every message. But by midweek, the momentum can be lost.</p><p>Not because the sermon lacked value, but because people need help remembering, reflecting, discussing, and applying it. Leaders are busy. Families need a natural starting point. Groups need structure.</p><p>Sunday Multiplied turns the message you already preached into a simple rhythm that helps people return to it throughout the week.</p></div>
    </div></section>

    <section className="d2-section d2-services"><div className="d2-wrap">
      <div className="d2-heading"><div><p className="d2-kicker">Weekly resources</p><h2>Multiply the impact of every message.</h2></div><p>Start with one resource or connect several touchpoints across the week.</p></div>
      <div className="d2-card-grid">{offers.map(([title, copy], i)=><article key={title}><span>0{i+1}</span><h3>{title}</h3><p>{copy}</p><a href="/draft-2/services">Learn more →</a></article>)}</div>
    </div></section>

    <section className="d2-section d2-benefits"><div className="d2-wrap d2-two-col">
      <div><p className="d2-kicker">Why churches use it</p><h2>Support the ministry rhythm you already have.</h2><a className="d2-secondary" href="/draft-2/examples">See sample experiences</a></div>
      <ul><li>Reinforce your church’s teaching throughout the week</li><li>Save hours of weekly staff and leader preparation</li><li>Equip groups and families with ready-to-use tools</li><li>Move people from listening toward faithful practice</li><li>Create consistency without adding another ministry program</li></ul>
    </div></section>

    <section className="d2-section d2-how"><div className="d2-wrap">
      <div className="d2-heading"><div><p className="d2-kicker">How it works</p><h2>A dependable weekly process.</h2></div><p>Designed to support your pastoral vision—not replace pastoral leadership or spiritual oversight.</p></div>
      <ol><li><span>1</span><div><h3>You preach.</h3><p>Your church shares the sermon transcript, notes, or recording.</p></div></li><li><span>2</span><div><h3>We build.</h3><p>We identify the message’s actual emphasis and design each resource for its audience.</p></div></li><li><span>3</span><div><h3>You share.</h3><p>Your staff receives polished, branded resources ready to distribute.</p></div></li></ol>
    </div></section>

    <section className="d2-section d2-about-tease"><div className="d2-wrap d2-two-col">
      <div className="d2-stat"><strong>19</strong><span>years in learning design</span></div>
      <div><p className="d2-kicker">More than “just prompting”</p><h2>Instructional-design experience is the difference.</h2><p>Sunday Multiplied is built by Brian Davis, an instructional designer whose work has centered on helping people retain information, engage meaningfully, and put learning into practice. AI supports the weekly pace; it does not replace the judgment, audience awareness, or design behind the work.</p><a className="d2-secondary" href="/draft-2/about">Read Brian’s story</a></div>
    </div></section>

    <section className="d2-cta"><div className="d2-wrap"><p className="d2-kicker">See what your sermon could become</p><h2>Send us a recent message. We’ll create a custom sample for your church.</h2><a className="d2-primary" href="/draft-2/contact">Request your sample</a></div></section>
  </main>;
}
