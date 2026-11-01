---
"pi-provider-ampersand-bridge": patch
---

Register the catalog pi persisted for `ampersand` (`<agentDir>/models-store.json`, located with pi's `getAgentDir()`) instead of only the bundled fallback, so a saved `defaultProvider`/`defaultModel` on a model that only the live catalog lists resolves as soon as the provider is registered, before any refresh lands. A missing, unreadable, or malformed store, or one without usable chat rows, still registers the bundled fallback; `refreshModels` stays authoritative.

Harden authenticated `/models` and `/billing/balance` requests: refuse redirects so the bearer key is never forwarded (and never retry a refused redirect), release discarded response bodies before retrying, stop backoff as soon as the request is aborted or times out, recognize string error causes as transient network failures, and stop reading negative `Retry-After` values as HTTP dates.
