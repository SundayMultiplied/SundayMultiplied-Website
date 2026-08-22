import { notFound } from "next/navigation";

const pages: Record<string, { eyebrow:string; title:string; intro:string; blocks:{title:string; copy:string; items?:string[]}[] }> = {
  services: { eyebrow:"Services", title:"Start where you are. Grow over time.", intro:"Every resource begins with your church’s actual sermon and is designed to support the people and ministry environments you already serve.", blocks:[
    {title:"Monday Multiplied", copy:"Weekly sermon follow-up made simple: a clear recap, focused reflection, and guided prayer—ready to share immediately.", items:["Best for a simple, high-impact weekly touchpoint","Pastoral, concise, and church-branded","PDF and mobile-friendly HTML"]},
    {title:"Group Multiplied", copy:"Sermon-based discipleship for small groups, with natural questions, leader prompts, and built-in application.", items:["Reduces weekly leader preparation","Follows the pastor’s emphasis","Moves discussion toward practice"]},
    {title:"Family Multiplied", copy:"A 10–15 minute conversation built for parents and children to use together at home.", items:["Remember → Talk → Connect → Practice → Pray","Age-aware without feeling like a children’s worksheet","Easy to use at the table or before bed"]},
    {title:"Church Multiplied", copy:"A connected weekly rhythm across individual, family, group, and leader touchpoints.", items:["Midweek reinforcement","Leader support and coaching tools","Custom discipleship resources"]}]},
  workshops: { eyebrow:"Workshops", title:"Equip leaders for better conversations.", intro:"Practical, participatory workshops give ministry leaders skills they can use at their very next gathering.", blocks:[
    {title:"Facilitate for Formation",copy:"Help small-group leaders ask better questions, build participation, and move from insight to application.",items:["90-minute workshop","Realistic practice and feedback","Virtual or in person"]},
    {title:"Map the 167 Hours",copy:"A working session for pastors and ministry teams to identify where thoughtful touchpoints can strengthen the week.",items:["Map current ministry environments","Identify friction points","Choose sustainable rhythms"]},
    {title:"From Sermon to Practice",copy:"Learn to translate a sermon’s central truth into useful conversation, decisions, and action.",items:["Distill without oversimplifying","Design for different audiences","Create sermon-rooted practice"]}]},
  pricing: { eyebrow:"Pricing", title:"Clear enough to budget. Flexible enough to fit.", intro:"Begin with one weekly resource, a focused pilot, or a tailored workshop.", blocks:[
    {title:"Group Multiplied · up to 500",copy:"$199 per month",items:["Weekly PDF + HTML guide","Branded design","One revision round","Archive and staff delivery"]},
    {title:"Group Multiplied · 501–2,000",copy:"$249 per month",items:["The complete weekly Group Multiplied service","Scaled for your church’s attendance"]},
    {title:"Group Multiplied · 2,001+",copy:"$349 per month",items:["The complete weekly Group Multiplied service","Designed for larger church environments"]},
    {title:"Pilots + workshops",copy:"Scoped to your goals",items:["Eight-week pilot options","Flat workshop engagement pricing","No per-participant fee"]}]},
  examples: { eyebrow:"Examples", title:"See what one sermon can become.", intro:"The same message can serve different environments without becoming generic or repetitive.", blocks:[
    {title:"Monday Multiplied",copy:"A concise return to the sermon’s big idea, tension, reflection, and prayer."},
    {title:"Group Multiplied",copy:"A leader-ready guide for understanding, reflection, discussion, and shared practice."},
    {title:"Family Multiplied",copy:"A natural at-home experience designed for parents and children to use together."},
    {title:"Built for your church",copy:"Your branding, your pastor’s emphasis, and your preferred delivery formats—not a one-size-fits-all template."}]},
  about: { eyebrow:"About", title:"Learning design in service of discipleship.", intro:"Sunday Multiplied grew from a personal question: how can I use nearly two decades of professional learning-design experience for Kingdom work?", blocks:[
    {title:"About Brian Davis",copy:"For 19 years, Brian’s work has focused on helping people not just receive information, but retain it, apply it, and act on it. That same approach shapes Sunday Multiplied."},
    {title:"What makes this different",copy:"Most content tools generate information. Sunday Multiplied applies instructional design: listening for the pastor’s emphasis, shaping the right experience for each audience, and building a path from hearing toward practice."},
    {title:"AI is a tool—not the product",copy:"AI supports the weekly pace. The value is the human judgment behind what to preserve, what to emphasize, what each audience needs, and what will actually work in real ministry settings."},
    {title:"Our mission",copy:"To help churches extend the impact of every sermon by equipping people to engage, discuss, and apply God’s Word throughout the week."}]},
  contact: { eyebrow:"Get started", title:"See what your sermon could become.", intro:"We are onboarding a limited number of churches. Send a recent sermon and tell us where you want to strengthen discipleship.", blocks:[
    {title:"Request a custom sample",copy:"Email hello@sundaymultiplied.com with a sermon link, transcript, or notes. We’ll start with the ministry need—not a package."},
    {title:"Explore an eight-week pilot",copy:"Test a connected weekly rhythm in the real pace of ministry before making a longer commitment."},
    {title:"Plan a workshop",copy:"Tell us about your leaders, current challenges, and the conversations you want them equipped to guide."}]}
};

export function generateStaticParams(){ return Object.keys(pages).map(section=>({section})); }

export default async function DraftTwoSection({params}:{params:Promise<{section:string}>}){
  const {section}=await params; const page=pages[section]; if(!page) notFound();
  return <main><section className="d2-page-hero"><div className="d2-wrap"><p className="d2-kicker">{page.eyebrow}</p><h1>{page.title}</h1><p>{page.intro}</p></div></section>
    <section className="d2-section d2-detail"><div className="d2-wrap d2-detail-grid">{page.blocks.map(block=><article key={block.title}><h2>{block.title}</h2><p>{block.copy}</p>{block.items&&<ul>{block.items.map(item=><li key={item}>{item}</li>)}</ul>}</article>)}</div></section>
    <section className="d2-cta"><div className="d2-wrap"><p className="d2-kicker">A useful next step</p><h2>{section==="contact"?"Let’s start with a recent sermon.":"See how this could work for your church."}</h2><a className="d2-primary" href="mailto:hello@sundaymultiplied.com">Email Brian</a>{section!=="contact"&&<a className="d2-secondary" href="/draft-2/contact">Start a conversation</a>}</div></section></main>;
}
