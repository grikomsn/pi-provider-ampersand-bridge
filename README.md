<p align="center">
  <img src="assets/cover.jpg" alt="Ampersand Bridge provider for Pi" width="800">
</p>

# pi-provider-ampersand-bridge

[![npm](https://img.shields.io/npm/v/pi-provider-ampersand-bridge)](https://www.npmjs.com/package/pi-provider-ampersand-bridge)
[![CI](https://github.com/grikomsn/pi-provider-ampersand-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/grikomsn/pi-provider-ampersand-bridge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

An **unofficial** [Pi](https://github.com/earendil-works/pi-coding-agent) provider for the
[ai&](https://docs.aiand.com) OpenAI-compatible API at `api.aiand.com`. Not affiliated with or endorsed by ai&; it just talks to the public service with your own API key.

## Features

- Discovers **every model available to your key** from ai&'s authenticated `GET /v1/models` endpoint
- Ships the current ai& catalog as an offline fallback (DeepSeek, GLM, Kimi, Qwen, Gemma, GPT OSS, Motif)
- Uses live context, output, modality, reasoning-effort, and pricing metadata when ai& returns it
- Supports Pi's thinking selector through the standard OpenAI `reasoning_effort` request field
- Uses Pi's built-in OpenAI Chat Completions transport—no custom protocol or runtime dependency

## Install

```sh
pi install npm:pi-provider-ampersand-bridge
```

To try a local checkout:

```sh
pi -e ./src/index.ts
```

## Authenticate

Create a key in the [ai& console](https://console.aiand.com/settings/api-keys) and export it before starting Pi:

```sh
export AMPERSAND_API_KEY="your-key"
pi
```

You can instead store an API-key credential for the `ampersand` provider in Pi's `auth.json`, or override the provider in `models.json`.

Select a model with `/model`. Refresh the remote catalog with Pi's normal model refresh flow (`pi update --models`). If discovery is temporarily unavailable, the extension retains the last successful catalog, or the bundled fallback on first use. As with every authenticated Pi provider, models become selectable after a key is configured.

## Thinking effort

Use Pi's thinking-level control as usual. Each model advertises its own accepted efforts from the live catalog, and Pi never sends a level the model refuses:

- `deepseek-ai/*`, `zai-org/glm-5.2`, `google/gemma-4-31b-it`, `motif-technologies/motif-3`, `qwen/qwen3.6-27b` expose `off`, `high`, and (where listed) `max`
- `zai-org/glm-5.3*` and `moonshotai/kimi-k3` are always-on reasoners with `low`, `high`, and `max`
- `qwen/qwen3.8-27b` runs up to `xhigh`; `openai/gpt-oss-120b` caps at `high`
- `moonshotai/kimi-k2.7-code` always reasons at `high`

Models that do not accept `medium` natively map Pi's default `medium` level to the catalog's `reasoning_effort_default` (for example Kimi K3 defaults to `max`, Gemma 4 to `none`), so a fresh session starts at the effort ai& nominates.

## Model metadata

The fallback catalog mirrors the live `GET /v1/models` response (USD per million tokens):

| Model | Context | Max output | Input | Reasoning efforts |
| --- | ---: | ---: | --- | --- |
| `deepseek-ai/deepseek-v4.1-flash` | 1,048,576 | 384,000 | text, image | none, high, max |
| `zai-org/glm-5.3` | 1,048,576 | 131,072 | text | low, high, max |
| `zai-org/glm-5.3-flash` | 1,048,550 | 131,072 | text, image | low, high, max |
| `qwen/qwen3.8-27b` | 262,144 | 32,768 | text, image | none, low, medium, xhigh |
| `moonshotai/kimi-k3` | 1,048,576 | 131,072 | text, image | low, high, max |
| `zai-org/glm-5.2` | 1,048,576 | 131,072 | text | none, high, max |
| `google/gemma-4-31b-it` | 262,144 | 32,768 | text, image | none, high |
| `moonshotai/kimi-k2.7-code` | 262,144 | 262,144 | text, image | high |
| `motif-technologies/motif-3` | 262,144 | 262,144 | text | none, high |
| `deepseek-ai/deepseek-v4-flash` | 1,048,576 | 384,000 | text | none, high, max |
| `qwen/qwen3.6-27b` | 262,144 | 65,536 | text, image | none, high |
| `deepseek-ai/deepseek-v4-pro` | 1,048,576 | 384,000 | text | none, high, max |
| `openai/gpt-oss-120b` | 131,072 | 32,768 | text | low, medium, high |

An authenticated `/models` response replaces this list, so newly released or account-specific models appear without an extension release.

## Account balance

Run `/ampersand-balance` in a session to fetch `GET /billing/balance` for your configured key. The command reports remaining credits (USD or JPY) or, for pay-as-you-go accounts, the number of requests remaining in today's allowance.

## Catalog hardening

The live discovery pipeline mirrors the companion VS Code bridge so both projects see the same catalog:

- **Default reasoning effort**: the catalog's `reasoning_effort_default` (or the bundled per-model default) steers Pi's default `medium` thinking level whenever a model does not accept `medium` natively, so a fresh session lands on the effort ai& nominates.
- **Chat models only**: listings for embedders, rerankers, and image/audio/video models are filtered out, and model ids are canonicalized (trimmed, lowercased) before matching the bundled catalog.
- **Field aliases**: `context_length` / `max_context_tokens` / `max_model_len` are accepted alongside `context_window`, `max_completion_tokens` alongside `max_output_tokens`, and pricing is read from a nested `pricing` object (`prompt` / `completion` / `cache_prompt`) or the flat per-million strings. Image input falls back to `architecture.input_modalities` and `vision`-style names when no modality data is present.
- **Transient-failure retry**: `/models` and `/billing/balance` requests retry 429/502/503/504 responses and transient network errors up to three attempts with capped exponential backoff, honoring `Retry-After` (≤5s).

## Development

```sh
npm install
npm run check
npm run package
```

## Project

- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Release process](RELEASING.md)

## License

MIT
