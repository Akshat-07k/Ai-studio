// Server-Sent Events: a long-lived HTTP response the server keeps writing to.
// Used both for the global event feed and for streaming chat replies.

export function openSse(res) {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
  res.flushHeaders();

  let closed = false;
  const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
  // Note: listen on `res`, not `req` - for POST requests `req` closes as soon as the body is read.
  res.on('close', () => {
    closed = true;
    clearInterval(ping);
  });

  return {
    get closed() {
      return closed;
    },
    send(event, data) {
      if (!closed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    end() {
      clearInterval(ping);
      if (!closed) res.end();
    },
  };
}
