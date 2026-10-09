# F8 — Native GPT-6 Luna Planning

## Architecture

F8 is stacked on F7, F6 and F5.

```
PDF Studio browser ── THIEPN Account Supabase Auth (PKCE session)
        │
        ├── POST /v1/pdf/ai/plan + user bearer ──> THIEPN Core Worker
        │                                               │
        │                         verifies Account token │
        │                         HMAC signs app=pdf     │
        │                                               v
        │                                        thiepn/ai service
        │                                       pdf.planWorkflow / GPT-6 Luna
        │                                               │
        └<──────────── typed proposal via Core <─────────┘
        │
        ▼
F7 strict parser → review → explicit apply → F6 risks and approval → Run
```

Browser requests only the PDF goal and never transmits PDF bytes, filenames, extracted text, passwords, annotations or document storage. Model keys and the PDF app HMAC secret remain on the two servers.

## Static browser configuration

Vite **public** build-time values (not model keys):

- `VITE_PDF_CORE_URL`: the real THIEPN Core HTTPS origin.
- `VITE_PDF_ACCOUNT_SUPABASE_URL`: the THIEPN Account Supabase Auth public API origin.
- `VITE_PDF_ACCOUNT_PUBLIC_KEY`: the Supabase *publishable/anon* key (not a service-role key or HMAC secret).

Use the exact configured HTTPS origin (for example `https://thiepn.dev` if hosting PDF Studio under a path) in the Core `ALLOWED_ORIGINS` list.

Register the actual PDF Studio application callback URL (**origin plus deployment pathname**, with no fragment) in THIEPN Account's Supabase Auth allowed redirect URLs. F8 obtains a PKCE authorization code, exchanges it with Account's public Auth API, stores only the PDF-scoped session in **sessionStorage**, refreshes expired access tokens through Account, and gives the bearer **only** to Core. No third-party OAuth secret is needed by the browser.

The new Account login is **not** yet the finalized automatic ecosystem-wide first-party SSO handshake. It initiates the existing THIEPN Account Google provider and can benefit from an existing Google provider session, but exact seamless cross-app SSO requires a separately qualified first-party PDF client registration and integration. Do not reuse another app's OAuth client ID.

## User flow

1. Open Batch → **Plan with GPT-6 Luna or ChatGPT**.
2. Provide an objective.
3. Connect THIEPN Account through PKCE (if not already connected to PDF Studio).
4. Click **Generate with Luna**. Only the text objective is sent to the Core gateway; loading, timeout, cancellation, sign-out and rate limits have user-visible states.
5. Luna's result becomes a **staged F7 proposal** using the same strict allowlist/range/ordering parser.
6. Review the exact workflow actions and settings; explicitly approve replacing the composer steps.
7. Approve destructive metadata removal or rasterization **again in F6** if present.
8. Add PDFs and click Run workflow. F5 is the only action execution engine.

Manual ChatGPT planning remains available if the Core/AI/Account backend is unavailable or not configured.

## Preconditions for live use

- Merge/deploy `thiepn/ai` F8 capability.
- Merge/deploy `thiepn/core` F8 route.
- Provision matching random `THIEPN_AI_PDF_SECRET` on both **servers only**.
- Configure THIEPN Account OAuth callback and Core CORS allowed origin.
- Rebuild/deploy PDF Studio with the three public variables.
- Run live authorized and unauthorized sign-in, plan and execution qualification.

No production environment values were modified by these source-code PRs, and success is not claimed without live verification.
