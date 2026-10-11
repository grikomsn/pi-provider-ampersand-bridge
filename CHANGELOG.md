# Changelog

## 0.1.1

- Read the catalog's `reasoning_effort_default` (with bundled per-model defaults) and steer Pi's default `medium` thinking level to it when a model does not accept `medium` natively, matching the companion copilot-chat bridge.
- Filter non-chat listings (embedders, rerankers, image/audio/video models) from live discovery and canonicalize model ids (trimmed, lowercased) before catalog matching.
- Accept live catalog field aliases: `context_length` / `max_context_tokens` / `max_model_len`, `max_completion_tokens`, a nested `pricing` object, `architecture.input_modalities`, and `vision`-style name heuristics.
- Retry transient `/models` failures (429/502/503/504 and transient network errors) up to three attempts with capped backoff and `Retry-After` support; send `Accept: application/json, application/problem+json`.
- Add an `/ampersand-balance` command that reports remaining credits or today's request allowance from `GET /billing/balance`.

## 0.1.0

- Add an unofficial ai& provider for Pi using the OpenAI-compatible chat completions API: authenticated `/v1/models` discovery with live metadata (context, output, modalities, per-model reasoning efforts, USD pricing), a bundled fallback catalog, and `reasoning_effort` thinking control.
