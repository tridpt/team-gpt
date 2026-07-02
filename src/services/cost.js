/**
 * Cost & token estimation, mirroring the gateway's pricing table.
 *
 * Prices are USD per 1,000,000 tokens. TeamGPT uses these to attribute an
 * approximate per-user cost for budgeting/fairness. The gateway remains the
 * source of truth for real provider spend; these are estimates for the team
 * layer (especially for streamed replies, where exact usage is not returned).
 */
const PRICING = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'claude-3-5-sonnet': { input: 3, output: 15 },
  'claude-3-5-haiku': { input: 0.8, output: 4 },
  'claude-3-opus': { input: 15, output: 75 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.0-flash-lite': { input: 0.075, output: 0.3 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gemini-1.5-pro': { input: 1.25, output: 5 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  'mock-gpt': { input: 0, output: 0 },
};

const DEFAULT_PRICING = { input: 1, output: 3 };

function priceFor(model = '') {
  if (PRICING[model]) return PRICING[model];
  const key = Object.keys(PRICING).find((k) => model.startsWith(k));
  return key ? PRICING[key] : DEFAULT_PRICING;
}

/** ~4 characters per token is the common heuristic for English text. */
export function estimateTokens(text = '') {
  return Math.ceil(String(text).length / 4);
}

export function estimateMessagesTokens(messages = []) {
  let total = 0;
  for (const m of messages) {
    total += estimateTokens(typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
    total += 4;
  }
  return total;
}

export function computeCost(model, inputTokens, outputTokens) {
  const p = priceFor(model);
  const cost = (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
  return Math.round(cost * 1e6) / 1e6;
}

export { PRICING };
