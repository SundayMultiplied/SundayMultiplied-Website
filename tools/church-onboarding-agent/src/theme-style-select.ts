type StyleTheme = "contemporary" | "traditional" | "modern" | "editorial";

type Preset = {
  label: string;
  description: string;
  values: Record<string, string>;
};

const presets: Record<StyleTheme, Preset> = {
  contemporary: {
    label: "Contemporary",
    description: "Soft cards, brand-forward header, rounded geometry, approachable spacing.",
    values: {
      "Header style": "filled", "Logo position": "right", "Heading weight": "800", "Heading case": "uppercase",
      "Card treatment": "soft", "Corner radius": "12px", "Button style": "soft", "Resource width": "800px", "Page padding": "52px", "Section spacing": "30px",
      "Heading font": "'Avenir Next', 'Helvetica Neue', Arial, sans-serif", "Body font": "Arial, Helvetica, sans-serif",
    },
  },
  traditional: {
    label: "Traditional",
    description: "Serif typography, restrained rules, classical proportions, bordered sections.",
    values: {
      "Header style": "plain", "Logo position": "left", "Heading weight": "700", "Heading case": "none",
      "Card treatment": "bordered", "Corner radius": "2px", "Button style": "square", "Resource width": "760px", "Page padding": "54px", "Section spacing": "28px",
      "Heading font": "Georgia, 'Times New Roman', serif", "Body font": "'Palatino Linotype', Palatino, Georgia, serif",
    },
  },
  modern: {
    label: "Modern",
    description: "Asymmetric structure, square geometry, strong bars, flat sections, generous whitespace.",
    values: {
      "Header style": "split", "Logo position": "right", "Heading weight": "800", "Heading case": "uppercase",
      "Card treatment": "flat", "Corner radius": "0px", "Button style": "square", "Resource width": "840px", "Page padding": "56px", "Section spacing": "38px",
      "Heading font": "Inter, Arial, sans-serif", "Body font": "Inter, Arial, sans-serif",
    },
  },
  editorial: {
    label: "Editorial",
    description: "Oversized title, heavy rules, sharp boxes, magazine-like hierarchy and contrast.",
    values: {
      "Header style": "plain", "Logo position": "right", "Heading weight": "800", "Heading case": "none",
      "Card treatment": "bordered", "Corner radius": "0px", "Button style": "square", "Resource width": "820px", "Page padding": "50px", "Section spacing": "34px",
      "Heading font": "Inter, Arial, sans-serif", "Body font": "Georgia, 'Times New Roman', serif",
    },
  },
};

function setNativeValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  if (!(element instanceof HTMLSelectElement)) element.dispatchEvent(new Event("change", { bubbles: true }));
}

function findControl(labelText: string): HTMLInputElement | HTMLSelectElement | undefined {
  const labels = Array.from(document.querySelectorAll(".theme-controls label")) as HTMLLabelElement[];
  const label = labels.find((candidate) => candidate.querySelector(":scope > span")?.textContent?.trim() === labelText);
  if (!label) return undefined;
  if (labelText === "Heading font" || labelText === "Body font") return (label.querySelector("input") as HTMLInputElement | null) || undefined;
  return (label.querySelector("select") as HTMLSelectElement | null) || (label.querySelector("input") as HTMLInputElement | null) || undefined;
}

function applyPreset(theme: StyleTheme) {
  const preset = presets[theme];
  for (const [label, value] of Object.entries(preset.values)) {
    const control = findControl(label);
    if (control) setNativeValue(control, value);
  }
  requestAnimationFrame(() => installPreviewTreatment(theme));
  setTimeout(() => installPreviewTreatment(theme), 120);
}

