// Client for llama-server's OpenAI-compatible chat endpoint, with streaming.
import { UpstreamError } from '../../utils/errors.js';

export class LlamaClient {
  constructor(engine) {
    this.engine = engine;
  }

  /**
   * Streams a chat completion. Yields `{ reasoning, content, finishReason, timings }`
   * for every chunk; `reasoning` is Qwen's thinking, `content` is the visible answer.
   * Aborting `signal` closes the connection, which makes llama-server stop generating.
   */
  async *streamChat(body, signal) {
    let res;
    try {
      res = await fetch(`${this.engine.url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, stream: true }),
        signal,
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      throw new UpstreamError(`Cannot reach llama-server: ${err.message}`, 503);
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new UpstreamError(data?.error?.message ?? `llama-server returned ${res.status}`, res.status < 500 ? 400 : 502);
    }

    // The response is Server-Sent Events: lines of `data: {json}`, ending with `data: [DONE]`.
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const bytes of res.body) {
      buffer += decoder.decode(bytes, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;

        let data;
        try {
          data = JSON.parse(payload);
        } catch {
          continue;
        }
        if (data.error) throw new UpstreamError(data.error.message ?? 'llama-server error', 502);
        const choice = data.choices?.[0];
        yield {
          reasoning: choice?.delta?.reasoning_content ?? '',
          content: choice?.delta?.content ?? '',
          finishReason: choice?.finish_reason ?? null,
          timings: data.timings ?? null,
        };
      }
    }
  }
}
