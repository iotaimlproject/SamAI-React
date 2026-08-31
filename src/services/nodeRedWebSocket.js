const NODE_RED_HOST = 'node-dev.iotaiml.dpdns.org';
const NODE_RED_PROTOCOL = 'wss';

const socketCache = new Map();
const reconnectTimers = new Map();
const timeoutIds = new Map();
const pendingMessages = new Map();

const RECONNECT = {
  initialDelay: 1000,
  maxDelay: 30000,
  multiplier: 1.5,
  timeout: 8000,
};

const buildUrl = (path) =>
  `${NODE_RED_PROTOCOL}://${NODE_RED_HOST}${path.startsWith('/') ? path : `/${path}`}`;

export const NODE_RED_WS_URLS = {
  machine: buildUrl('/ws/machine'),
  speak: buildUrl('/ws/speak'),
  voice: buildUrl('/ws/voice'),
  dashboard: buildUrl('/ws/dashboard'),
  stop: buildUrl('/ws/stop'),
  reset: buildUrl('/ws/reset'),
  placeOrder: buildUrl('/ws/placeOrder'),
  dateTime: buildUrl('/ws/dateTime'),
};

class SocketConnection {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.handlers = {};
    this.attempts = 0;
    this.delay = RECONNECT.initialDelay;
    this.closedManually = false;
    this.connecting = false;
  }

  setHandlers(handlers) {
    this.handlers = { ...this.handlers, ...handlers };
  }

  connect() {
    if (this.socket?.readyState === WebSocket.OPEN) return this.socket;
    if (this.socket?.readyState === WebSocket.CONNECTING || this.connecting) return this.socket;

    this.connecting = true;
    this.socket = new WebSocket(this.url);
    this.socket.onopen = () => this.onOpen();
    this.socket.onmessage = (event) => this.onMessage(event);
    this.socket.onerror = () => this.onError();
    this.socket.onclose = () => this.onClose();
    this.setTimeout();
    return this.socket;
  }

  setTimeout() {
    const existing = timeoutIds.get(this.url);
    if (existing) clearTimeout(existing);

    const id = setTimeout(() => {
      if (this.socket?.readyState === WebSocket.CONNECTING) {
        this.socket.close();
      }
    }, RECONNECT.timeout);

    timeoutIds.set(this.url, id);
  }

  clearTimeout() {
    const id = timeoutIds.get(this.url);
    if (id) {
      clearTimeout(id);
      timeoutIds.delete(this.url);
    }
  }

  onOpen() {
    this.connecting = false;
    this.clearTimeout();
    this.delay = RECONNECT.initialDelay;
    this.attempts = 0;
    this.flushPending();
    this.handlers.onopen?.();
  }

  onMessage(event) {
    this.handlers.onmessage?.(event);
  }

  onError() {
    this.handlers.onerror?.();
  }

  onClose() {
    this.connecting = false;
    this.clearTimeout();

    if (!this.closedManually) {
      this.scheduleReconnect();
    }

    this.handlers.onclose?.();
  }

  scheduleReconnect() {
    const existing = reconnectTimers.get(this.url);
    if (existing) clearTimeout(existing);

    const delay = Math.min(
      this.delay * Math.pow(RECONNECT.multiplier, this.attempts),
      RECONNECT.maxDelay
    );

    const timerId = setTimeout(() => {
      this.attempts += 1;
      this.connect();
    }, delay);

    reconnectTimers.set(this.url, timerId);
    this.delay = delay;
  }

  flushPending() {
    const queue = pendingMessages.get(this.url);
    if (!queue) return;

    while (queue.length > 0) {
      const payload = queue.shift();
      this.send(payload);
    }
  }

  send(payload) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify(payload));
        return true;
      } catch {
        this.queue(payload);
        return false;
      }
    }

    this.queue(payload);
    return false;
  }

  queue(payload) {
    if (!pendingMessages.has(this.url)) {
      pendingMessages.set(this.url, []);
    }
    pendingMessages.get(this.url).push(payload);
  }

  close() {
    this.closedManually = true;

    const timer = reconnectTimers.get(this.url);
    if (timer) {
      clearTimeout(timer);
      reconnectTimers.delete(this.url);
    }

    this.clearTimeout();
    pendingMessages.delete(this.url);

    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) {
      this.socket.close();
    }

    this.socket = null;
    this.connecting = false;
  }
}

export function getNodeRedSocket(path, handlers = {}) {
  const url = buildUrl(path);
  let connection = socketCache.get(url);

  if (!connection) {
    connection = new SocketConnection(url);
    socketCache.set(url, connection);
  }

  connection.setHandlers(handlers);
  return connection.connect();
}

export function sendNodeRedMessage(path, payload) {
  const url = buildUrl(path);
  const connection = socketCache.get(url);

  if (!connection) return false;
  return connection.send(payload);
}

export function closeNodeRedSocket(path) {
  const url = buildUrl(path);
  const connection = socketCache.get(url);

  if (!connection) return;

  connection.close();
  socketCache.delete(url);
}
