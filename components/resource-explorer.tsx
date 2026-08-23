"use client";

import { useState } from "react";

const resources = [
  {
    short: "Monday",
    title: "Monday Multiplied",
    audience: "The whole church",
    time: "3–5 minutes",
    promise: "Return to Sunday while the message is still close.",
    description: "A concise, pastoral follow-up that recalls the big idea, names the real-life tension, and invites a first response for the week.",
    bestFit: "Churches seeking one simple, churchwide weekly touchpoint.",
    flow: ["Remember", "Reflect", "Pray"],
    include: ["Sermon snapshot", "Key truth", "Personal reflection", "Prayer prompt"],
  },
  {
    short: "Family",
    title: "Family Multiplied",
    audience: "Parents + children",
    time: "10–15 minutes",
    promise: "Help families talk about and practice the sermon at home.",
    description: "A natural, age-flexible family conversation—not a worksheet or miniature Sunday school lesson—built from what parents and children heard together.",
    bestFit: "Churches wanting to equip parents without creating another family program.",
    flow: ["Remember", "Talk", "Connect", "Practice", "Pray"],
    include: ["Family-sized recap", "Conversation prompts", "Everyday connection", "One shared practice"],
  },
  {
    short: "Group",
    title: "Group Multiplied",
    audience: "Small groups",
    time: "A full gathering",
    promise: "Move the group from reviewing the sermon to practicing it.",
    description: "A polished discussion guide rooted in the pastor’s actual emphasis, with questions leaders can ask aloud and an activity that rehearses the message.",
    bestFit: "Churches with groups that need sermon alignment and reduced leader preparation.",
    flow: ["Understand", "Reflect", "Apply", "Practice"],
    include: ["Full Scripture passage", "Sermon snapshot", "Natural discussion guide", "Practice the Message activity"],
  },
  {
    short: "Midweek",
    title: "Midweek Reinforcement",
    audience: "Church or ministry",
    time: "1–2 minutes",
    promise: "Bring the message back into view when the week gets loud.",
    description: "A carefully timed question, challenge, testimony prompt, or application reminder that returns people to the week’s central truth.",
    bestFit: "Churches building continuity across their existing communication rhythm.",
    flow: ["Recall", "Notice", "Respond", "Share"],
    include: ["Message-ready copy", "One clear response", "Flexible channel", "Weekly rhythm alignment"],
  },
];

export function ResourceExplorer() {
  const [selected, setSelected] = useState(0);
  const item = resources[selected];

  return (
    <div className="explorer-shell">
      <div className="explorer-tabs" role="tablist" aria-label="Weekly resource types">
        {resources.map((resource, index) => (
          <button key={resource.title} type="button" role="tab" aria-selected={selected === index} className={selected === index ? "selected" : ""} onClick={() => setSelected(index)}>
            <span>0{index + 1}</span>{resource.short}
          </button>
        ))}
      </div>
      <article className="explorer-panel" role="tabpanel">
        <div className="explorer-intro">
          <p className="eyebrow">{item.audience} · {item.time}</p>
          <h2>{item.title}</h2>
          <p className="explorer-promise">{item.promise}</p>
          <p>{item.description}</p>
          <p className="best-fit"><strong>Best fit for:</strong> {item.bestFit}</p>
        </div>
        <div className="flow-track" aria-label={`${item.title} flow`}>
          {item.flow.map((step, index) => <div key={step}><span>{index + 1}</span><strong>{step}</strong></div>)}
        </div>
        <div className="include-card">
          <p className="eyebrow">What it includes</p>
          {item.include.map(part => <span key={part}>✓ {part}</span>)}
        </div>
      </article>
    </div>
  );
}
