# Research: Hosting / Deployment Options

**Ticket:** GitHub issue #5 ("Research: hosting/deployment options"), part of tracking issue #1.
**Date:** 2026-09-23
**Scope:** Compare hosting platforms for "JG Club Penguin" — a realtime, WebSocket-based, per-Room-Presence multiplayer 2D game — against the constraints of a 3-day hackathon team of 4 web developers with no prior devops/game-dev experience, who must ship a live, demo-able, shareable URL by end of day 3, on a free/low-cost budget, explicitly wanting to avoid AWS unless clearly necessary.

> Note: there is no pre-existing convention for research write-ups in this repo. This file establishes `docs/research/` as that location, per the parent ticket's instructions.

All claims below are cited to primary sources (official docs/pricing pages) fetched on 2026-09-23. Where an official page did not explicitly state something (e.g. a credit-card requirement), that gap is noted rather than filled from a secondary source.

---

## Summary / Recommendation

**Recommended platform: Render.**

Render is the best fit for this team's constraints because it is the only candidate that combines (a) explicit, documented support for long-lived inbound WebSocket connections on a normal web service, (b) a genuinely free tier that includes a free custom domain with managed TLS and requires no Dockerfile or CLI to deploy (native git-push deploys with automatic language detection for Node.js and friends), and (c) dashboard-driven setup simple enough for developers with zero devops background to go from a GitHub repo to a live URL in minutes. Its one real weakness — free web services spin down after 15 minutes of inactivity and take about a minute to cold-start back up ([Render Docs: Free instance types](https://render.com/docs/free), [Render Docs: Deploy for Free](https://render.com/docs/free)) — is a manageable risk for a hackathon (keep the room "warm" during dev/testing) and can be eliminated for the end-of-day-3 demo itself by upgrading the one demo service to Render's $7/month "Starter" always-on instance for the day of the demo ([Render pricing, per search of render.com pricing](https://render.com/docs/free)), which stays comfortably inside the team's "free/low-cost" budget. Competing platforms are each weaker on the dimensions that matter most here: Vercel and Netlify are fundamentally serverless-function platforms whose free tiers cannot host a stateful long-lived multiplayer socket (see compatibility section below); Fly.io has the most technically capable persistent-VM model but no longer offers a standing free tier (only a 2-hour/7-day trial before a credit card and usage billing kick in) and its Dockerfile/`fly.toml`/`flyctl`-centric workflow is a heavier devops lift for a team with no prior experience; Railway is a strong runner-up with genuinely solid WebSocket support and simple git-based deploys, but its free tier is thinner (one-time $5 trial credit expiring in 30 days, then only $1/month after) and custom domains are not available at all on its free plan, only from the paid Hobby tier ($5/month) up.

---

## Per-Platform Comparison

### Vercel

- **Free tier ("Hobby"):** $0/month, intended for personal/non-commercial projects; includes global CDN, automatic HTTPS, 100 GB/month data transfer, 1M edge requests/month, 1M function invocations/month, and 4 hours/month of "Fluid Active CPU" compute. Custom domains are supported on Hobby at no charge (up to 50 per project), plus a free `*.vercel.app` subdomain. The pricing page did not explicitly state whether a credit card is required to sign up. ([Vercel Pricing](https://vercel.com/pricing), [Vercel Docs: Plans](https://vercel.com/docs/plans))
- **WebSocket support:** Historically, Vercel Functions ran as short-lived serverless invocations and could not host persistent WebSocket servers. As of a **Public Beta announced June 22, 2026**, Vercel Functions now natively support WebSocket connections (compatible with `ws` and Socket.IO) — but connections are still bound by the **function max-duration limit**, which on the **Hobby (free) plan is 300 seconds (5 minutes), and is both the default and the hard maximum** — there is no way to extend it on the free tier. Pro/Enterprise can extend to 800s (generally available) or up to 1800s (beta). Established connections are pinned to a single function instance for that duration, and Vercel recommends external Redis for state that must survive reconnects. ([Vercel Docs: Functions Limits](https://vercel.com/docs/functions/limitations), [Vercel Changelog: WebSocket support is now in Public Beta](https://vercel.com/changelog/websocket-support-is-now-in-public-beta), [Vercel KB: Do Vercel Serverless Functions support WebSocket connections?](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections))
- **Verdict:** A 5-minute hard cap on every connection on the free tier (with forced reconnection/resume logic required) is a poor fit for a continuous multiplayer game session, and the feature is still in public beta. **Not recommended** for this project despite the recent beta support — see compatibility callout below.
- **Deploy speed/simplicity:** Excellent for git-push deploys of standard frontend frameworks; no Dockerfile required. Not evaluated further given the WebSocket limitation.

### Netlify

- **Free tier:** $0/month with a 300-credit/month allowance (credits meter compute, bandwidth, etc.), custom domains with automatic SSL included at no charge, serverless Functions, Blob/Database storage. The official pricing page did not state whether a credit card is required. ([Netlify Pricing](https://www.netlify.com/pricing/))
- **WebSocket support:** Netlify Functions run as short-lived serverless invocations (AWS Lambda-based) with a **10-second synchronous execution timeout on the free tier**, or up to 15 minutes for asynchronous "Background Functions" — but background functions are fire-and-forget batch jobs, not persistent duplex connections. Netlify's own support forum and community confirm Netlify Functions **do not support WebSockets** — there is no mechanism to hold an open, bidirectional, long-lived socket. ([Netlify Docs: Functions Overview](https://docs.netlify.com/functions/overview/), [Netlify Docs: Background Functions overview](https://docs.netlify.com/build/functions/background-functions/), [Netlify Support Forum: Does Netlify support websocket programming?](https://answers.netlify.com/t/does-netlify-support-websocket-programming/4213))
- **Verdict:** **Incompatible** with a persistent multiplayer realtime backend. Ruled out.
- **Deploy speed/simplicity:** Excellent for static/JAMstack sites; irrelevant here given the hard WebSocket incompatibility.

### Fly.io

- **Free tier:** Fly.io **no longer offers a standing free tier for new signups** as of 2026. New accounts instead get a **time-limited free trial: 2 hours of machine runtime OR 7 days of access, whichever comes first**, covering up to 10 machines (2 vCPU/4GB each) and 20GB of volume storage, no credit card required to start. Once the trial's time or resource limit is exhausted, apps stop and you cannot deploy further changes until a credit card is added and billing begins (pure usage-based pricing from then on — compute, $0.15/GB/month storage, $0.02–$0.12/GB egress). Only legacy accounts predating this policy change retain the old permanent free allowance. A credit card is required on file for all non-linked organizations. ([Fly.io Docs: Pricing](https://fly.io/docs/about/pricing/), [Fly.io Docs: Free Trial](https://fly.io/docs/about/free-trial/))
- **WebSocket support:** Fly.io runs actual persistent VMs ("Machines"), not serverless functions, so it natively and fully supports long-running processes, background workers, and persistent WebSocket connections with no execution-time cap. Technically the strongest option of the five. ([Fly.io Docs: Pricing](https://fly.io/docs/about/pricing/))
- **Deploy speed/simplicity:** Requires the `flyctl` CLI and typically a Dockerfile/`fly.toml` to define the app — more configuration surface than a pure git-push platform, and a steeper first-deploy learning curve for a team with zero devops experience, though still manageable in a few hours.
- **Custom domains:** Supported, standard DNS-based setup once on a paid/trial account.
- **Verdict:** Technically excellent for realtime, but the loss of a standing free tier plus the CLI/Dockerfile-centric workflow make it a heavier lift than Render for this specific team and timeline.

### Render

- **Free tier:** $0/month. You can deploy a web service, a PostgreSQL database, and a static frontend **without writing a Dockerfile, installing a CLI, or (per Render's own docs) entering credit-card information** — deploys are git-push/dashboard-driven with native language detection (Node.js, Python, Go, Rust, Elixir, PHP, etc.) or an optional Docker runtime if you want one. Free web services get 750 instance-hours/month, custom domains with managed TLS at no extra cost, and connect to a free Postgres database (1GB, expires after 30 days). Render's own feedback board shows some user reports of being asked for card verification as an anti-abuse measure, so this may vary; the official docs state it is not required. ([Render Docs: Deploy for Free](https://render.com/docs/free), [Render Feature Feedback: Credit card required for free plan?](https://feedback.render.com/features/p/credit-card-required-for-free-plan))
- **Free-tier time-boxing:** Free web services **spin down after 15 minutes with no inbound traffic** (HTTP requests or WebSocket messages both count as activity) and take about a minute to spin back up on the next request/connection. This is the main risk for a demo — if the game sits idle right before the judges load it, there's a ~1 minute cold-start delay.
- **WebSocket support:** Explicitly documented and fully supported — "Render web services can accept inbound WebSocket connections from the public internet." Use `wss://` (not `ws://`) since connections start as an HTTP handshake on the same port as other traffic; no maximum connection-duration limit is imposed (connections only close on instance shutdown/redeploy, with a 30–300s graceful-shutdown grace period). No special plan requirement — works on the free tier. ([Render Docs: WebSocket support](https://render.com/docs/websocket), [Render Docs: Web Services](https://render.com/docs/web-services))
- **Deploy speed/simplicity:** Among the simplest of the five for a zero-devops team — connect a GitHub repo, Render auto-detects the Node.js app, no Dockerfile or CLI required (though Docker is available if wanted later).
- **Custom domains:** Free, including managed TLS, on the free tier itself — no upgrade needed for a shareable demo URL.
- **Verdict:** Best overall fit for this team and timeline.

### Railway

- **Free tier / trial:** New accounts get a **one-time $5 trial credit, expiring after 30 days or when exhausted**, no credit card required to start. After the trial, accounts roll onto Railway's standing **Free plan, which grants only $1/month in credit** (does not accumulate) — realistically not enough to keep an always-on service running for long. The paid **Hobby plan is $5/month** (includes $5 of usage credit) and is the realistic entry point for anything beyond a short trial window. Stateful volumes created on trial accounts are deleted 30 days after credit expiration. ([Railway Docs: Free Trial](https://docs.railway.com/pricing/free-trial), [Railway Pricing](https://railway.com/pricing))
- **Custom domains:** **Zero custom domains on the Free plan**; 1 on Free Trial, 2 on Hobby ($5/mo), 20 on Pro ($20/mo). For a shareable custom demo link the team would need at least the Hobby tier. ([Railway Pricing](https://railway.com/pricing))
- **WebSocket support:** Strong and explicit — Railway's own guides state WebSocket connections are **exempt from inactivity/request timeouts and can stay open indefinitely** (unlike Server-Sent Events, which are capped at 15 minutes on Railway). Railway natively proxies HTTP, TCP, gRPC, and WebSockets. ([Railway Guides: Deploy a WebSocket app with Socket.IO](https://docs.railway.com/guides/socketio), [Railway Guides: Choose Between SSE and WebSockets](https://docs.railway.com/guides/sse-vs-websockets))
- **Deploy speed/simplicity:** Very simple — git-push deploys via auto-detected Nixpacks builds, no Dockerfile required, dashboard-driven config comparable to Render.
- **Verdict:** A strong, close second choice. Fully WebSocket-compatible and easy to deploy, but the free tier is too thin to comfortably host an always-on multiplayer service for 3 days, and a custom domain requires the $5/month Hobby plan. Still well within "low-cost," and worth keeping as the team's fallback if Render's spin-down behavior becomes a problem.

### Other candidates considered and not included

- **Glitch** — considered as a historically popular free Node.js host, but **Glitch shut down its hosting platform on July 8, 2025** and is no longer available. Excluded.
- **Cyclic.sh** — considered but excluded; it discontinued its free serverless-Node offering prior to this research and is no longer a viable candidate (not independently re-verified against a primary source since it's out of scope once confirmed defunct — flagging for the team to double check if they'd previously heard of it).
- **Plain VPS (DigitalOcean/Oracle Cloud/Linode, etc.)** — technically fully WebSocket-capable (it's just a Linux box), but requires the team to manage their own process supervision, TLS certificates, reverse proxy, OS patching, and deployment pipeline from scratch — the opposite of "zero devops, 3 days." Excluded as not competitive for this team's constraints, though it remains an option if every PaaS candidate turned out incompatible (none did).

---

## WebSocket Compatibility Callout

This is the load-bearing constraint for whatever realtime backend (Socket.IO, `ws`, Colyseus, etc.) the parallel research ticket selects — **the backend needs a host that keeps a process alive and reachable for the duration of a player's session**, not a request/response serverless function.

| Platform | Long-lived WebSocket compatible? | Notes |
|---|---|---|
| **Vercel** | ⚠️ **Risky / not recommended** | Gained WebSocket support only in **public beta (June 2026)**, and even then every connection is hard-capped at **300 seconds (5 minutes) on the free Hobby plan** with no way to extend it — a multiplayer session longer than 5 minutes will be forcibly cut and must reconnect. Treat as incompatible for this use case. |
| **Netlify** | ❌ **Incompatible** | Functions are short-lived serverless invocations (10s sync / 15min max async background jobs); Netlify's own support channels confirm no WebSocket support. Off the table entirely. |
| **Fly.io** | ✅ **Compatible** | Runs real persistent VMs/processes; no execution-time cap on connections. Best technical fit, but no standing free tier as of 2026 (trial only) and a heavier CLI/Dockerfile deploy workflow. |
| **Render** | ✅ **Compatible** | Explicitly documented inbound WebSocket support on standard web services, including the free tier; no connection-duration cap (only closes on redeploy/shutdown, with a grace period). Recommended platform. |
| **Railway** | ✅ **Compatible** | WebSocket connections explicitly exempted from Railway's inactivity/timeout policies and can stay open indefinitely. Strong runner-up. |

**Bottom line for the realtime-backend ticket:** Vercel and Netlify are off the table regardless of which realtime library is chosen — they cannot host a persistent, stateful multiplayer connection on their free/default deployment model. Fly.io, Render, and Railway are all viable hosts for any standard Node.js WebSocket server (raw `ws`, Socket.IO, Colyseus, etc.); the choice among those three should be driven by the deploy-simplicity and free-tier tradeoffs above, not by WebSocket capability, since all three handle it natively.

---

## Sources

- [Vercel Pricing](https://vercel.com/pricing)
- [Vercel Docs: Plans](https://vercel.com/docs/plans)
- [Vercel Docs: Functions Limits](https://vercel.com/docs/functions/limitations)
- [Vercel Changelog: WebSocket support is now in Public Beta](https://vercel.com/changelog/websocket-support-is-now-in-public-beta)
- [Vercel KB: Do Vercel Serverless Functions support WebSocket connections?](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections)
- [Netlify Pricing](https://www.netlify.com/pricing/)
- [Netlify Docs: Functions Overview](https://docs.netlify.com/functions/overview/)
- [Netlify Docs: Background Functions overview](https://docs.netlify.com/build/functions/background-functions/)
- [Netlify Support Forum: Does Netlify support websocket programming?](https://answers.netlify.com/t/does-netlify-support-websocket-programming/4213)
- [Fly.io Docs: Resource Pricing](https://fly.io/docs/about/pricing/)
- [Fly.io Docs: Free Trial](https://fly.io/docs/about/free-trial/)
- [Render Docs: Deploy for Free](https://render.com/docs/free)
- [Render Docs: Web Services](https://render.com/docs/web-services)
- [Render Docs: WebSocket support](https://render.com/docs/websocket)
- [Render Feature Feedback: Credit card required for free plan?](https://feedback.render.com/features/p/credit-card-required-for-free-plan)
- [Railway Pricing](https://railway.com/pricing)
- [Railway Docs: Free Trial](https://docs.railway.com/pricing/free-trial)
- [Railway Guides: Deploy a WebSocket Application with Socket.IO](https://docs.railway.com/guides/socketio)
- [Railway Guides: Choose Between SSE and WebSockets](https://docs.railway.com/guides/sse-vs-websockets)
- Glitch shutdown (July 8, 2025) noted via general web search; no primary Glitch source remains live to cite directly since the service itself is discontinued.
