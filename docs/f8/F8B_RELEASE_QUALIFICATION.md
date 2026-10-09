# F8B — Production activation, SSO and real-account qualification

## Shipped source-code changes

- Native planning now uses THIEPN Account's **registered first-party OAuth 2.1 public client** at `/auth/v1/oauth/authorize`; it does not send users directly to Google or use Supabase's unrelated `/auth/v1/token?grant_type=pkce` path.
- Callback uses one-use PKCE S256 verifier and state, a 10-minute freshness check, exact approved redirect URI, one-time URL cleanup, and token exchange at `/auth/v1/oauth/token`.
- App-local token store is named after the public client ID. Refresh is single-flight; transient outages do not erase a valid session, and local disconnect suppresses automatic reconnect.
- Account's `/sso/probe` iframe returns only signed-in and eligibility booleans. Messages are accepted only from the exact Account origin, matching iframe window and PDF client ID, with a finite timeout. A deliberately disconnected app remains disconnected until explicit reconnect.
- Core verifies the bearer token with Account and then checks that its verified Account UUID plus JWT `client_id` matches the configured PDF public-client UUID. Other first-party app tokens cannot consume PDF Luna quota.
- Manual ChatGPT planning remains available if the native Core service is unavailable or unconfigured; F7 review and F6 destructive approval remain mandatory.
- Source map dependency floor raised to `source-map-js >= 1.2.2` to close a known high-severity advisory in the previously pinned release line.

## Required build-time (public) configuration

The following are **nonsecret** PDF Studio Vite build variables:

```text
VITE_PDF_CORE_URL=<exact THIEPN Core HTTPS origin>/
VITE_PDF_ACCOUNT_SUPABASE_URL=https://hycegznamzjhwinegaai.supabase.co/
VITE_PDF_ACCOUNT_PUBLIC_KEY=<public/publishable key only>
VITE_PDF_ACCOUNT_CLIENT_ID=<real issued PDF public-client UUID>
VITE_PDF_ACCOUNT_REDIRECT_URI=https://thiepn.dev/pdf/
```

The callback must be loaded as PDF Studio's existing root page (not a nonexistent nested Github Pages callback). Core's allowed browser CORS origins must include `https://thiepn.dev`. The build's restrictive CSP adds exactly the configured Core/Auth origins for connections and `https://account.thiepn.dev` for the SSO probe iframe—never a wildcard.

## Server-only configuration

- `thiepn/ai` production Vercel: `THIEPN_AI_PDF_SECRET`.
- THIEPN Core Cloudflare Worker: matching `THIEPN_AI_PDF_SECRET` and `THIEPN_ACCOUNT_PDF_CLIENT_ID=<same OAuth client UUID as browser>`.
- The AI service's existing `THIEPN_AI_APP_SECRETS_JSON` may continue to carry existing app credentials; never publish it.
- Provider `OPENAI_API_KEY` remains in `thiepn/ai`; no server secret belongs in the PDF Vite build.

## Mandatory release sequence

1. Complete Account inactive PDF app registration; then manually register one OAuth public client and bind the **actual** client UUID through a reviewed Account migration, activating the PDF app.
2. Confirm F5–F8 dependency PRs and F8B backend/frontend PRs qualify and merge in order.
3. Provision matching PDF app HMAC secrets on the two servers. Configure Core client binding and Account verification.
4. Deploy `thiepn/ai` capability, followed by Core gateway and finally the configured PDF Studio build. Keep frontend native Luna disabled until backend is verified.
5. Negative tests: no-token request, another Account client token, wrong origin, malicious/oversized plan, stale PKCE state, revoked or disconnected Account session, rate limit and misconfigured secrets. Each must fail without invoking Luna.
6. Positive real-user tests: already-signed-in Account silent SSO; manual connect; consent; app-local disconnect (no silent reconnect); cross-tab refresh; request a safe Luna plan; review; apply; confirm separate Run action; validate downloaded local PDF. Check no PDF bytes, filenames or session tokens appear in model requests, logs or trace artifacts.
7. Check error logs, budget accounting and recovery/rollback; only then promote production.

## Status at source preparation

The Account production database lacked a `pdf` app and OAuth client. The connected Vercel AI project also lacked the PDF-specific HMAC secret. No production OAuth client registration, secret provisioning or live authenticated user test has been performed; source qualification must not be confused with production certification.
