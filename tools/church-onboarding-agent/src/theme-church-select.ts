type ThemeChurch = { slug: string; name: string };

function setReactInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function installChurchSelect() {
  if (new URLSearchParams(location.search).get("mode") !== "theme") return;

  let churches: ThemeChurch[] = [];
  try {
    const response = await fetch("/theme-churches", { credentials: "same-origin" });
    if (!response.ok) return;
    const data = await response.json() as { churches?: ThemeChurch[] };
    churches = data.churches || [];
  } catch { return; }
  if (!churches.length) return;

  const enhance = () => {
    const loader = document.querySelector<HTMLElement>(".theme-loader");
    if (!loader) return;
    const input = loader.querySelector<HTMLInputElement>('input[type="text"]');
    if (!input || input.dataset.churchSelectSource === "true") return;
    const label = input.closest("label");
    if (!label || label.querySelector("select[data-theme-church-select]")) return;

    input.dataset.churchSelectSource = "true";
    input.style.display = "none";
    const caption = label.querySelector("span");
    if (caption) caption.textContent = "Church";

    const select = document.createElement("select");
    select.dataset.themeChurchSelect = "true";
    select.setAttribute("aria-label", "Church");
    select.innerHTML = '<option value="">Choose a church…</option>' + churches.map((church) => `<option value="${church.slug}">${church.name}</option>`).join("");
    select.value = input.value;
    select.addEventListener("change", () => {
      setReactInputValue(input, select.value);
      const selected = churches.find((church) => church.slug === select.value);
      select.title = selected ? selected.slug : "";
    });
    label.insertBefore(select, input);
  };

  enhance();
  new MutationObserver(enhance).observe(document.getElementById("root") || document.body, { childList: true, subtree: true });
}

void installChurchSelect();
