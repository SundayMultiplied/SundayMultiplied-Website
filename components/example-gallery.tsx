"use client";

import { useState } from "react";

type Resource = {
  id: string; day: string; name: string; audience: string; time: string;
  title: string; purpose: string; distinction: string; accent: string;
  sections: { heading: string; body?: string; items?: string[] }[];
};

const resources: Resource[] = [
  {
    id: "monday", day: "Monday", name: "Monday Multiplied", audience: "Individuals", time: "5 minutes",
    title: "The God Who Created Is Near",
    purpose: "Restore the sermon’s central truth before the week gains momentum.",
    distinction: "Brief, reflective, and immediately usable. It recalls rather than reteaches.", accent: "clay",
    sections: [
      { heading: "Sermon Recap", body: "Genesis begins by making clear not every detail of how creation happened, but who stands behind it all. The eternal God created everything and therefore holds rightful authority over our identity, purpose, and choices. Yet this sovereign Creator is not distant: his Spirit hovered attentively over a world that was not yet formed into what it would become. The same God who brought order and light into creation comes near to us through Jesus, bringing gospel light into our darkness and continuing his patient work in our unfinished lives." },
      { heading: "Key Takeaways", items: ["Begin with who God is: the eternal Creator of everything, worthy of your trust, worship, and obedience.", "Receive your identity and moral direction from the God who made you rather than from changing cultural expectations or personal preference.", "When life feels formless or unfinished, rest in the nearness of the God who is still present and actively forming you."] },
      { heading: "Reflection Question", body: "Where are you most tempted to let personal preference, cultural pressure, or fear speak more loudly than the Creator who made you and remains near to you?" },
      { heading: "Prayer", body: "Creator God, you made all things and you alone are worthy of our worship. Help us receive our identity and direction from you, trust your authority, and rest in your nearness while you continue your good work in us. Amen." },
    ],
  },
  {
    id: "family", day: "At home", name: "Family Multiplied", audience: "Families", time: "10–15 minutes",
    title: "The God Who Made Us Is Near",
    purpose: "Help parents turn the sermon into an honest, age-aware family conversation.",
    distinction: "Simple prompts, a realistic scenario, and practice that fits ordinary family life.", accent: "gold",
    sections: [
      { heading: "This Week’s Big Idea", body: "God made everything, so we can trust what he says and remember that he is near while he works in our lives." },
      { heading: "Remember", items: ["What do you remember about the difference between asking “how?” and asking “who made everything?”", "What did the pastor say God’s Spirit was doing when the earth was still formless and empty?", "What is one thing the message helped you understand about God?"] },
      { heading: "Talk About It", items: ["When friends, videos, or people at school tell us who we should be, how can we decide which voices to trust?", "Think of something you are still learning. How does it help to know God stays near while we are still growing?", "When you disagree with someone, what could help you remember that God made that person too?"] },
      { heading: "Family Scenario", body: "A friend says everyone gets to decide what is right for themselves. Practice a response that tells the truth without treating your friend like an enemy. What would Jesus want you to remember?" },
      { heading: "Practice It This Week", body: "Once each day, choose a real decision the family is facing. Pause together and say, “God made us, God knows what is good, and God is near.” Then name one choice that trusts God’s wisdom." },
      { heading: "Family Prayer", body: "Creator God, you made the whole world, and you made each one of us. Help us listen to your Word, treat every person you made with dignity, and remember that Jesus brings light into our darkness. Give our family courage to choose what is true and kindness in the way we speak. Amen." },
    ],
  },
  {
    id: "group", day: "Group night", name: "Group Multiplied", audience: "Small groups", time: "45–60 minutes",
    title: "The Creator Who Is Still at Work",
    purpose: "Move a group from understanding the message to rehearsing a faithful response together.",
    distinction: "Leader-ready flow, sermon-specific questions, and a practical learning activity—not a generic study.", accent: "sage",
    sections: [
      { heading: "Big Idea", body: "The God who created everything is our sovereign Lord and living God, worthy of our worship and actively present in our redemption." },
      { heading: "The Tension", body: "We are constantly invited to define ourselves and decide what is right by personal happiness, cultural assumptions, or fear. Unfinished circumstances can also tempt us to wonder whether God is distant. Genesis confronts both drifts." },
      { heading: "Sermon Snapshot", body: "Genesis was first given to a people shaped by Egypt and preparing to enter a land filled with competing gods. Its opening words announce who created: the eternal God who made everything and lacks nothing. Because God created everything, he has authority over our identity, purpose, worship, and understanding of right and wrong. Yet his Spirit hovers with attentive care. This same God brings gospel light through Jesus and remains near while he continues forming us." },
      { heading: "Discuss", items: ["Why did the pastor say Genesis begins by answering “who” rather than every question about “how”?", "Where do you feel the strongest pressure to let culture, preference, or happiness define what is true or good?", "When life feels unfinished or disordered, what do you naturally assume about God’s presence?", "What is one decision this week in which acknowledging God as Creator should change your response?"] },
      { heading: "Practice the Message", body: "A Christian friend says, “I know what Scripture says, but this choice feels right to me.” Work together to prepare and rehearse a two- or three-sentence response that honors God as Creator while treating your friend as a person made in his image. Revise it until it combines truth, humility, and genuine care." },
      { heading: "Practice This Week", items: ["Before one meaningful decision, ask: What response recognizes that God is my Creator and Lord?", "Choose one concrete way to honor the dignity of a person you tend to reduce to a disagreement.", "When something feels unfinished, pray: God is near, attentive, and still at work."] },
    ],
  },
  {
    id: "midweek", day: "Midweek", name: "Reinforcement", audience: "Churchwide", time: "1 minute",
    title: "Bring the truth back into view",
    purpose: "Reconnect the sermon to the decisions and unfinished places people are facing now.",
    distinction: "One timely prompt—short enough for text, email, or the church’s existing channel.", accent: "moss",
    sections: [{ heading: "Midweek Check-in", body: "Where have you needed to remember that God is both the Creator with authority and the living God who is near? Share one decision or unfinished place where that truth is changing your response." }],
  },
];

