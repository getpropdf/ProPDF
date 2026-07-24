# Publishing ProPDF on GitHub Pages (free, always-latest)

This guide puts ProPDF online at a permanent free link (e.g.
`https://yourname.github.io/propdf/`). You share **the link** instead of the file.
When you publish a change, everyone gets it automatically the next time they open
the link — and the app shows them an **"Update available"** notice.

> **Privacy is preserved.** Only the app's *code* is served from GitHub. Your users'
> **documents are still processed entirely in their browser and never uploaded** —
> exactly as before.

---

## What you upload

**Upload the entire ProPDF folder.** That is the simplest, safest rule and it is
what the rest of this guide assumes. The important pieces are:

- **`ProPDF.html`** — the app (required)
- **`assets/`** — required since v12.0 (contains the smart converter `xtract.js`)
- **`index.html`** — redirect so the clean root URL works (recommended)
- **`version.json`** — drives the "update available" notice (required)
- **`lib/`** — lets the app work even if the CDN is blocked (recommended)
- **`CHANGELOG.md`**, **`README.md`**, **`docs/`** — nice to have

The `engine/` folder is an *optional* offline Power Pack for offices; harmless
to upload, ignored by the website. Web visitors never see or need it —
every tool card shown on the website works right in the browser.

---

## Part A — One-time setup (about 10 minutes)

### 1. Create a free GitHub account
Go to <https://github.com> → **Sign up**. No credit card. Verify your email.

### 2. Create a repository
- Click the **+** (top-right) → **New repository**.
- **Repository name:** `propdf` (your link becomes `https://<username>.github.io/propdf/`).
  *(Tip: if you name it `<username>.github.io`, the link is just
  `https://<username>.github.io/` with no `/propdf`.)*
- Set it to **Public** (required for free Pages).
- Tick **Add a README file**.
- Click **Create repository**.

### 3. Upload the ProPDF files
- On the repo page click **Add file → Upload files**.
- Open your ProPDF folder on your computer, press **Ctrl+A** (select everything),
  and **drag the whole selection** into the upload box. Folders like `assets/`
  and `lib/` upload with their contents automatically.
- Scroll down, write a message like "ProPDF v12.0", click **Commit changes**.
  (Upload can take a couple of minutes — `lib/` and `engine/` are the big parts.
  If the upload is too slow, `engine/` and `docs/` are safe to skip.)

### 4. Turn on GitHub Pages
- Go to the repo's **Settings** tab → **Pages** (left menu).
- Under **Build and deployment → Source**, choose **Deploy from a branch**.
- **Branch:** `main`, **Folder:** `/ (root)` → **Save**.
- Wait ~1 minute. The page will show your live URL:
  **`https://<username>.github.io/propdf/`** (the `index.html` redirect opens `ProPDF.html` automatically; the direct link is `https://<username>.github.io/propdf/ProPDF.html`)

### 5. Share the link
That URL is permanent and free. Bookmark it; email it; put it on your letterhead.
Anyone who opens it gets the latest ProPDF, processed locally in their browser.

---

## Part B — Publishing an update (about 2 minutes)

Whenever you have a new `index.html` (a new version):

1. In the repo, click **`ProPDF.html`** → the **pencil (Edit)** icon → delete all,
   paste the new content → **Commit changes**.
   *(Or use **Add file → Upload files** and drop the new `ProPDF.html` to overwrite. You do not need to touch `index.html` — it just redirects.)*
2. Edit **`version.json`** and bump it, e.g.:
   ```json
   { "version": "v10", "notes": "Added Excel password protection" }
   ```
   Commit.
3. Update **`CHANGELOG.md`** with the new version's bullet points. Commit.

Within ~1 minute the site is updated. Anyone with the page already open will see a
**"✨ ProPDF v10 is available — Reload to update"** bar; new visitors get it
straight away.

> The in-app version badge (next to the ProPDF logo) shows what each user is running,
> and the **Changelog** tab inside the app lists what's new.

---

## Part C — Showing the changelog on GitHub

GitHub automatically renders `CHANGELOG.md` when someone opens it in the repo, so
your link `https://github.com/<username>/propdf/blob/main/CHANGELOG.md` is a tidy,
public "what's new" page. Two nice extras:

- **Link it from the README** so it's easy to find (already done in `README.md`).
- **Create a Release per version** (optional, looks professional): repo → **Releases**
  → **Draft a new release** → Tag `v10`, Title "ProPDF v10", paste the changelog
  bullets → **Publish release**. Users can then browse versions at
  `https://github.com/<username>/propdf/releases`.

---

## Optional — your own domain
In **Settings → Pages → Custom domain** you can point e.g.
`tools.kotharijain.com` at the site (free; you just add a CNAME record at your
domain registrar). HTTPS is issued automatically.

---

## Troubleshooting
| Issue | Fix |
|-------|-----|
| Link shows 404 for a minute | Pages is still building — wait ~1 min and refresh. |
| Update bar doesn't appear | Make sure you bumped the number in `version.json` (v9 → v10) and committed it. |
| Users see an old version | They have it cached — the update bar's **Reload** button forces a fresh copy; or they can press Ctrl+Shift+R. |
| OCR/preview needs internet | First use downloads the libraries from a CDN, then caches them — same as before. |

---
Prepared by **Kothari Jain & Associates** — info.kotharijain@gmail.com
