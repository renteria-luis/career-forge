# Deployment

Where this runs, what it costs, and the limits that keep a personal project
from producing a surprise invoice.

## Two modes, one artifact

The app has a personal mode and a public mode. They are the same container with
different settings, not two deployments. Nothing built for the first has to be
torn out for the second.

|                   | Personal (now)                             | Public (later)                    |
| ----------------- | ------------------------------------------ | --------------------------------- |
| Who uses it       | The author, plus anyone who finds the link | Anyone                            |
| Hosting cost      | $0                                         | ~$6/month                         |
| Minimum instances | 0, scales to zero                          | 1, always warm                    |
| Domain            | The provider's free subdomain              | A registered domain               |
| Accounts          | Email and password, verified               | Same, plus phone if abuse appears |
| AI generation     | Bounded by a workspace spend cap           | Bounded per account by credits    |
| Payments          | None                                       | Required                          |

Moving between them is a change to deploy flags and a feature flag. It is not a
migration.

## Measured behaviour

Every number below came from running the production build against
`/api/compile`. They are the basis for the sizing choices in this document.
Re-measure before changing them.

**Send different content on every compile.** The first version of this table did
not, and that single mistake made three of its rows wrong. Typst memoizes by
content, so re-posting one payload measures cache hits: it reported a latency
the app never achieves in use, and it hid a cache that grew without bound
because nothing in the test ever missed. Typing is the workload, and no two
keystrokes produce the same document.

| Metric                                   | Default heap | `--max-old-space-size=256` |
| ---------------------------------------- | ------------ | -------------------------- |
| Cold start, process launch to first PDF  | 321 ms       | 321 ms                     |
| Compiled PDF, `sampleProfile`            | 48 KB        | 48 KB                      |
| RSS after first compile                  | 158 MB       | 162 MB                     |
| RSS after 2,000 compiles of varying text | **283 MB**   | **310 MB**                 |
| Compile latency p50                      | 5.72 ms      | 5.58 ms                    |
| Compile latency p95                      | 6.79 ms      | 6.98 ms                    |
| 50 concurrent compiles, wall clock       | 200 ms       | 183 ms                     |

Four things follow from this, and each one decides something:

**The memo cache is what bounds memory, not the heap flag.** Both
configurations now plateau well inside a 512 MiB instance, and the difference
between them is within the spread of single runs. That was not true before
`compileResume` began evicting: measured with varying content, RSS climbed past
1 GB by compile 2,000 and never fell. `NODE_OPTIONS=--max-old-space-size=256`
stays on the deployment because it costs nothing, but it is no longer the thing
keeping the app inside its instance, and it cannot be — the memory that grew was
native, on the other side of the V8 heap the flag limits.

**It plateaus, and only because it is made to.** RSS rises through the first
thousand compiles and is flat from there. That is the eviction working; it is
not a property of the compiler, and removing the eviction brings the growth
straight back. This is what makes scale-to-zero safe to run unattended.

**Scale to zero is free of consequence here.** A 321 ms cold start is below the
threshold where a person notices a page is waking up. There is no case for
paying for an always-warm instance in personal mode.

**Egress is not a cost driver at this size.** At 48 KB per PDF, the 1 GB monthly
free egress allowance covers about 20,000 compiles. This matters because the
live preview posts on a debounce, so compiles — not page loads — are the
dominant traffic. That figure describes a resume; the size follows the content,
and a document with 2,000 entries — which `MAX_BODY_BYTES` still permits —
compiles to 1.9 MB. The allowance is sized for the traffic this actually sees,
not for the largest document the endpoint accepts.

## Where it runs

**Google Cloud Run**, 512 MiB, minimum instances 0.

Chosen because the memory ceiling is a number you pick rather than a fixed
property of a plan tier. The free tiers at Render and Koyeb are capped at
512 MB with no way to raise it; measured at 310 MB the app fits, but with no
headroom if a future change adds a font or a template. Cloud Run keeps the
escape hatch.

