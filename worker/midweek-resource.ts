export type MidweekDeliveryDay = "wednesday" | "thursday";
export type MidweekDeliveryChannel = "sms" | "email" | "push" | "manual";

export type MidweekDeliveryPreferences = {
  day: MidweekDeliveryDay;
  channel: MidweekDeliveryChannel;
};

export const DEFAULT_MIDWEEK_DELIVERY_PREFERENCES: MidweekDeliveryPreferences = {
  day: "wednesday",
  channel: "email",
};

export function resolveMidweekDeliveryPreferences(
  churchDefault?: Partial<MidweekDeliveryPreferences>,
  requestedDay?: string,
  requestedChannel?: string,
): MidweekDeliveryPreferences {
  const fallback = { ...DEFAULT_MIDWEEK_DELIVERY_PREFERENCES, ...churchDefault };
  const days: MidweekDeliveryDay[] = ["wednesday", "thursday"];
  const channels: MidweekDeliveryChannel[] = ["sms", "email", "push", "manual"];
  return {
    day: days.includes(requestedDay as MidweekDeliveryDay) ? requestedDay as MidweekDeliveryDay : fallback.day,
    channel: channels.includes(requestedChannel as MidweekDeliveryChannel) ? requestedChannel as MidweekDeliveryChannel : fallback.channel,
  };
}

export function validateMidweekV3Html(html: string) {
  const requiredSections = ["summary", "scripture", "reflection", "practice", "prayer"];
  let previousIndex = -1;
  for (const section of requiredSections) {
    const matches = html.match(new RegExp(`sm-section--${section}\\b`, "gi")) || [];
    if (matches.length !== 1) throw new Error(`Midweek V3 must include exactly one ${section} section.`);
    const sectionIndex = html.search(new RegExp(`sm-section--${section}\\b`, "i"));
    if (sectionIndex <= previousIndex) throw new Error("Midweek V3 sections must follow the required one-minute reading order.");
    previousIndex = sectionIndex;
  }
  const questions = html.match(/class=["'][^"']*sm-midweek-question\b[^"']*["']/gi) || [];
  if (questions.length !== 1) throw new Error("Midweek V3 must include exactly one central reflection question.");
  const words = html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  if (words > 220) throw new Error("Midweek V3 is too long for a one-minute reinforcement resource.");
}
