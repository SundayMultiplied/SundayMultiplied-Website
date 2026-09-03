const ADMIN_ORIGIN = "https://admin.sundaymultiplied.com";

function installAdminNav() {
  if (document.querySelector("[data-admin-global-nav]")) return;
  const nav = document.createElement("div");
  nav.dataset.adminGlobalNav = "true";
  nav.innerHTML = `
    <div class="sm-admin-nav__inner">
      <nav aria-label="Admin navigation">
        <a href="${ADMIN_ORIGIN}/admin">Dashboard</a>
        <a href="${ADMIN_ORIGIN}/production">Production</a>
        <a href="${ADMIN_ORIGIN}/approvals">Approvals</a>
        <a href="${ADMIN_ORIGIN}/revisions">Revisions</a>
        <a class="active" href="/">Onboarding</a>
        <a href="/?mode=theme">Theme Editor</a>
      </nav>
    </div>`;
  const style = document.createElement("style");
  style.textContent = `
    [data-admin-global-nav]{position:sticky;top:0;z-index:1000;background:#14211d;font-family:Arial,Helvetica,sans-serif}
    .sm-admin-nav__inner{max-width:1500px;margin:0 auto;padding:8px 18px 16px;display:flex;justify-content:center}
    [data-admin-global-nav] nav{display:flex;align-items:center;justify-content:center;gap:2px;max-width:100%;overflow:hidden;border-radius:18px;background:#d7dfdc}
    [data-admin-global-nav] nav a{display:block;color:#173028;text-decoration:none;font-size:13px;font-weight:800;line-height:1;padding:13px 18px;border-radius:12px}
    [data-admin-global-nav] nav a:hover,[data-admin-global-nav] nav a:focus{background:#c7d2ce;color:#0f1f19}
    [data-admin-global-nav] nav a.active{background:#fff;color:#0f1f19;box-shadow:0 1px 0 rgba(23,48,40,.08)}
    @media(max-width:850px){.sm-admin-nav__inner{padding:7px 10px 12px;overflow-x:auto;justify-content:flex-start}[data-admin-global-nav] nav{width:max-content;flex-wrap:nowrap}[data-admin-global-nav] nav a{padding:11px 13px;white-space:nowrap}}
  `;
  document.head.appendChild(style);
  document.body.insertBefore(nav, document.body.firstChild);
  if (new URLSearchParams(location.search).get("mode") === "theme") {
    const links = nav.querySelectorAll("nav a");
    links.forEach((link) => link.classList.remove("active"));
    (links[links.length - 1] as HTMLElement)?.classList.add("active");
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installAdminNav);
else installAdminNav();
