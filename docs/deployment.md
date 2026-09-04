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

Every number below came from running the production build and hitting
`/api/compile` with `sampleProfile`. They are the basis for the sizing choices
in this document. Re-measure before changing them.

| Metric                             | Default heap | `--max-old-space-size=256` |
| ---------------------------------- | ------------ | -------------------------- |
| Cold start to first PDF            | 346 ms       | 346 ms                     |
| Compiled PDF                       | 49 KB        | 49 KB                      |
| RSS after first compile            | 153 MB       | 155 MB                     |
| RSS steady state (2,000 compiles)  | **465 MB**   | **272 MB**                 |
| Compile latency p50                | 4.08 ms      | 3.87 ms                    |
| Compile latency p95                | 5.69 ms      | 5.28 ms                    |
| 50 concurrent compiles, wall clock | 92 ms        | 87 ms                      |

Four things follow from this, and each one decides something:

**Memory is a configuration choice, not a property of the app.** Left alone, V8
grows the heap to 465 MB because the machine has room, which does not fit a
512 MB instance. Capped at a 256 MB old space it settles at 272 MB with no
latency cost — the p50 is marginally _faster_. Every deployment sets
`NODE_OPTIONS=--max-old-space-size=256`. Without it the smaller instance sizes
are unavailable for no reason.

**There is no leak.** RSS rises and then plateaus in both configurations, flat
from compile 1,000 through 2,000. The compiler and font caches held on
`globalThis` are bounded, which is what makes scale-to-zero safe to run
unattended.

**Scale to zero is free of consequence here.** A 346 ms cold start is below the
threshold where a person notices a page is waking up. There is no case for
paying for an always-warm instance in personal mode.

**Egress is not a cost driver at this size.** At 49 KB per PDF, the 1 GB monthly
free egress allowance covers about 20,000 compiles. This matters because the
live preview posts on a debounce, so compiles — not page loads — are the
dominant traffic. Revisit if the PDF grows by an order of magnitude.

## Where it runs

**Google Cloud Run**, 512 MiB, minimum instances 0.

Chosen because the memory ceiling is a number you pick rather than a fixed
property of a plan tier. The free tiers at Render and Koyeb are capped at
512 MB with no way to raise it; measured at 272 MB the app fits, but with no
headroom if a future change adds a font or a template. Cloud Run keeps the
escape hatch.

Free-tier allowances are 2M requests, 180,000 vCPU-seconds and 360,000
GiB-seconds per month. At 4 ms of billed time per compile, personal use does
not approach any of them. Verify the region is one the free tier covers before
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
concurrent compiles were measured at 272 MB of RSS. Half the default leaves
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