function previewCss(theme: StyleTheme) {
  if (theme === "traditional") return `
header{border-top:1px solid currentColor!important;border-bottom-style:double!important;border-bottom-width:3px!important}.title{letter-spacing:-.015em!important}.big{background:transparent!important;border-left:0!important;border-top:1px solid currentColor!important;border-bottom:1px solid currentColor!important;border-radius:0!important;padding-left:0!important;padding-right:0!important}.snapshot,.questions,.practice,.tip{background:transparent!important}section>h2{padding-bottom:7px;border-bottom:1px solid #d7d7d7}`;
  if (theme === "modern") return `
header{border-bottom:0!important;border-left:10px solid currentColor!important;padding:28px 30px!important;border-radius:0!important}.title{line-height:.98!important;letter-spacing:-.04em!important}.big{background:transparent!important;border-left:0!important;border-top:6px solid currentColor!important;border-bottom:1px solid #d7d7d7!important;border-radius:0!important;padding-left:0!important}.questions{background:transparent!important;border:0!important;border-left:5px solid currentColor!important;border-radius:0!important}.scripture .text{border-left-width:8px!important}`;
  if (theme === "editorial") return `
header{border-top:7px solid currentColor!important;border-bottom-width:2px!important}.title{font-size:clamp(42px,7vw,70px)!important;line-height:.9!important;letter-spacing:-.055em!important;max-width:11ch}.meta{padding-top:12px;border-top:1px solid #d7d7d7}.big{border:2px solid currentColor!important;border-left-width:2px!important;border-radius:0!important;box-shadow:8px 8px 0 #ddd!important;background:transparent!important}.snapshot,.questions,.practice,.tip{border-width:2px!important;border-radius:0!important}.scripture .text{border-left:0!important;border-top:4px solid currentColor!important;padding-left:0!important;padding-right:0!important}`;
  return `.big,.snapshot,.questions,.practice,.tip{box-shadow:0 7px 20px rgba(0,0,0,.045)}header{box-shadow:0 10px 28px rgba(0,0,0,.05)}`;
}

function installPreviewTreatment(theme: StyleTheme) {
  const iframe = document.querySelector("iframe.resource-canvas") as HTMLIFrameElement | null;
  if (!iframe) return;
  const apply = () => {
    const doc = iframe.contentDocument;
    if (!doc?.head) return;
    doc.getElementById("sm-style-theme-preview")?.remove();
    const style = doc.createElement("style");
    style.id = "sm-style-theme-preview";
    style.textContent = previewCss(theme);
    doc.head.appendChild(style);
  };
  iframe.addEventListener("load", apply, { once: true });
  apply();
}

function inferTheme(): StyleTheme {
  const header = (findControl("Header style") as HTMLSelectElement | undefined)?.value;
  const card = (findControl("Card treatment") as HTMLSelectElement | undefined)?.value;
  const body = (findControl("Body font") as HTMLInputElement | undefined)?.value || "";
  const heading = (findControl("Heading font") as HTMLInputElement | undefined)?.value || "";
  if (header === "split" && card === "flat") return "modern";
  if (card === "bordered" && /palatino/i.test(body)) return "traditional";
  if (card === "bordered" && /inter/i.test(heading) && /(georgia|times)/i.test(body)) return "editorial";
  return "contemporary";
}

function installStyleSelector() {
  const controls = document.querySelector(".theme-controls") as HTMLElement | null;
  if (!controls || controls.querySelector("[data-style-theme-control]")) return;
  const group = document.createElement("section");
  group.className = "control-group";
  group.dataset.styleThemeControl = "true";
  group.innerHTML = `<h3>Style theme</h3><div class="control-grid"><label><span>Resource style</span><select aria-label="Resource style">${Object.entries(presets).map(([value, preset]) => `<option value="${value}">${preset.label}</option>`).join("")}</select><small data-style-description style="display:block;margin-top:8px;line-height:1.35;color:#68736e"></small></label></div>`;
  controls.insertBefore(group, controls.firstChild);
  const select = group.querySelector("select") as HTMLSelectElement;
  const description = group.querySelector("[data-style-description]") as HTMLElement;
  const sync = (theme: StyleTheme, apply = false) => {
    select.value = theme;
    description.textContent = presets[theme].description;
    if (apply) applyPreset(theme); else installPreviewTreatment(theme);
  };
  sync(inferTheme());
  select.addEventListener("change", () => sync(select.value as StyleTheme, true));
  window.addEventListener("popstate", () => setTimeout(() => sync(inferTheme()), 80));
  setTimeout(() => sync(inferTheme()), 300);
}

const observer = new MutationObserver(() => installStyleSelector());
observer.observe(document.getElementById("root") || document.body, { childList: true, subtree: true });
installStyleSelector();
