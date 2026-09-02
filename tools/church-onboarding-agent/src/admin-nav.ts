const ADMIN_ORIGIN = "https://admin.sundaymultiplied.com";

function installAdminNav() {
  if (document.querySelector("[data-admin-global-nav]")) return;
  const nav = document.createElement("div");
  nav.dataset.adminGlobalNav = "true";
  nav.innerHTML = `
    <div class="sm-admin-nav__inner">
      <a class="sm-admin-nav__brand" href="${ADMIN_ORIGIN}/admin">Sunday Multiplied Admin</a>
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
    [data-admin-global-nav]{position:sticky;top:0;z-index:1000;background:#14211d;color:#fff;border-bottom:1px solid rgba(255,255,255,.14);font-family:Arial,Helvetica,sans-serif}
    .sm-admin-nav__inner{max-width:1500px;margin:0 auto;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;gap:24px}
    .sm-admin-nav__brand{color:#fff;text-decoration:none;font-weight:800;white-space:nowrap}
    [data-admin-global-nav] nav{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    [data-admin-global-nav] nav a{color:#dce5e1;text-decoration:none;font-size:13px;font-weight:700;padding:8px 10px;border-radius:6px}
    [data-admin-global-nav] nav a:hover,[data-admin-global-nav] nav a:focus{background:rgba(255,255,255,.1);color:#fff}
    [data-admin-global-nav] nav a.active{background:#fff;color:#14211d}
    @media(max-width:850px){.sm-admin-nav__inner{align-items:flex-start;flex-direction:column;gap:6px;padding:10px 16px}[data-admin-global-nav] nav{gap:2px}[data-admin-global-nav] nav a{padding:6px 8px}}
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
