type ChurchOption = { slug: string; name: string };

const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function getChurches(): Promise<ChurchOption[]> {
  const response = await fetch("/theme-churches", { credentials: "same-origin" });
  if (!response.ok) return [];
  const data = await response.json() as { churches?: ChurchOption[] };
  return data.churches || [];
}

function fieldByLabel(labelText: string): HTMLInputElement | null {
  const labels = Array.from(document.querySelectorAll("label")) as HTMLLabelElement[];
  const label = labels.find((item) => item.querySelector(":scope > span")?.textContent?.trim() === labelText);
  return (label?.querySelector("input") as HTMLInputElement | null) || null;
}

function installActivationNotice() {
  const link = Array.from(document.querySelectorAll("a")).find((item) => item.textContent?.trim() === "Open pull request") as HTMLAnchorElement | undefined;
  if (!link || document.querySelector("[data-onboarding-activation-notice]")) return;
  const notice = document.createElement("div");
  notice.dataset.onboardingActivationNotice = "true";
  notice.style.cssText = "margin:18px 0;padding:16px 18px;border:1px solid #d7dfdb;border-left:5px solid #c69a4b;border-radius:8px;background:#fffaf0;line-height:1.45";
  notice.innerHTML = `<strong style="display:block;margin-bottom:4px">Onboarding saved — awaiting activation</strong><span>This church will not appear in Production or the standalone Theme Editor as an active church until its onboarding pull request is merged.</span>`;
  link.parentElement?.insertBefore(notice, link);
}

let cached: ChurchOption[] | null = null;
async function installDuplicateGuard() {
  if (new URLSearchParams(location.search).get("mode") === "theme") return;
  const nameInput = fieldByLabel("Church name");
  const slugInput = fieldByLabel("Church slug");
  if (!nameInput || !slugInput) { installActivationNotice(); return; }
  if (!cached) cached = await getChurches();
  const host = nameInput.closest(".card");
  if (!host) return;

  let warning = host.querySelector("[data-existing-church-warning]") as HTMLElement | null;
  const refresh = () => {
    const match = cached!.find((church) => normalizeName(church.name) === normalizeName(nameInput.value) && church.slug !== slugInput.value);
    if (!match) { warning?.remove(); warning = null; return; }
    if (!warning) {
      warning = document.createElement("div");
      warning.dataset.existingChurchWarning = "true";
      warning.style.cssText = "margin:16px 0;padding:16px 18px;border:1px solid #f0cf83;border-left:5px solid #c69a4b;border-radius:8px;background:#fffaf0;line-height:1.45";
      const grid = nameInput.closest(".grid");
      grid?.parentElement?.insertBefore(warning, grid);
    }
    warning.innerHTML = `<strong style="display:block;margin-bottom:4px">This church already exists.</strong><span>${match.name} is already active under the canonical slug <code>${match.slug}</code>. Starting a second onboarding would create a duplicate church identity.</span><div style="margin-top:12px"><a href="/?mode=theme&church=${encodeURIComponent(match.slug)}" style="display:inline-block;padding:9px 12px;border-radius:6px;background:#14211d;color:white;text-decoration:none;font-weight:700">Update existing church</a></div>`;
  };
  nameInput.addEventListener("input", refresh);
  slugInput.addEventListener("input", refresh);
  refresh();
  installActivationNotice();
}

const observer = new MutationObserver(() => { void installDuplicateGuard(); installActivationNotice(); });
observer.observe(document.getElementById("root") || document.body, { childList: true, subtree: true });
void installDuplicateGuard();
