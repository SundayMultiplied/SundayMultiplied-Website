"use client";

import { FormEvent, useEffect, useState } from "react";

export function ContactForm() {
  const [interest, setInterest] = useState("8-week pilot");

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("interest");
    const map: Record<string, string> = { group: "Group Multiplied", pilot: "8-week pilot", workshop: "Leader workshop", samples: "Tailored sample" };
    if (value && map[value]) setInterest(map[value]);
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "");
    const church = String(data.get("church") || "");
    const email = String(data.get("email") || "");
    const message = String(data.get("message") || "");
    const subject = encodeURIComponent(`Sunday Multiplied — ${interest}`);
    const body = encodeURIComponent(`Name: ${name}\nChurch: ${church}\nEmail: ${email}\nInterested in: ${interest}\n\nWhat would be helpful:\n${message}`);
    window.location.href = `mailto:hello@sundaymultiplied.com?subject=${subject}&body=${body}`;
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit}>
      <div className="field-row">
        <label>Name<input name="name" type="text" autoComplete="name" required placeholder="Your name" /></label>
        <label>Church<input name="church" type="text" autoComplete="organization" required placeholder="Church name" /></label>
      </div>
      <label>Email<input name="email" type="email" autoComplete="email" required placeholder="you@church.org" /></label>
      <label>I’m interested in
        <select name="interest" value={interest} onChange={event => setInterest(event.target.value)}>
          <option>8-week pilot</option><option>Group Multiplied</option><option>Connected weekly rhythm</option><option>Leader workshop</option><option>Tailored sample</option><option>Just exploring</option>
        </select>
      </label>
      <label>What would make this conversation useful?<textarea name="message" rows={5} placeholder="Tell me what your team is considering, where the weekly rhythm breaks down, or what you want leaders to be able to do." /></label>
      <button className="button" type="submit">Create email to Brian ↗</button>
      <p className="form-note">This opens a prepared message in your email app. Nothing is sent until you choose to send it.</p>
    </form>
  );
}