Free-tier allowances are 2M requests, 180,000 vCPU-seconds and 360,000
GiB-seconds per month. At about 6 ms of billed time per compile, personal use
does not approach any of them. Verify the region is one the free tier covers before
deploying; the allowance is limited to the cheapest US regions.

Alternatives, should the above stop being true:

| Host   | Cost                          | Why it might be chosen                                                                              |
| ------ | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| Fly.io | $3.32 (512 MB) / $5.92 (1 GB) | Always warm, egress at $0.02/GB against Cloud Run's $0.12/GB. The right answer once traffic is real |
| Koyeb  | $0                            | No credit card required. 512 MB ceiling, no headroom                                                |
| Render | $0                            | Free tier spins down after 15 minutes and takes about a minute to wake                              |

All four run the same `Dockerfile`. Switching is a deploy command.

## Deploying

```bash
gcloud run deploy career-forge \
  --source . \
  --region us-central1 \
  --memory 512Mi \
  --min-instances 0 \
  --max-instances 1 \
  --concurrency 40 \
  --set-env-vars NODE_OPTIONS=--max-old-space-size=256 \
  --allow-unauthenticated
```

That command still works and is the escape hatch. It is not how a change
normally reaches the service.

### What actually deploys

A push to `main` does, and only after the whole suite has passed on the exact
image being deployed. `.github/workflows/ci.yml` builds the container, starts
it, asks it for a PDF and reads one back, and only then pushes that image to
Artifact Registry tagged with the commit. The deploy job takes that tag.

It is the tested artefact that ships, rather than a rebuild that would almost
certainly be identical — and "almost certainly" is the reason this project
builds a container in CI in the first place.

Three things follow from that and are worth knowing:

- **No key is stored anywhere.** GitHub mints a short-lived token through
  Workload Identity Federation and Google exchanges it. There is no JSON
  credential in the repository or in a secret.
- **Nothing is passed for the environment.** The service already holds
  `DATABASE_URL`, the auth secret and the mail credentials, and the deploy
  action merges rather than replaces. The `--set-env-vars` in the command above
  does the opposite: run it as written and the service comes back with only
  `NODE_OPTIONS` and refuses to serve an account page. Use `--update-env-vars`
  by hand.
- **The deploy is checked too.** The last step asks the service that is now
  live for a PDF. A build that passes in CI and cannot compile in its real
  environment is exactly what that endpoint exists to catch.

### Setting it up, once

Three repository variables, under Settings → Secrets and variables → Actions →
Variables: `GCP_PROJECT_ID`, `GCP_WIF_PROVIDER`, `GCP_SERVICE_ACCOUNT`. Absent
any of them, the publish and deploy steps skip and CI stays a checker — which is
what a fork of this repository should get.

```bash
PROJECT_ID=...            # the Cloud Run project
REPO=renteria-luis/career-forge
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
SA="github-deploy@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud services enable iamcredentials.googleapis.com artifactregistry.googleapis.com \
  run.googleapis.com --project="$PROJECT_ID"

gcloud artifacts repositories create career-forge --repository-format=docker \
  --location=us-central1 --project="$PROJECT_ID"

gcloud iam service-accounts create github-deploy --project="$PROJECT_ID" \
  --display-name="GitHub Actions deploy"

for role in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA}" --role="$role"
done

gcloud iam workload-identity-pools create github --location=global \
  --project="$PROJECT_ID" --display-name="GitHub Actions"

# The attribute condition is the part that matters. Without it, any repository
# on GitHub can present a token to this provider.
gcloud iam workload-identity-pools providers create-oidc career-forge \
  --location=global --workload-identity-pool=github --project="$PROJECT_ID" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository == '${REPO}'"

gcloud iam service-accounts add-iam-policy-binding "$SA" --project="$PROJECT_ID" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.repository/${REPO}"

echo "GCP_WIF_PROVIDER=projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/providers/career-forge"
echo "GCP_SERVICE_ACCOUNT=${SA}"
```

