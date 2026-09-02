export {};

function currentSlug() {
  return new URLSearchParams(location.search).get("church") || "";
}

function refreshPreviewLogo(slug: string) {
  const cacheBust = Date.now();
  const iframe = document.querySelector("iframe.resource-canvas") as HTMLIFrameElement | null;
  const refresh = () => {
    const doc = iframe?.contentDocument;
    if (!doc) return;
    const images = Array.from(doc.querySelectorAll("img")) as HTMLImageElement[];
    for (const image of images) {
      if (image.src.includes(`/theme-assets/${slug}/logo`)) image.src = `/theme-assets/${slug}/logo?v=${cacheBust}`;
    }
  };
  iframe?.addEventListener("load", refresh, { once: true });
  refresh();
}

function installLogoReplaceControl() {
  if (new URLSearchParams(location.search).get("mode") !== "theme") return;
  const loader = document.querySelector(".theme-loader") as HTMLElement | null;
  if (!loader || loader.querySelector("[data-logo-replace]")) return;
  const slug = currentSlug();
  if (!slug) return;

  const wrapper = document.createElement("div");
  wrapper.dataset.logoReplace = "true";
  wrapper.style.cssText = "display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-left:auto";
  wrapper.innerHTML = `
    <input data-logo-file type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>
    <button data-logo-button type="button" class="secondary">Replace logo</button>
    <span data-logo-status style="font-size:.86rem;color:#68736e"></span>
  `;
  loader.appendChild(wrapper);

  const input = wrapper.querySelector("[data-logo-file]") as HTMLInputElement;
  const button = wrapper.querySelector("[data-logo-button]") as HTMLButtonElement;
  const status = wrapper.querySelector("[data-logo-status]") as HTMLElement;
  button.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
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
}

const logoObserver = new MutationObserver(() => installLogoReplaceControl());
logoObserver.observe(document.getElementById("root") || document.body, { childList: true, subtree: true });
window.addEventListener("popstate", installLogoReplaceControl);
installLogoReplaceControl();