export function ExampleGallery() {
  const [active, setActive] = useState(resources[0].id);
  const resource = resources.find((item) => item.id === active) ?? resources[0];
  return (
    <div className="sample-journey">
      <div className="journey-tabs" role="tablist" aria-label="Sample Church weekly resources">
        {resources.map((item, index) => (
          <button key={item.id} type="button" role="tab" aria-selected={active === item.id} className={active === item.id ? "selected" : ""} onClick={() => setActive(item.id)}>
            <small>0{index + 1} · {item.day}</small><strong>{item.name}</strong>
          </button>
        ))}
      </div>
      <article className={`sample-resource accent-${resource.accent}`} role="tabpanel">
        <div className="sample-resource-context">
          <p className="eyebrow">{resource.name}</p><h3>{resource.title}</h3>
          <dl>
            <div><dt>For</dt><dd>{resource.audience}</dd></div>
            <div><dt>Time</dt><dd>{resource.time}</dd></div>
            <div><dt>Purpose</dt><dd>{resource.purpose}</dd></div>
          </dl>
          <div className="resource-distinction"><span>What makes it different</span><p>{resource.distinction}</p></div>
        </div>
        <div className="sample-document-transition" aria-hidden="true">
          <span>Actual Sample Church resource</span>
          <i>↓</i>
        </div>
        <div className="sample-document">
          <header>
            <div><p>Sample Church</p><span>In the Beginning · Genesis 1:1–2</span></div>
            <img src="/sample-church-logo.webp" alt="Sample Church logo" />
          </header>
          {resource.sections.map((section) => (
            <section key={section.heading}><h4>{section.heading}</h4>{section.body && <p>{section.body}</p>}{section.items && <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}</section>
          ))}
        </div>
      </article>
    </div>
  );
}
