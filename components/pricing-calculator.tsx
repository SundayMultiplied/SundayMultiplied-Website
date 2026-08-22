"use client";

import Link from "next/link";
import { useState } from "react";

const tiers = [
  { label: "Up to 500", detail: "people", price: 199 },
  { label: "501–2,000", detail: "people", price: 249 },
  { label: "2,001+", detail: "people", price: 349 },
];

export function PricingCalculator() {
  const [selected, setSelected] = useState(0);
  const tier = tiers[selected];

  return (
    <div className="pricing-tool">
      <div className="pricing-chooser">
        <p className="eyebrow">Average weekly attendance</p>
        <div role="radiogroup" aria-label="Church size">
          {tiers.map((item, index) => (
            <button type="button" role="radio" aria-checked={selected === index} className={selected === index ? "selected" : ""} onClick={() => setSelected(index)} key={item.label}>
              <strong>{item.label}</strong><span>{item.detail}</span>
            </button>
          ))}
        </div>
        <p className="pricing-note">Simple church-size pricing keeps the weekly scope consistent while matching the scale of the ministry.</p>
      </div>
      <article className="price-result" aria-live="polite">
        <p className="eyebrow light">Group Multiplied</p>
        <div className="price"><span>$</span><strong>{tier.price}</strong><small>/ month</small></div>
        <p>One dependable, sermon-rooted group guide each week.</p>
        <ul>
          <li>Weekly PDF + HTML</li>
          <li>Church-branded design</li>
          <li>One revision round</li>
          <li>Organized resource archive</li>
          <li>Delivered to church staff</li>
        </ul>
        <Link className="button button-light" href={`/contact?interest=group&tier=${encodeURIComponent(tier.label)}`}>Talk about Group Multiplied ↗</Link>
      </article>
    </div>
  );
}
