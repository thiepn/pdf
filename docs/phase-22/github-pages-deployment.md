# GitHub Pages Deployment

## First-time setup

1. Upload/commit this source tree to the repository.
2. Open **Actions → Bootstrap dependency lock → Run workflow**.
3. Merge the generated `phase22-dependency-lock` pull request after CI succeeds.
4. Open **Settings → Pages** and choose **GitHub Actions** as the publishing source.
5. Push/merge to `main`. The **Deploy Local PDF Studio to GitHub Pages** workflow builds and publishes `dist`.

The normal project-site base is resolved as `/<repository>/`.

## Custom domain or username root site

When the final site is served from the hostname root rather than `/<repository>/`, add the repository Actions variable:

```text
PAGES_BASE_PATH=/
```

Do this before the production build/deployment.

## Why the lockfile step is mandatory

Phase 22 deliberately refuses to deploy a floating dependency graph. `package.json` pins direct dependencies exactly, while `package-lock.json` fixes the complete transitive graph used by CI and production builds.

## Deployment verification

The deploy workflow checks the live Pages URL for:

- application shell;
- `manifest.webmanifest`;
- `sw.js` with the current release version;
- `release-integrity.json`;
- 192 px and 512 px install icons.

The browser CI matrix separately runs the app under the same configured Pages base path.

## Privacy note for `username.github.io/repository/`

GitHub Pages repository paths are not separate browser origins. If other applications are hosted on the same `username.github.io` hostname, browser storage APIs are shared at the origin level. Phase 22 scopes Local PDF Studio's cache/service-worker maintenance to avoid accidental interference, but a dedicated custom hostname is the stronger isolation option for sensitive local projects.
