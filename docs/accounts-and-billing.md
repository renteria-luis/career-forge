# Accounts and billing

The staged plan from a personal deployment to a paid public one. Written down
so the order is not rediscovered later, and so the pieces that are deliberately
not built yet are recognisable as deferred rather than forgotten.

## Why this is staged

Every control below costs something to build and something to run. The ones
that prevent abuse only earn their place once there is something worth abusing.
Free credits are what make a fake account valuable; before credits exist, an
extra account costs the project nothing and buys the attacker nothing.

So the stages are ordered by what is actually at risk, not by what a complete
system eventually looks like.

| Stage       | What is at risk                         | What that requires                         |
| ----------- | --------------------------------------- | ------------------------------------------ |
| 1. Personal | Nothing. No accounts, no keys exposed   | Already shipped                            |
| 2. Accounts | The model spend cap, shared by everyone | Email auth, verified. Global spend ceiling |
| 3. Credits  | Per-account value worth farming         | Per-account limits, abuse resistance       |
| 4. Payments | Real money and real obligations         | Payment processor, receipts, tax           |

Stage 2 is the current target. Stages 3 and 4 are designed here and built when
the app goes public.

## Stage 2: accounts

### What it is for

Not to keep people out. The link will be in the repository and anyone who finds
it is welcome. Accounts exist so that AI generation is attributable, so that a
per-account limit has something to attach to later, and so that a stranger
cannot spend the workspace budget anonymously.

### Library

`better-auth`. Verified compatible with what is installed: it requires Zod
`^4.3.6` against the project's 4.4.3, and lists peer support for Next `^16`,
React `^19`, and `drizzle-orm` `^0.45.2`.

It was chosen over the alternatives for one structural reason: it writes to
ordinary tables in your own database. A provider-managed identity service
(including the one bundled with the database host) would put user identities
behind an API that has to be reimplemented to migrate. Sessions in your own
Postgres move with a `pg_dump`.

Do not use Lucia. It was deprecated in March 2025 and the package carries an
official deprecation notice; the project is now documentation, not a library.

### Database

Neon, used as plain Postgres and nothing else. Free tier is 0.5 GB and 100
compute-hours per month, and it scales to zero between requests. No
provider-specific auth, storage or edge features — the moment one is used the
database stops being portable.

Region must match the compute region. A database in Virginia behind a service
in São Paulo pays the round trip on every query.

### Security requirements

These are requirements, not suggestions. A resume is personal data and
`docs/engineering-guidelines.md` §6 already binds this project to treating it
that way.

**Injection.** Every query goes through the query builder with bound
parameters. No string-concatenated SQL, ever, including in migrations and
one-off scripts. This is the same rule as §4's ban on interpolating values into
Typst source, for the same reason: the input is someone's name and it contains
quotes.

**Input validation.** Every auth request body is parsed by a Zod schema at the
route boundary before anything touches it, per §3. Email and phone are
normalised before the uniqueness check, or `A@example.com` and `a@example.com`
become two accounts.

**Password storage.** Argon2id, at the OWASP-recommended parameters: m=19456
(19 MiB), t=2, p=1 as the floor, or m=47104 (46 MiB), t=1, p=1 where the
instance has room. At 512 MiB of container memory the first is the one that
fits. Never bcrypt for new code; never a bare hash.

**Sessions.** Server-side sessions in Postgres, referenced by an opaque cookie.
`HttpOnly`, `Secure`, `SameSite=Lax`. The session id is regenerated on login and
on any privilege change. Not JWTs in local storage — a token readable by
JavaScript is a token an XSS bug hands over, and a stateless token cannot be
revoked.

**Rate limiting.** On login, on registration, on password reset, and on
verification resend. Per IP and per account identifier. Without it, the password
hash cost that protects a stolen database does nothing to protect a live login
form.

**Account enumeration.** Login failures, password resets and registration
collisions return the same response and take the same time whether or not the
address exists. Otherwise the login form is a membership oracle.

**Email verification.** Required before AI generation is reachable. Unverified
accounts may exist; they may not spend.

**Breached passwords.** Reject passwords found in the Have I Been Pwned range
API, which is queried by hash prefix and never sees the password. Cheap, and
it removes the most common failure by a wide margin.

