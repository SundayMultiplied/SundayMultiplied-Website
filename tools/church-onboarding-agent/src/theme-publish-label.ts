function syncThemePublishLabels() {
  if (new URLSearchParams(location.search).get("mode") !== "theme") return;
  const button = document.querySelector(".standalone-theme .theme-save button.primary") as HTMLButtonElement | null;
  if (button && /Theme Update PR/i.test(button.textContent || "")) {
    const churchName = document.querySelector(".theme-loader strong")?.textContent?.trim();
    button.textContent = churchName ? `Publish ${churchName} Theme` : "Publish Theme";
  }
  const link = document.querySelector(".standalone-theme .theme-save a.secondary") as HTMLAnchorElement | null;
  if (link && /pull request/i.test(link.textContent || "")) link.textContent = "View GitHub change";
}

const observer = new MutationObserver(syncThemePublishLabels);
observer.observe(document.getElementById("root") || document.body, { childList: true, subtree: true, characterData: true });
syncThemePublishLabels();

export {};
