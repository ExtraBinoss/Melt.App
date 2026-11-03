# Cloudflare deployment

Production targets **https://melt.plinka.eu**, using the `melt-plinka` Worker and
prerendered static files. Ordinary assets are served directly by Cloudflare; the
small Worker only adapts oversized WASM transport. There is no application backend
or server-side project storage. Browser projects remain origin-local IndexedDB data.

## Owner-controlled CI/CD

The [Quality workflow](../../.github/workflows/quality.yml) accepts pushes to `main`
and manual runs. Both verification and production require all of:

- Repository `ExtraBinoss/Melt.App`, immutable repository ID `1436787551`.
- Original actor ID `113912449`, original login `ExtraBinoss`, and triggering login
  `ExtraBinoss`. A contributor rerunning an owner's workflow is rejected.
- Production additionally requires `refs/heads/main` and a push or manual event.

These are GitHub-authenticated event fields, not Git commit author names or emails.
External pull requests do not automatically run this workflow. The owner can run
verification manually on a repository branch; that does not publish a non-main ref.
Fork copies do not satisfy the repository-ID guard.

Deployment verification checks versions, contribution rules, TypeScript, lint,
formatting and Wrangler-generated bindings before building the production pages.
It prepares the static package, runs a non-publishing Wrangler dry run, and verifies
actual local Cloudflare delivery in Chromium. Each stage has its own CI step.
The complete unit suite and coverage enforcement are intentionally outside this
publication workflow; run `bun run check-ci` for the full quality gate before a
release or when requested. Removing them here does not change coverage thresholds
or claim that the full suite passed.

Bun's package download cache is shared between verification and production, keyed
by platform, Bun version, lockfile and dependency patches. Verification saves it
immediately after a successful frozen installation, even if a later check fails.
Cache errors have a bounded timeout and do not block publication. Credentials,
`node_modules`, build outputs and test results are never cached. FFmpeg setup is
unnecessary for this deployment path; it belongs to template-generation tests.
Production downloads that same workflow run's immutable artifact, validates its
commit and per-file SHA-256 hashes, then rejects a commit superseded on `main`.
Deployments are serialized and the account credential is exposed only to the final
Wrangler step, after artifact checks and environment approval. Actions and tool
versions are pinned. No personal GitHub token is needed; the automatic workflow
token has read-only contents access and the production job's limited artifact and
deployment permissions.

The existing active `main` ruleset requires pull requests, owner code review,
resolved conversations and the `verify` check, and prevents deletion and force
pushes. Its sole bypass is the `ExtraBinoss` user. [CODEOWNERS](../../.github/CODEOWNERS)
continues to require the owner for repository changes.

## Production secrets and approval

The repository environment **cloudflare-production** is configured with:

- Only branch `main`, with no tag rule.
- Required reviewer: user ID `113912449` (`ExtraBinoss`) only.
- Administrator bypass disabled. Self-review remains allowed so this sole reviewer
  can approve an owner-triggered deployment.
- Environment secret `CLOUDFLARE_API_TOKEN` and environment variable
  `CLOUDFLARE_ACCOUNT_ID`.

The credential is an **environment secret inside the repository**, rather than an
unrestricted repository-wide secret. A changed workflow on another branch cannot
read it. Creating this environment or storing its secret does not execute a
workflow, create a Worker or publish the website.

On 2026-11-03, a dedicated account-owned bootstrap token was created and stored
with `gh secret set --env cloudflare-production`. The general account token was
not copied. The bootstrap expires on **2026-12-03** and grants only:

- Workers Admin and Account Settings Read for the target account.
- Workers Routes Write and Zone Read for **plinka.eu** only.

