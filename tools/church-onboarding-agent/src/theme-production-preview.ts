import { buildThemeCss } from "./services/repo-files";
import { normalizeBrandProfile, type BrandProfile } from "./types";

const BASE_CSS_URL = "https://www.sundaymultiplied.com/resources/_shared/sunday-multiplied-base.css";

function controlValue(labelText: string): string | undefined {
  const labels = Array.from(document.querySelectorAll(".theme-controls label")) as HTMLLabelElement[];
  const label = labels.find((item) => item.querySelector(":scope > span")?.textContent?.trim() === labelText);
  if (!label) return undefined;
  const inputs = Array.from(label.querySelectorAll("input")) as HTMLInputElement[];
  const textInput = inputs.find((input) => input.type !== "color");
  if (textInput) return textInput.value;
  const select = label.querySelector("select") as HTMLSelectElement | null;
  if (select) return select.value;
  return inputs[0]?.value;
}

function currentBrand(): BrandProfile {
  const b = normalizeBrandProfile();
  return {
    ...b,
    styleTheme: (controlValue("Resource style") as BrandProfile["styleTheme"]) || b.styleTheme,
    primaryColor: controlValue("Primary") || b.primaryColor,
    secondaryColor: controlValue("Secondary") || b.secondaryColor,
    accentColor: controlValue("Accent") || b.accentColor,
    backgroundColor: controlValue("Page background") || b.backgroundColor,
    textColor: controlValue("Body text") || b.textColor,
    mutedColor: controlValue("Muted text") || b.mutedColor,
    borderColor: controlValue("Borders") || b.borderColor,
    headerBackgroundColor: controlValue("Header background") || b.headerBackgroundColor,
    headerTextColor: controlValue("Header text") || b.headerTextColor,
    headerStyle: (controlValue("Header style") as BrandProfile["headerStyle"]) || b.headerStyle,
    logoPosition: (controlValue("Logo position") as BrandProfile["logoPosition"]) || b.logoPosition,
    logoSize: (controlValue("Logo size") as BrandProfile["logoSize"]) || b.logoSize,
    headingFont: controlValue("Heading font") || b.headingFont,
    bodyFont: controlValue("Body font") || b.bodyFont,
    headingWeight: (controlValue("Heading weight") as BrandProfile["headingWeight"]) || b.headingWeight,
    headingTransform: (controlValue("Heading case") as BrandProfile["headingTransform"]) || b.headingTransform,
    sectionBackgroundColor: controlValue("Section background") || b.sectionBackgroundColor,
    sectionTextColor: controlValue("Section text") || b.sectionTextColor,
    calloutBackgroundColor: controlValue("Callout background") || b.calloutBackgroundColor,
    calloutTextColor: controlValue("Callout text") || b.calloutTextColor,
    cardStyle: (controlValue("Card treatment") as BrandProfile["cardStyle"]) || b.cardStyle,
    cornerRadius: controlValue("Corner radius") || b.cornerRadius,
    buttonStyle: (controlValue("Button style") as BrandProfile["buttonStyle"]) || b.buttonStyle,
    scriptureBackgroundColor: controlValue("Scripture background") || b.scriptureBackgroundColor,
    scriptureTextColor: controlValue("Scripture text") || b.scriptureTextColor,
    questionBackgroundColor: controlValue("Questions background") || b.questionBackgroundColor,
    questionTextColor: controlValue("Questions text") || b.questionTextColor,
    prayerBackgroundColor: controlValue("Prayer background") || b.prayerBackgroundColor,
    prayerTextColor: controlValue("Prayer text") || b.prayerTextColor,
    pageWidth: controlValue("Resource width") || b.pageWidth,
    pagePadding: controlValue("Page padding") || b.pagePadding,
    sectionSpacing: controlValue("Section spacing") || b.sectionSpacing,
  };
}

function currentChurchName() {
  const loaderName = document.querySelector(".theme-loader strong")?.textContent?.trim();
  if (loaderName) return loaderName;
  const churchField = Array.from(document.querySelectorAll("label")).find((label) => label.querySelector(":scope > span")?.textContent?.trim() === "Church name");
  return (churchField?.querySelector("input") as HTMLInputElement | null)?.value?.trim() || "Church Name";
}

function currentLogoUrl() {
  const params = new URLSearchParams(location.search);
  const slug = params.get("church") || "";
  if (!slug || slug.startsWith("draft-")) return "";
  return new URL(`/theme-assets/${encodeURIComponent(slug)}/logo`, location.origin).toString();
}

