# Changelog

## 0.2.0

### Minor Changes

- 8e8a662: Refresh the bundled ai& fallback catalog to the 2026-11-09 live snapshot: add Kimi K3.1 Pro, Muse Spark Open, and DeepSeek V4.1 Flash 1017, drop the three models that reached end of support on 2026-10-27 (DeepSeek V4 Flash, Kimi K2.7 Code, GLM 5.2), and filter retired ids out of live listings so lingering-account catalogs never offer them.

## 0.1.2

### Patch Changes

- b44d25b: Register the catalog pi persisted for `ampersand` (`<agentDir>/models-store.json`, located with pi's `getAgentDir()`) instead of only the bundled fallback, so a saved `defaultProvider`/`defaultModel` on a model that only the live catalog lists resolves as soon as the provider is registered, before any refresh lands. A missing, unreadable, or malformed store, or one without usable chat rows, still registers the bundled fallback; `refreshModels` stays authoritative.

  Harden authenticated `/models` and `/billing/balance` requests: refuse redirects so the bearer key is never forwarded (and never retry a refused redirect), release discarded response bodies before retrying, stop backoff as soon as the request is aborted or times out, recognize string error causes as transient network failures, and stop reading negative `Retry-After` values as HTTP dates.

## 0.1.1

### Patch Changes

- f7af6fc: Align catalog handling with the companion copilot-chat bridge: honor `reasoning_effort_default` (steering Pi's default `medium` thinking level when a model rejects `medium`), filter non-chat listings and canonicalize model ids in live discovery, accept live field aliases (`context_length` / `max_context_tokens` / `max_model_len`, `max_completion_tokens`, nested `pricing` object, `architecture.input_modalities`, vision name heuristics), retry transient `/models` failures with capped backoff and `Retry-After`, and add an `/ampersand-balance` command reporting `GET /billing/balance` credits and request allowances.
- 49ec068: Add package cover artwork and Pi gallery image metadata.

## 0.1.0

- Add an unofficial ai& provider for Pi using the OpenAI-compatible chat completions API: authenticated `/v1/models` discovery with live metadata (context, output, modalities, per-model reasoning efforts, USD pricing), a bundled fallback catalog, and `reasoning_effort` thinking control.