**Logging.** Ids and outcomes. Never an email, a phone number, a password, a
session token or resume content — §6, and this is the rule most easily broken
by adding one helpful debug line.

**Headers.** A Content-Security-Policy, `Strict-Transport-Security`, and
`X-Content-Type-Options: nosniff`. The app renders user-supplied resume text;
CSP is what keeps a stored-XSS bug from becoming a session theft.

### Phone verification: designed, not enabled

The requirement as originally stated was one account per phone number and one
per email, neither reusable. The schema should support it from the start: a
nullable, unique, E.164-normalised `phone` column and a `phone_verified_at`
timestamp, so enabling it later is a backfill rather than a migration.

It should not be switched on at stage 2, for three reasons worth recording:

1. **It inverts the cost model.** SMS verification costs about $0.058 per
   attempt through the common providers ($0.05 platform fee plus the message).
   That is charged on signup, before the account has done anything. A stranger
   who registers and never returns costs real money, which is the opposite of
   how a free tier should fail.
2. **It solves a stage 3 problem.** Multiple accounts are only worth creating
   once each one carries free credits. At stage 2 there is nothing to farm.
3. **It is more personal data to hold.** A phone number is stronger identifying
   information than an email, held under the same §6 obligations, in exchange
   for protection against an attack that is not yet possible.

Enable it at stage 3, at the same time credits appear, and reconsider the
channel then — the platform fee dominates the message cost, so a plain SMS
gateway is several times cheaper than a managed verification product, and
per-account limits plus payment-method uniqueness may make it unnecessary
altogether.

## Stage 3: credits

Designed here, built when the app goes public. Keep the seams below intact so
this is an addition rather than a rewrite.

**The seam.** All AI generation goes through one function, the way all PDF
generation goes through `compileResume`. That function is the only place that
calls the model, and it is where the balance check, the token accounting and
the spend log live. If a second call site appears, the accounting is already
wrong.

**Balance.** An integer count of generations on the account, not a currency
amount. Currency invites rounding and refund arithmetic; a count does not. New
accounts start at 2.

**Ledger, not a counter.** Every grant and every spend is an append-only row
with a reason. A single mutable `credits` column cannot answer "why is this
zero" and cannot be audited after a bug.

**Per-request bounds, before the call.** `max_tokens` capped, input sizes
validated at the Zod boundary. The measured cost of one generation is roughly
$0.04 at Sonnet 5 pricing ($2/MTok in, $10/MTok out) for a request of about 6k
input and 2.5k output tokens. Log tokens and cost as numbers against an account
id — never the prompt, never the completion.

**Streaming.** Generation streams. A non-streaming request with a large
`max_tokens` risks idle-connection timeouts, and the SDK raises an error for
non-streaming requests expected to run long. Do not "fix" a timeout by
shortening it; a 2,500-token completion takes tens of seconds and a 15-second
ceiling fails almost every real request.

**Rate limits.** Per account and per IP, independent of balance. Balance stops
cost; rate limits stop a single account from consuming the whole workspace
budget in a minute.

**The global ceiling stays.** A spend cap on the provider workspace is the
backstop for every bug in the above. It is set before the first key is created,
not after, and it starts low.

## Stage 4: payments

Not designed here beyond the constraint that shapes everything else: this is
the largest single piece of remaining work, and it is not a checkout button. It
is a payment processor integration, a webhook that is idempotent because
processors retry, a purchase flow, receipts, refunds, failed-payment states, and
tax obligations that depend on jurisdiction.

The credit ledger from stage 3 is what makes it tractable — a purchase becomes
one more grant row. Build stage 3 without a ledger and stage 4 becomes a
rewrite.

## Order

1. Provider workspace with a spend cap, and the production key created inside it
2. Neon project, region matched to the compute region
3. `better-auth` with email and password, verification required, sessions in
   Postgres, phone column present and unused
4. AI generation behind a verified account, through a single seam, with
   per-request bounds and the global cap
5. Credits, ledger, per-account limits, phone verification if warranted
6. Payments

Steps 1 through 4 are stage 2 and are the current target. Nothing in them
becomes wasted work at step 5.
