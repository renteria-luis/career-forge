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
4. **`MAX_BODY_BYTES`** in `src/app/api/compile/route.ts`, enforced at 512 KB
   by counting the bytes that arrive. Compiling attacker-supplied documents is
   a denial-of-service surface and the ceiling is what makes it a bounded one.
   It was measured against `content-length` at first, which a chunked request
   simply omits — 60 MB then arrived and compiled in 48 s. Trusting a header
   the sender writes is not a limit.

## What is still missing before public mode

- A rate limit on `/api/compile`. The route's own comment says so. It is
  reachable without an account and compiles arbitrary documents. The size
  ceiling bounds one request; nothing yet bounds their number.
- A registered domain, mapped to the service. Cloud Run domain mapping and its
  TLS certificate are free.
- `--min-instances 1`, which leaves the free tier. The allowance is 50 hours of
  vCPU per month and an always-warm instance consumes 720.
