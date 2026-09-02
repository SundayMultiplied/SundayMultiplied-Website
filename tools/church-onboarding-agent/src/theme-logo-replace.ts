export {};

function currentSlug() {
  return new URLSearchParams(location.search).get("church") || "";
}

function absoluteLogoUrl(slug: string, cacheBust = Date.now()) {
  return new URL(`/theme-assets/${encodeURIComponent(slug)}/logo?v=${cacheBust}`, location.origin).toString();
}

function refreshPreviewLogo(slug: string) {
  const iframe = document.querySelector("iframe.resource-canvas") as HTMLIFrameElement | null;
  const refresh = () => {
    const doc = iframe?.contentDocument;
    if (!doc) return;
    const images = Array.from(doc.querySelectorAll("img.logo, img")) as HTMLImageElement[];
    for (const image of images) {
      if (image.classList.contains("logo") || image.src.includes("/theme-assets/") || image.alt.toLowerCase().includes("logo")) {
        image.style.display = "";
        image.src = absoluteLogoUrl(slug);
      }
    }
  };
  iframe?.addEventListener("load", refresh, { once: true });
  refresh();
}

function headerLogoGrid() {
  const groups = Array.from(document.querySelectorAll(".theme-controls .control-group")) as HTMLElement[];
  const headerGroup = groups.find((group) => group.querySelector("h3")?.textContent?.trim().toLowerCase() === "header & logo");
  return headerGroup?.querySelector(".control-grid") as HTMLElement | null;
}

function installLogoReplaceControl() {
  if (new URLSearchParams(location.search).get("mode") !== "theme") return;
  const grid = headerLogoGrid();
  if (!grid) return;

  const existing = document.querySelector("[data-logo-replace]") as HTMLElement | null;
  if (existing) {
    if (existing.parentElement !== grid) grid.appendChild(existing);
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.dataset.logoReplace = "true";
  wrapper.style.cssText = "grid-column:1 / -1;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding-top:2px";
  wrapper.innerHTML = `
    <input data-logo-file type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>
    <button data-logo-button type="button" class="secondary">Replace logo</button>
    <span data-logo-status style="font-size:.86rem;color:#68736e"></span>
  `;
  grid.appendChild(wrapper);

  const input = wrapper.querySelector("[data-logo-file]") as HTMLInputElement;
  const button = wrapper.querySelector("[data-logo-button]") as HTMLButtonElement;
  const status = wrapper.querySelector("[data-logo-status]") as HTMLElement;
  button.addEventListener("click", () => {
    if (!currentSlug()) {
      status.textContent = "Load a church first.";
      return;
    }
    input.click();
  });
  input.addEventListener("change", async () => {
    const slug = currentSlug();
    const file = input.files?.[0];
    if (!file || !slug) return;
    if (file.size > 5_000_000) { status.textContent = "Logo must be smaller than 5 MB."; input.value = ""; return; }
    button.disabled = true;
    status.textContent = "Uploading…";
    try {
      const response = await fetch(`/theme-assets/${encodeURIComponent(slug)}/logo`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": file.type, "x-file-name": file.name },
        body: file,
      });
      if (!response.ok) throw new Error((await response.text()) || "Unable to replace logo.");
      status.textContent = "Logo replaced";
      refreshPreviewLogo(slug);
      setTimeout(() => { status.textContent = ""; }, 3000);
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Unable to replace logo.";
    } finally {
      button.disabled = false;
      input.value = "";
    }
  });

  const slug = currentSlug();
  if (slug) setTimeout(() => refreshPreviewLogo(slug), 120);
}

const logoObserver = new MutationObserver(() => installLogoReplaceControl());
logoObserver.observe(document.getElementById("root") || document.body, { childList: true, subtree: true });
window.addEventListener("popstate", () => { installLogoReplaceControl(); const slug = currentSlug(); if (slug) refreshPreviewLogo(slug); });
installLogoReplaceControl();