function esc(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}

function productionDocument() {
  const churchName = currentChurchName();
  const brand = currentBrand();
  const logoUrl = currentLogoUrl();
  const logo = logoUrl
    ? `<img class="sm-church-logo sm-logo" src="${esc(logoUrl)}?v=${Date.now()}" onerror="this.style.display='none'" alt="${esc(churchName)} logo">`
    : "";
  const churchCss = buildThemeCss(churchName, brand);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${BASE_CSS_URL}">
<style>${churchCss}</style>
</head>
<body class="sm-resource sm-group">
<main class="sm-document sm-document--group">
<header class="sm-header sm-header--with-logo">
  <div class="sm-header-content">
    <div class="sm-header-text">
      <p class="sm-eyebrow sm-resource-label">Group Multiplied</p>
      <h1 class="sm-title">A Sample Sermon Resource</h1>
      <p class="sm-meta">${esc(churchName)} · Genesis 2:1–3 · This Week</p>
    </div>
    <div class="sm-header-logo-wrap">${logo}</div>
  </div>
</header>
<section class="sm-section sm-section--big-idea"><h2>Big Idea</h2><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer vitae sem at sapien luctus viverra. This block demonstrates the primary callout treatment.</p></section>
<section class="sm-section sm-section--tension"><h2>The Tension</h2><p>Praesent commodo cursus magna, vel scelerisque nisl consectetur. We often keep moving because stopping can expose what we are trusting.</p></section>
<section class="sm-section sm-section--scripture"><h2>Read the Scripture</h2><p class="sm-scripture-reference">Genesis 2:1–3 · Berean Standard Bible</p><div class="sm-scripture-text"><p class="sm-scripture-paragraph"><sup class="sm-verse-number">1</sup>Lorem ipsum dolor sit amet, consectetur adipiscing elit. <sup class="sm-verse-number">2</sup>Sed posuere consectetur est at lobortis. <sup class="sm-verse-number">3</sup>Donec ullamcorper nulla non metus auctor fringilla.</p></div></section>
<section class="sm-section sm-section--summary sm-resource__card"><h2>Sermon Snapshot</h2><p>Morbi leo risus, porta ac consectetur ac, vestibulum at eros. Donec id elit non mi porta gravida at eget metus.</p></section>
<section class="sm-section sm-section--questions"><h2>Discussion Questions</h2><div class="sm-question-group"><h3>Understand</h3><ol><li>What stood out most clearly in the sermon’s explanation of this passage?</li><li>How did the pastor connect the passage to the larger story of Scripture?</li></ol></div><div class="sm-question-group"><h3>Reflect</h3><ol><li>Where do you see this tension showing up in your own week?</li><li>What makes this truth difficult to trust in practice?</li></ol></div></section>
<section class="sm-section sm-section--practice sm-resource__practice"><h2>Practice This Week</h2><p>Choose one concrete rhythm that helps you remember what God has done rather than measuring your life only by what you produce.</p><a class="sm-resource__button" href="#">Sample Action Button</a></section>
<section class="sm-section sm-section--leader-tip"><h2>Leader Tip</h2><p>Keep the conversation rooted in the sermon. Give the group room to apply the truth without rushing to solve every problem.</p></section>
<section class="sm-section sm-section--prayer"><h2>Closing Prayer</h2><p>Father, help us remember who you are, trust what you have done, and carry your truth into the ordinary places of this week. Amen.</p></section>
<footer class="sm-footer"><p>Sunday Multiplied</p></footer>
</main>
</body>
</html>`;
}

let queued = 0;
function renderProductionPreview() {
  window.clearTimeout(queued);
  queued = window.setTimeout(() => {
    const iframe = document.querySelector("iframe.resource-canvas") as HTMLIFrameElement | null;
    if (!iframe || !document.querySelector(".theme-controls")) return;
    const next = productionDocument();
    if (iframe.srcdoc !== next) iframe.srcdoc = next;
  }, 20);
}

document.addEventListener("input", (event) => {
  if ((event.target as Element | null)?.closest?.(".theme-controls")) renderProductionPreview();
});
document.addEventListener("change", (event) => {
  if ((event.target as Element | null)?.closest?.(".theme-controls")) renderProductionPreview();
});
const previewObserver = new MutationObserver(renderProductionPreview);
previewObserver.observe(document.getElementById("root") || document.body, { childList: true, subtree: true });
window.addEventListener("popstate", renderProductionPreview);
renderProductionPreview();
