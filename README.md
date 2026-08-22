# Sunday Multiplied Website

Source for the private Sunday Multiplied website, including both review versions:

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
