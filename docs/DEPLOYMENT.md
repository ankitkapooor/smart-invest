# Cloudflare deployment and key setup

The existing app is a Cloudflare Worker named `valuelens` at `valuelens.ankitkapoor.me`. `wrangler.jsonc` preserves that domain and adds a SQLite-backed `ResearchStore` Durable Object. The existing namespace uses migration `v1`; v0.3 reuses it without a destructive migration. Large quarterly/research records are gzip-compressed before key-value storage, with a 120 KB compressed safety cap. Legacy uncompressed records remain readable. Cache identity includes model version 0.3.0 and research-4, so old LLM growth-path reports cannot populate new forecasts.

## Local key

The ignored `.dev.vars` file is ready in this checkout:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-terra
```

Paste your key after `OPENAI_API_KEY=` in the file, not in chat, and restart `npm run dev`. The Node preview loads this file; environment variables take precedence. Its research storage is in memory and resets on restart. `npx wrangler dev` exercises the actual Worker/Durable Object runtime.

## Production key

Use Cloudflare Dashboard → Workers & Pages → **valuelens** → Settings → Variables and Secrets → **Add** → **Secret**. Name it `OPENAI_API_KEY`, enter the key, and save/deploy. Or run:

```sh
npx wrangler secret put OPENAI_API_KEY
```

This prompts for the secret without placing it in a command argument. A local `.dev.vars` key does not automatically become a production secret. Do not put a plaintext key in `wrangler.jsonc`, source, screenshots, exports or browser code.

Refresh the site, open **Company research**, then select **Research [ticker]**. `/api/config` exposes only a configured boolean, model identifier and daily call ceiling. If the model is not accessible to your OpenAI project, change `OPENAI_MODEL` to an available Responses model supporting web search, background mode and structured outputs, then redeploy. A missing/rejected key produces an explicit error.

## Automatic production deployment

A Git push updates the live site only after **Cloudflare Workers Builds** is connected to the existing `valuelens` Worker. Manual Wrangler uploads do not establish a Git connection. Configure the existing Worker, not a second Pages project:

| Setting | Value |
|---|---|
| Git repository | `ankitkapooor/smart-invest` |
| Production branch | `main` |
| Root directory | Repository root (`/`) |
| Build command | `npm run build:ci` |
| Deploy command | `npm run deploy && npm run deploy:verify` |
| Nonproduction automatic builds | Disabled unless a separate preview setup is intended |
| Node runtime | 22, pinned by `.node-version` |

Cloudflare installs the locked dependencies, then `build:ci` runs syntax checks and all offline tests. A failure prevents the deployment command from running. The final build step writes `public/build.json` with the checked-out Git commit, package version and build timestamp. This generated artifact is ignored by Git; credentials and environment values are never copied into it.

`deploy:verify` reads the live page, `/build.json` and `/api/config`. It waits for the exact Git commit to become active, checks the version and verifies that the existing server-side research secret is still configured. It never starts paid research. A failed verification makes the Cloudflare build fail visibly; it does not automatically roll back an already activated version. Use the Cloudflare deployment history for rollback if needed.

Once the connection is enabled, the normal release is simply **commit and push to main**. Check the build status in Cloudflare or the repository's Cloudflare check run. You do not need to run `npm run deploy` locally. Build setup is account configuration and is not created by committing these helper scripts alone.

For an intentional manual recovery deployment:

```sh
npm ci
npm run build:ci
npm run deploy
npm run deploy:verify
```

Official references: [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/), [build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

Wrangler uses the existing authorized Cloudflare OAuth login. The production app does not require any private portfolio data. Its public APIs do not accept arbitrary LLM prompts. Research uses same-origin POST, bounded inputs, one persisted quota reservation per company/period/version, a global daily ceiling (default 10), at most six web-search tool calls per report, and bounded output tokens. Failed/rejected jobs can be retried after five minutes, subject to the quota. Research that is not polled expires after twenty minutes on the next poll; OpenAI background storage may have its own retention policy.

Jobs cache by symbol, financial period, model identifier and model/research version. Terra uses low reasoning effort and a 12,000-token output cap. Background retrieval explicitly requests source metadata. Directory-level SEC citations require confirmation of the exact exhibit in the official document index and a matching issuer accession/filing date. Validator-only fixes can recheck a completed response without generating another report. New filing periods produce new reports. The first completed vintage is retained separately from mutable job status. Financial inputs, report, source dates, assumptions, forecast, code version and SHA-256 input fingerprint are exported; no credentials are exported. The stored quote is the vintage quote, not a fresh trading price.

A daily call limit is not a dollar guarantee. Configure project budget/usage limits in OpenAI and monitor usage before promoting the public app. Research requests transmit only public-company data to OpenAI. SEC/Yahoo request limits remain best-effort per isolate; configure Cloudflare WAF and a licensed market-data feed for broader traffic.

## Verification boundaries

Run `npm run test:live -- AAPL` to explicitly exercise the configured hosted model, polling, citations, researched peer loading, immutable vintage and deterministic valuation. This may create one paid report, subject to the server quota; cached validated reports are reused. Set `VALUELENS_TEST_ORIGIN=http://localhost:8787` for local testing. Results are saved under `reports/v03-live/`. A live smoke test establishes functionality, not predictive accuracy. Unit tests additionally cover rejection, missing-key gating, cache isolation by model, quota deduplication, document-path ownership and FCFF identities.
