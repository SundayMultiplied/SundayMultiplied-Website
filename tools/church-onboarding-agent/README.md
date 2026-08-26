# Sunday Multiplied Church Onboarding Agent

An internal, stateful Cloudflare Agent that walks a new church from identification to a reviewable GitHub pull request.

## What the MVP does

- Keeps one persistent onboarding record per church slug.
- Collects canonical church identity, location, timezone, and website.
- Inspects the homepage and up to four key ministry pages for sermon, streaming, podcast, and social URLs.
- Reads bounded, same-host stylesheets to recommend colors, fonts, corner radius, button treatment, and visual tone.
- Runs WCAG-oriented contrast checks and presents a live resource preview before brand approval.
- Requires a human to confirm inferred sources and brand decisions.
- Captures colors, font stacks, visual guidance, reviewer details, and enabled resources. Reviewer contact details remain in the Worker's private Agent state and are never written to the public repository.
- Generates a church manifest, streaming-source file, client CSS override, provenance notes, and resource directory.
- Stores the complete automated research record in `brand/analysis.json` for later review and regeneration.
- Opens a branch and pull request instead of writing directly to `main`.
- Configures the existing shared approval experience through `church.json`; it does not clone dashboard code.
- Synchronizes onboarding milestones to the existing Google Sheets CRM by church website or name.

## Lifecycle

`identified → researching → needs_confirmation → style_ready → approval_ready → repo_ready → active`

Activation happens after the generated pull request is reviewed, the actual logo variants are stored, and the church is connected to the approval database.

## Generated repository contract

```text
churches/{church-slug}/
├── church.json
├── brand/
│   └── source-notes.md
│   └── analysis.json
├── styles/
│   └── {church-slug}.css
├── sources/
│   └── streaming.json
└── resources/
    └── YYYY/
        └── YYYY-MM-DD/
            ├── sermon-analysis.md
            ├── monday.html
            ├── group.html
            ├── family.html
            └── metadata.json
```

The weekly `YYYY-MM-DD` folder is created by the resource-production workflow, using the date the sermon was preached. The onboarding agent creates the stable parent structure and configuration.

## Local setup

1. Run `npm install` in this directory.
2. Copy `.dev.vars.example` to `.dev.vars` and set `ENVIRONMENT=local`.
3. Run `npm run types`, then `npm run dev`.
4. Open the local Vite URL.

## Production setup

1. Create the R2 bucket declared in `wrangler.jsonc` (or change its name).
2. Protect the entire Worker with Cloudflare Access. The Worker rejects agent connections without the Access-authenticated email header.
3. Create a GitHub App with repository Contents and Pull Requests read/write permissions. Install it only on the target repository. For the MVP, provide a short-lived installation token as `GITHUB_TOKEN` using `wrangler secret put GITHUB_TOKEN`.
4. Replace the MVP token exchange with server-side GitHub App installation-token generation before normal production use.
5. In the existing "Sunday Multiplied CRM" spreadsheet, open **Extensions → Apps Script** and paste `google-apps-script/Code.gs`.
6. In Apps Script **Project Settings → Script properties**, add:
   - `SPREADSHEET_ID`: the CRM spreadsheet ID
   - `CRM_WEBHOOK_SECRET`: a new random secret shared only with Cloudflare and GitHub
7. Deploy the Apps Script as a Web app that executes as you and allows anyone to invoke it. The shared secret still protects writes.
8. Save the deployment URL and secret in the onboarding Worker as `CRM_WEBHOOK_URL` and `CRM_WEBHOOK_SECRET`.
9. Add the same two values as GitHub repository secrets so merged onboarding pull requests can mark the church Active.
10. Run `npm run deploy`.

Do not put GitHub credentials in `wrangler.jsonc`, `.dev.vars.example`, the browser, or a church manifest.

## Next implementation slice

- Add automatic SVG sanitization and thumbnail previews for uploaded logo variants.
- Add automated contrast checks and a real resource preview using the locked `sm-*` HTML schema.
- Write an activation record to the approval system's D1 database after the pull request is merged.
- Surface the last CRM synchronization result in the onboarding interface.
- Add a church index agent so staff can search, resume, and report on every onboarding.
- Send a Brevo welcome/check-in email only after a human explicitly activates the church.
