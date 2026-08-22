"use client";

import { useState } from "react";

const examples = [
  {
    type: "Monday",
    label: "Individual reflection",
    title: "Return to the big idea",
    eyebrow: "Monday Multiplied",
    preview: "A crisp recap recalls the message, names the tension people will feel this week, and offers one reflection and prayer.",
    steps: ["Big idea", "Sermon snapshot", "Reflect", "Practice", "Pray"],
    accent: "clay",
  },
  {
    type: "Family",
    label: "10–15 minute conversation",
    title: "Trust instead",
    eyebrow: "Philippians 2:14–16 · Family sample",
    preview: "When life doesn’t go our way, we can trust God instead of complaining.",
    steps: ["Remember", "Talk", "Connect", "Notice → Stop → Trust → Thank", "Pray"],
    accent: "gold",
  },
  {
    type: "Group",
    label: "Small-group gathering",
    title: "Practice the message",
    eyebrow: "Group Multiplied",
    preview: "The guide moves from understanding the pastor’s emphasis to a realistic scenario where the group must use what it learned.",
    steps: ["Big idea", "Scripture", "Sermon snapshot", "Discuss", "Practice together"],
    accent: "sage",
  },
  {
    type: "Midweek",
    label: "Timely reinforcement",
    title: "Bring truth back into view",
    eyebrow: "Midweek touchpoint",
    preview: "One well-timed prompt helps people notice where the sermon is meeting real life right now.",
    steps: ["Recall", "Notice", "Respond", "Encourage someone"],
    accent: "moss",
  },
];

const filters = ["All", "Monday", "Family", "Group", "Midweek"];

export function ExampleGallery() {
  const [filter, setFilter] = useState("All");
  const [expanded, setExpanded] = useState<number | null>(1);
  const shown = examples.map((item, index) => ({ ...item, index })).filter(item => filter === "All" || item.type === filter);

  return (
    <div>
      <div className="gallery-filter" role="group" aria-label="Filter examples">
        {filters.map(item => <button key={item} type="button" className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}</button>)}
      </div>
      <div className="example-grid">
        {shown.map(item => (
          <article className={`example-card accent-${item.accent} ${expanded === item.index ? "expanded" : ""}`} key={item.type}>
            <div className="example-meta"><span>{item.label}</span><span>0{item.index + 1}</span></div>
            <div className="example-paper">
              <p className="eyebrow">{item.eyebrow}</p>
              <h3>{item.title}</h3>
              <p>{item.preview}</p>
              <div className="example-lines"><i /><i /><i /></div>
            </div>
            <button type="button" aria-expanded={expanded === item.index} onClick={() => setExpanded(expanded === item.index ? null : item.index)}>
              {expanded === item.index ? "Close structure" : "View structure"} <span>{expanded === item.index ? "−" : "+"}</span>
            </button>
            {expanded === item.index && <div className="example-structure">{item.steps.map((step, index) => <span key={step}><small>0{index + 1}</small>{step}</span>)}</div>}
          </article>
        ))}
      </div>
    </div>
  );
}
