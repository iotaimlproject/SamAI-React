const NODE_RED_HOSTS = {
  production: { protocol: 'wss', host: 'node-dev.iotaiml.dpdns.org' },
};

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

const buildUrl = (path, host = NODE_RED_HOSTS.production) =>
  `${host.protocol}://${host.host}${path.startsWith('/') ? path : `/${path}`}`;

export const NODE_RED_WS_URLS = {
  machine: (host) => buildUrl('/ws/machine', host),
  speak: (host) => buildUrl('/ws/speak', host),
  voice: (host) => buildUrl('/ws/voice', host),
  dashboard: (host) => buildUrl('/ws/dashboard', host),
  stop: (host) => buildUrl('/ws/stop', host),
  reset: (host) => buildUrl('/ws/reset', host),
  placeOrder: (host) => buildUrl('/ws/placeOrder', host),
  dateTime: (host) => buildUrl('/ws/dateTime', host),
};

class SocketConnection {
  constructor(path) {
    this.path = path;
    this.socket = null;
    this.handlers = {};
    this.attempts = 0;
    this.delay = RECONNECT.initialDelay;
    this.closedManually = false;
    this.connecting = false;
    this.currentHost = NODE_RED_HOSTS.production;
  }

  getUrl() {
    return buildUrl(this.path, this.currentHost);
  }

  setHandlers(handlers) {
    this.handlers = { ...this.handlers, ...handlers };
  }

  connect() {
    if (this.socket?.readyState === WebSocket.OPEN) return this.socket;
    if (this.socket?.readyState === WebSocket.CONNECTING || this.connecting) return this.socket;

    this.connecting = true;
    const url = this.getUrl();
    this.socket = new WebSocket(url);
    this.socket.onopen = () => this.onOpen();
    this.socket.onmessage = (event) => this.onMessage(event);
    this.socket.onerror = () => this.onError();
    this.socket.onclose = () => this.onClose();
    this.setTimeout();
    return this.socket;
  }

  setTimeout() {
    const key = `${this.path}-${this.currentHost.host}`;
    const existing = timeoutIds.get(key);
    if (existing) clearTimeout(existing);

    const id = setTimeout(() => {
      if (this.socket?.readyState === WebSocket.CONNECTING) {
        this.socket.close();
      }
    }, RECONNECT.timeout);

    timeoutIds.set(key, id);
  }

  clearTimeout() {
    const key = `${this.path}-${this.currentHost.host}`;
    const id = timeoutIds.get(key);
    if (id) {
      clearTimeout(id);
      timeoutIds.delete(key);
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
    if (this.attempts <= 2) {
      console.debug(`WebSocket connection failed for ${this.getUrl()}`);
    }
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
    const hostKey = this.currentHost.host;
    const existing = reconnectTimers.get(`${this.path}-${hostKey}`);
    if (existing) clearTimeout(existing);

    const delay = Math.min(
      this.delay * Math.pow(RECONNECT.multiplier, this.attempts),
      RECONNECT.maxDelay
    );

    const timerId = setTimeout(() => {
      this.attempts += 1;
      this.connect();
    }, delay);

    reconnectTimers.set(`${this.path}-${hostKey}`, timerId);
    this.delay = delay;
  }

  flushPending() {
    const queue = pendingMessages.get(this.path);
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
    if (!pendingMessages.has(this.path)) {
      pendingMessages.set(this.path, []);
    }
    pendingMessages.get(this.path).push(payload);
  }

  close() {
    this.closedManually = true;

    const timer = reconnectTimers.get(`${this.path}-${this.currentHost.host}`);
    if (timer) {
      clearTimeout(timer);
      reconnectTimers.delete(`${this.path}-${this.currentHost.host}`);
    }

    this.clearTimeout();
    pendingMessages.delete(this.path);

    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) {
      this.socket.close();
    }

    this.socket = null;
    this.connecting = false;
  }
}

export function getNodeRedSocket(path, handlers = {}) {
  let connection = socketCache.get(path);

  if (!connection) {
    connection = new SocketConnection(path);
    socketCache.set(path, connection);
  }

  connection.setHandlers(handlers);
  return connection.connect();
}

export function sendNodeRedMessage(path, payload) {
  const connection = socketCache.get(path);

  if (!connection) return false;
  return connection.send(payload);
}

export function closeNodeRedSocket(path) {
  const connection = socketCache.get(path);

  if (!connection) return;

  connection.close();
  socketCache.delete(path);
}