**Set a cleanup policy on the registry before the images pile up.** The free
allowance is 0.5 GB and this image is a few hundred megabytes, so a fortnight of
pushes fills it and the overage is billed. Keep is evaluated before Delete:

```bash
cat > /tmp/cleanup.json <<'JSON'
[
  { "name": "keep-recent", "action": { "type": "Keep" },
    "mostRecentVersions": { "keepCount": 5 } },
  { "name": "delete-old", "action": { "type": "Delete" },
    "condition": { "olderThan": "30d" } }
]
JSON
gcloud artifacts repositories set-cleanup-policies career-forge \
  --location=us-central1 --project="$PROJECT_ID" --policy=/tmp/cleanup.json
```

`--max-instances 1` is the cost control, and it is not optional. A public URL
with no ceiling on instance count is the one configuration that can turn a
crawler into an invoice. One instance handles 40 concurrent compiles in under
100 ms; a personal deployment will never need a second one.

`--concurrency 40` is set below the platform default of 80 because 50
concurrent compiles were measured at 310 MB of RSS. Half the default leaves
room for the request bodies that arrive with them.

## Cost controls

These exist because a budget alert notifies, it does not stop spending. Layer
them.

1. **`--max-instances 1`** on the service. Bounds compute physically.
2. **A billing budget** on the project, set at $1 with alerts at 50% and 100%.
   It will never fire in personal mode; if it does, something is wrong and that
   is the point.
3. **A spend limit on the model provider workspace**, set before any key is
   created. See `docs/accounts-and-billing.md`.
4. **Body ceilings**, counted on the bytes that arrive rather than read off a
   header, in `src/lib/http/bounded-body.ts`. 512 KB for a compile, 6 MB for an
   upload. Serving attacker-supplied documents is a denial-of-service surface
   and the ceiling is what makes it a bounded one. Both endpoints got this
   wrong once, in the same way and for the same reason — see below.
5. **Rate limits** on both public endpoints, in `src/lib/http/limits.ts`, and on
   the account endpoints, in `src/lib/auth/server.ts`. The ceilings above bound
   one request; these bound how many.

## The ceilings that were not ceilings

Both public endpoints once trusted a size the sender supplied, and both were
measured rather than reasoned about.

`/api/compile` read `content-length`, which a chunked request simply omits. 60
MB then arrived and compiled in 48 s.

`/api/import` looked more careful and was worse. It called `formData()` and then
checked `file.size` — a number only knowable once the whole body is decoded and
in memory. Measured against the deployment's own 512 MiB:

| 300 MB upload, no `content-length` | Before                       | After              |
| ---------------------------------- | ---------------------------- | ------------------ |
| Bytes accepted                     | all 300 MB                   | stops at 11 MB     |
| Time to refuse                     | 577 ms                       | 26 ms              |
| Peak RSS                           | 1,085 MB                     | 154 MB             |
| Outcome at 512 MiB                 | **process killed, no reply** | 413, still serving |

One anonymous request took the service down. The tidy 413 it returns on a
machine with spare memory is a message printed after the damage, not a limit.

The general shape is worth keeping: **a size a caller tells you is not a
measurement, and neither is one you can only take after buffering.**

## Rate limits

Token buckets, in memory, per instance. That is exact rather than approximate
because `--max-instances 1` means one instance is the whole service; a second
instance would need a shared store, and this note is the reminder.

|                 | Per caller      | Global           |
| --------------- | --------------- | ---------------- |
| `/api/compile`  | 60 burst, 6/s   | 600 burst, 120/s |
| `/api/import`   | 10 burst, 0.5/s | 120 burst, 30/s  |
| `/api/generate` | 10 burst, 0.1/s | 12 burst, 0.1/s  |

The account endpoints have their own, per address and per path, held the same
way: 10 sign-ins a minute, 5 registrations, 5 password resets. A sign-in costs
a 19 MiB Argon2id verify, which is what makes those numbers worth having.

