// One Server-Sent Events feed that every open browser tab subscribes to.
// Services emit; this hub fans the events out to all connected clients.
import { EventEmitter } from 'node:events';
import { openSse } from '../utils/sse.js';

export class EventHub extends EventEmitter {
  constructor() {
    super();
    this.clients = new Set();
  }

  get size() {
    return this.clients.size;
  }

  attach(res, initialEvents = []) {
    const stream = openSse(res);
    for (const [event, data] of initialEvents) stream.send(event, data);
    this.clients.add(stream);
    this.emit('clients', this.clients.size);
    res.on('close', () => {
      this.clients.delete(stream);
      this.emit('clients', this.clients.size);
    });
  }

  broadcast(event, data) {
    for (const client of this.clients) client.send(event, data);
  }
}
