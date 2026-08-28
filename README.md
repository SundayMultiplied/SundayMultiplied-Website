# Sunday Multiplied Website

Source for the private Sunday Multiplied website, including three review versions:

- `/` — original cinematic draft
- `/draft-2` — traditional service-website draft
- `/draft-hybrid` — vision-led hybrid draft combining the strongest parts of both directions

## Edit locally on Windows

1. Install [Node.js 22 LTS](https://nodejs.org/) and [Visual Studio Code](https://code.visualstudio.com/).
2. Clone this repository with GitHub Desktop, then open the cloned folder in Visual Studio Code.
3. In Visual Studio Code, open **Terminal → New Terminal**.
4. Run `npm install` once.
5. Run `npm run dev` whenever you want to preview your changes.
6. Open the local address shown in the terminal (normally `http://localhost:5173`).

Press `Ctrl+C` in the terminal to stop the local preview.

## Where to make common changes

- Main draft pages: `app/`
- Draft 2 pages: `app/draft-2/`
- Shared styling: `app/globals.css`
- Navigation and footer: `components/site-header.tsx` and `components/site-footer.tsx`
- Interactive elements: `components/`
- Images and icons: `public/`

## Safe editing workflow

1. In GitHub Desktop, choose **Fetch origin**, then **Pull origin** if offered.
2. Make and preview your changes in Visual Studio Code.
3. In GitHub Desktop, review the changed files.
4. Enter a short summary, choose **Commit to main**, and then **Push origin**.

The repository is the editable master copy. The hosted ChatGPT Sites version remains private and is not automatically changed merely by editing or pushing this repository.

## Build check

Run `npm run build` before a major handoff or deployment. The site uses React, Next-compatible routing, Vinext, and Cloudflare Workers.

## Approval MVP

The approval workflow now lives in this repository alongside the marketing site:

- `/approvals` — authenticated Sunday Multiplied package dashboard
- `/review/[secure-token]` — no-login church reviewer experience
- `/api/approvals` — authenticated package creation and status list
- `/api/reviews/[secure-token]` — package viewing and approval decisions

Cloudflare D1 stores packages, resources, feedback, and activity. R2 can serve private HTML/PDF files through the secure review endpoint. Review tokens are generated with Web Crypto and only their SHA-256 hashes are stored.

### Required Cloudflare configuration

1. Provision the `DB` D1 binding and `BUCKET` R2 binding. Both binding names are declared in `.openai/hosting.json`.
2. Apply the SQL migrations in `drizzle/` to the production D1 database.
3. Configure `APPROVAL_ADMIN_EMAIL` as the email allowed to use `/approvals`.
4. Configure `APPROVAL_NOTIFICATION_EMAIL` for approval and revision-decision notifications.
5. Configure `APPROVAL_REVIEWER_EMAIL` for new-package review notifications. It defaults to `brian@sundaymultiplied.com`.
6. Add `BREVO_API_KEY` as a secret. Never commit it to this repository.

Package creation accepts an optional `reviewerEmail`. When present, it overrides the default for that package. A review-ready email is sent only after the package and all selected resource records have been written and verified.

Admin authorization accepts Cloudflare Access's verified `Cf-Access-Authenticated-User-Email` header (and retains the legacy hosting header as a compatibility fallback). Protect `/approvals*` and `/api/approvals*` with hostname-level Cloudflare Access policies; do not apply Access to the entire Worker because the marketing site and tokenized church review links must remain public.