`/api/generate` is the odd row and is sized in money rather than in CPU. It also
has a second allowance of its own, per account rather than per address, in
`src/lib/ai/generate.ts`; the two exist together because one address can hold
several accounts. Neither is what makes a large bill impossible — the balance on
the provider workspace is, and it stops rather than warns.

**A generation holds a Cloud Run slot for tens of seconds.** That is the one way
it interacts with the numbers above: `--concurrency 40` is sized for compiles
that take 5.7 ms, and a streamed generation occupies a slot for the whole of its
life. The seam caps concurrent generations at four per instance, which leaves
thirty-six for the live preview. Memory is not the constraint — a reply is
capped in the low thousands of tokens, so four in flight is tens of kilobytes
against the 310 MB plateau — and neither is billed instance time, at roughly 40
vCPU-seconds a generation against a 180,000-second monthly allowance.

The per-caller figures come from what the app produces: the preview debounces
at 250 ms, so a tab being typed into cannot exceed four compiles a second.
The global figures come from what an instance costs to serve — 5.7 ms a compile
and 11.9 ms an import, so each ceiling is roughly two thirds of a core.

**Per-caller keys on the last `X-Forwarded-For` entry, not the first.** Google's
load balancer appends to whatever header arrived and does not verify what
precedes it, so the leftmost entry is whatever the caller typed. Reading
position 0 — which is what most examples do — turns a per-address limit into a
per-header-value one, and rotating the header restores a full allowance on every
request. `TRUSTED_PROXY_HOPS` says how many hops to count back if a load
balancer or CDN is ever put in front.

`src/proxy.ts` resolves that address once and passes it on in a header of its
own, because the account library reaches the same conclusion by a different
route: handed a multi-value `X-Forwarded-For` with no list of trusted proxy
addresses, it refuses to guess and falls back to one shared bucket for every
visitor — which would turn its per-address login limit into a way for one caller
to lock everybody out.

The global bucket exists because that reasoning could still be wrong. It keys on
nothing a caller controls, so it holds whatever happens to the address.

## Accounts

The account system needs four settings that nothing else here does, all named
in `.env.example`: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and
a `RESEND_API_KEY` with an `EMAIL_FROM`. Without the last two, a production
build refuses to register anyone rather than creating accounts nobody can reach.

`BETTER_AUTH_URL` fails the same way and for a sharper reason: handed nothing,
the account library works the origin out from the request, and that origin is
the trusted-origin list every CSRF check and redirect is validated against. A
deployment that forgot it would trust whatever `Host` a caller sent. It now
throws instead.

Migrations are files in `drizzle/` and are applied deliberately, with
`DATABASE_URL=... pnpm db:migrate`, before the deploy that needs them. Nothing
runs them at container start: a failed migration would then take the service
down instead of failing where somebody is watching.

Every page is now rendered per request, because the Content-Security-Policy is
built around a per-request nonce and a page generated at build time has no
nonce to carry. That gives up static generation and CDN caching, neither of
which this deployment uses.

## What is still missing before public mode

- A registered domain, mapped to the service. Cloud Run domain mapping and its
  TLS certificate are free.
- `--min-instances 1`, which leaves the free tier. The allowance is 50 hours of
  vCPU per month and an always-warm instance consumes 720.
- A shared store for the rate limits, the moment `--max-instances` goes above 1.
  This now covers the account limits too, which are held in the same way and for
  the same reason.
  That list no longer includes the container. The image has been built with the
  account system in it and is serving it: `@node-rs/argon2` is a native binding,
  like the Typst compiler, and its `.node` file is traced into `.next/standalone`.
  One thing did have to be fixed to get there, and it is the shape to remember —
  `playwright.config.ts` imports from `e2e/`, `e2e/` is not copied into the image,
  and the build's own TypeScript pass still read the config that was left behind.
  A file excluded from the image takes its config with it.
