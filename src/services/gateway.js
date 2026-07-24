import { config } from '../config.js';

/**
 * Client for the upstream OpenAI-compatible LLM gateway.
 *
 * TeamGPT never holds provider keys; it forwards chat requests to the gateway
 * with a single shared GATEWAY_API_KEY. The gateway handles providers,
 * fallback, caching, and global cost tracking.
 */

class GatewayError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'GatewayError';
    this.status = status || 502;
  }
}

function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.gateway.apiKey}`,
  };
}

/**
 * Streaming chat completion. Calls onDelta(text) for each content chunk and
 * resolves with the full assistant text once the stream completes.
 *
 * Requests `stream_options.include_usage` so the gateway appends a final chunk
 * with real token counts. `usage` is null if the gateway didn't provide it, in
 * which case the caller should fall back to estimating from the text.
 */
export async function chatStream({ model, messages, signal }, onDelta) {
  let res;
  try {
    res = await fetch(`${config.gateway.url}/v1/chat/completions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal,
    });
  } catch (err) {
    throw new GatewayError(`Cannot reach gateway: ${err.message}`, 502);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new GatewayError(data?.error?.message || `Gateway returned ${res.status}`, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let usage = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by blank lines.
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      for (const line of frame.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload);
          if (json.usage) {
            usage = {
              inputTokens: json.usage.prompt_tokens || 0,
              outputTokens: json.usage.completion_tokens || 0,
            };
          }
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            onDelta(delta);
          }
        } catch {
          // Ignore malformed frames.
        }
      }
    }
  }

  return { fullText, model, usage };
}

export { GatewayError };
