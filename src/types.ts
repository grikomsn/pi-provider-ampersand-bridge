export type AmpersandEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Live `GET /v1/models` entry. ai& field names have drifted over time, so the
 * parser accepts the aliases the sister copilot-chat bridge accepts.
 */
export type AmpersandApiModel = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  created?: unknown;
  /** Context window: `context_window`, or `context_length` / `max_context_tokens` / `max_model_len`. */
  context_window?: unknown;
  context_length?: unknown;
  max_context_tokens?: unknown;
  max_model_len?: unknown;
  /** Max output: `max_output_tokens`, or the OpenAI-style `max_completion_tokens`. */
  max_output_tokens?: unknown;
  max_completion_tokens?: unknown;
  capabilities?: unknown;
  input_modalities?: unknown;
  architecture?: unknown;
  reasoning_efforts?: unknown;
  reasoning_effort_default?: unknown;
  /** Boolean reasoning-capability probes some catalog versions emit (`reasoning_effort` doubles as the default string elsewhere). */
  reasoning_effort?: unknown;
  custom_reasoning?: unknown;
  /** Nested per-1M pricing object, or flat `input_per_1m`-style decimal strings. */
  pricing?: unknown;
  input_per_1m?: unknown;
  output_per_1m?: unknown;
  cached_input_per_1m?: unknown;
};

export type AmpersandModelsResponse = { data?: unknown };