It has no token-management, billing, database, storage or unrelated product grants.
Because Melt does not exist in Cloudflare yet, creating it requires product-level
Workers Admin. **After the first successful deployment**, replace the bootstrap
secret with an account-owned token scoped to **Specified Workers → melt-plinka →
Editor**, plus Workers Routes Write and Zone Read for plinka.eu. Revoke the
bootstrap after replacement. Individual Worker scopes require an existing Worker;
see [Cloudflare permissions](https://developers.cloudflare.com/workers/authorization/workers/).

An owner push or manual `main` run verifies the source and then waits for the owner's
**cloudflare-production** approval. Only then does the CI job invoke Wrangler.
There is no separate Cloudflare Git integration, deployment hook or automatic
preview publication. `workers.dev` and version preview URLs are disabled.

## Static output and oversized WASM

TanStack prerenders the landing, tools catalogue and tools pages, dashboard,
editor and social artboard into `dist/client`. Query parameters remain available
to the client. `html_handling: drop-trailing-slash` keeps canonical paths, and
missing files return real 404 responses rather than the landing HTML.

`bun run deploy:prepare` creates a separate package in
`artifacts/cloudflare/site`, preserving the original build. It excludes source maps,
rejects symlink assets and overlapping source/output directories, checks file/count
budgets, and leaves an existing good package intact if preparation fails. A manifest
outside the public directory records the event SHA, paths, sizes and SHA-256 hashes.
The production job verifies it before obtaining the Cloudflare credential.

Cloudflare's [individual asset limit](https://developers.cloudflare.com/workers/platform/limits/)
is 25 MiB. The current ONNX runtime is **28,747,738 bytes**. Its lossless gzip
representation is **7,113,512 bytes**, stored as the same hashed filename plus
`.gz`. Client code still requests its original `.wasm` URL.

The Worker streams the encoded asset through its ASSETS binding with
`Content-Type: application/wasm`, `Content-Encoding: gzip` and **encodeBody: manual**.
The runtime does not buffer the binary or encode it a second time. Normal assets,
conditional requests, HEAD responses and genuine missing assets retain their
appropriate semantics. Encoded range requests may receive a full 200 response;
partial gzip byte ranges cannot be decoded independently. See the
[Response encoding contract](https://developers.cloudflare.com/workers/runtime-apis/response/).

The native browser check validates decoded length, SHA-256 and
`WebAssembly.validate`, visits the prerendered routes, hydrates the dashboard, and
checks missing WASM/map responses. The initial headers-only compression experiment
failed this check because Workers automatically compressed the gzip payload again;
the streaming adapter fixes that failure without changing the actual runtime bytes.

## Local preparation without publication

```sh
bun install --frozen-lockfile
bun run build
bun run deploy:prepare
bun run deploy:dry-run
bun run test:deployment
```

`test:deployment` starts a local-only Wrangler instance on **127.0.0.1:4183**
without Cloudflare credentials. Chromium runs in CI; run both installed engines
locally with:

```sh
bunx playwright test --config test/deployment/playwright.config.ts
```

After changing Worker bindings, regenerate the small declaration file and format
it; the workflow checks that committed declarations match:

```sh
bunx --no-install wrangler types apps/web/src/platform/cloudflare/worker-configuration.d.ts --env production --include-runtime false
bunx oxfmt apps/web/src/platform/cloudflare/worker-configuration.d.ts
```

`deploy:verify` is a CI check and requires `GITHUB_SHA`; it rejects stale or altered
packages. The first explicitly approved production job creates the Worker and
attaches the custom domain using the configured route. Do not pre-create DNS or
upload a placeholder Worker merely to prepare the release.

## Preparation validation

Preparation on 2026-11-03 verified focused package, identity/workflow and Worker
behavior tests, TypeScript and lint, a Wrangler dry run, and native Chromium and
Firefox delivery. The local HTTP witness used the retained production client from
`artifacts/hero-perf/source/artifacts/ready/client`; CI will build a fresh client
from its exact event commit. A complete release/coverage gate was not rerun locally.

No production deployment, DNS change, Git push or Actions dispatch was performed.
Only local source changes, the protected GitHub environment and the dedicated
bootstrap credential were prepared. Ignored `artifacts/cloudflare/` contains local
packaging, test output and credential metadata; it contains no plaintext token.
