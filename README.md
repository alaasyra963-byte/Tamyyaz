# تميّز — Release download site

A tiny static site for distributing signed APK builds of the [Tamyyaz](https://github.com)
Android app directly (outside the Play Store): a public page listing every
release with the latest one front and center, and a password-protected
`/admin` page for publishing new ones. No server, no database, no paid
hosting — everything runs on GitHub's free tier:

- **Hosting** → GitHub Pages, serving this repo as-is.
- **File storage** → each APK is committed straight into the repo under
  `releases/`, via the same GitHub Contents API the admin panel uses for
  `releases.json` below, then served like any other static file by Pages
  itself. (GitHub Releases would be the more conventional place for this —
  it was the first design here — but its asset-upload endpoint
  (`uploads.github.com`) doesn't send CORS headers, so a browser can't
  upload to it directly; every attempt fails as an opaque network error.
  Committing the file is the CORS-friendly equivalent, since it stays on
  `api.github.com`.) Trade-off: every publish permanently grows the repo —
  fine for a personal project, but nothing prunes old APKs automatically.
- **The "database"** → [`releases.json`](releases.json) at the repo root, a
  small manifest the admin panel rewrites on every publish/delete. The
  public page just fetches that file — no backend, no rate limits.
- **Admin auth** → a GitHub Personal Access Token, entered once in the
  browser. No separate login system to build or maintain.

## Deploying to Firebase Hosting (primary target)

This site is served from **Firebase Hosting** on the same Firebase project as
the Tamyyaz Android app (`tamyyaz-3a83b`), because most of the app's audience
is in Syria and Firebase's infrastructure reaches them reliably, unlike many
third-party static-hosting services. `firebase.json` and `.firebaserc` at the
repo root already point at that project — see the top-level task summary /
chat history for the exact `firebase login` / `firebase deploy` commands, or
just run:

```bash
npm install -g firebase-tools   # once, if you don't have it
firebase login
firebase deploy --only hosting --project tamyyaz-3a83b
```

Firebase Hosting only serves whatever is in this repo at deploy time — it
does not watch GitHub for pushes. So after publishing a new release from
`/admin` (which commits a new APK + `releases.json` to this repo), re-run
`firebase deploy --only hosting` to make the live site reflect it.

The GitHub Pages workflow below (`.github/workflows/pages.yml`) still runs on
every push to `main` and can be kept as a secondary mirror, but Firebase
Hosting is the one meant for real users.

## One-time setup (GitHub Pages mirror, optional)

1. **Create a public GitHub repo** (public is required — Pages and unlimited
   Release storage are free only on public repos). Check "Add a README" when
   creating it so the repo isn't empty, then push this folder's contents to
   it (this folder is already a plain directory, not yet a git repo — see
   "Publishing" below).
2. **Enable GitHub Pages**: repo → Settings → Pages → Source: "Deploy from a
   branch" → Branch: `main`, folder `/ (root)` → Save. Your site goes live at:
   - `https://<you>.github.io/<repo>/` for a normal repo, or
   - `https://<you>.github.io/` if you name the repo exactly `<you>.github.io`
     (a GitHub "user site" — the closest thing to a clean free domain GitHub
     offers; it's still a `github.io` subdomain, not a real custom domain).
3. **Fill in [`admin/config.js`](admin/config.js)** with that repo's owner
   and name.
4. **Create your admin token**: [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new) →
   "Fine-grained token" → Repository access: **only this one repo** →
   Permissions → Contents: **Read and write** (this alone covers committing
   both the APK and `releases.json`). Nothing broader — a fine-grained token
   scoped to one repo is the whole point: if it ever leaks, the damage is
   contained to this repo, not your whole account.
5. Open `/admin`, paste the token in. It's stored only in your browser
   (localStorage if "remember" is checked, sessionStorage otherwise) and
   sent only to `api.github.com` directly from the browser — it never
   touches any third-party server. Treat it like a password: if you ever
   suspect it leaked, revoke it from the GitHub settings page above.

### Publishing this folder to GitHub

```bash
cd tamyyaz-site
git init
git add .
git commit -m "Initial release site"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

### Custom domain later (optional, not free)

GitHub Pages supports a real custom domain if you ever buy one: repo →
Settings → Pages → "Add a custom domain", then add the DNS records it shows
you at your registrar (an `A`/`ALIAS` record for an apex domain, or a
`CNAME` record for a subdomain). GitHub issues the SSL certificate
automatically once DNS resolves. This step needs a domain you actually own —
GitHub doesn't sell or register one for you, and neither can this assistant;
it's a purchase only you can make, from any registrar.

## Local preview

Plain static files — any local server works, e.g.:

```bash
npx serve .
```

Open `/admin` and try publishing against a real (ideally disposable/test)
repo you control — the admin → GitHub write path is built against GitHub's
documented REST API but wasn't exercised end-to-end while building this,
since that requires a real token and a real repo, both of which only you
should hold and create.

## How a release is structured

Each entry in `releases.json` looks like:

```json
{
  "version": "1.2.0",
  "notes": "What changed in this release",
  "fileName": "tamyyaz-1.2.0.apk",
  "sizeBytes": 24117248,
  "uploadedAt": "2026-09-20T18:04:00.000Z",
  "downloadUrl": "releases/1758392400000-tamyyaz-1.2.0.apk",
  "path": "releases/1758392400000-tamyyaz-1.2.0.apk",
  "blobSha": "a1b2c3d4e5f6..."
}
```

`downloadUrl` is a path relative to the site root, so it resolves correctly
whether the site lives at the domain root or under `/<repo>/`. The array is
kept newest-first (the admin panel prepends on publish), so "latest" always
means "most recently published," not the highest version number — publish
in order. Deleting a release removes the committed APK file (using
`blobSha`, refetched if missing) and its `releases.json` entry — the file
still exists in old git history/commits, same as any other git-tracked file
would, it's just no longer referenced by the manifest or in the current
tree.
