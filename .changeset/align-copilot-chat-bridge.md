---
"pi-provider-ampersand-bridge": patch
---

Align catalog handling with the companion copilot-chat bridge: honor `reasoning_effort_default` (steering Pi's default `medium` thinking level when a model rejects `medium`), filter non-chat listings and canonicalize model ids in live discovery, accept live field aliases (`context_length` / `max_context_tokens` / `max_model_len`, `max_completion_tokens`, nested `pricing` object, `architecture.input_modalities`, vision name heuristics), retry transient `/models` failures with capped backoff and `Retry-After`, and add an `/ampersand-balance` command reporting `GET /billing/balance` credits and request allowances.
