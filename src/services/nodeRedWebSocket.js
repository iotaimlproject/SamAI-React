const NODE_RED_HOSTS = {
  production: { protocol: 'wss', host: 'node-dev.iotaiml.dpdns.org' },
};

const socketCache = new Map();
const reconnectTimers = new Map();
const timeoutIds = new Map();
const pendingMessages = new Map();

export const RECONNECT = {
  initialDelay: 1000,
  maxDelay: 30000,
  multiplier: 1.5,
  timeout: 8000,
};

const MAX_PENDING_QUEUE = 50;

const buildUrl = (path, host = NODE_RED_HOSTS.production) =>
  `${host.protocol}://${host.host}${path.startsWith('/') ? path : `/${path}`}`;

export const NODE_RED_WS_PATHS = {
  machine: '/ws/machine',
  speak: '/ws/speak',
  voice: '/ws/voice',
  dashboard: '/ws/dashboard',
  stop: '/ws/stop',
  reset: '/ws/reset',
  placeOrder: '/ws/placeOrder',
  dateTime: '/ws/dateTime',
};

export const NODE_RED_WS_URLS = {
  machine: (host) => buildUrl(NODE_RED_WS_PATHS.machine, host),
  speak: (host) => buildUrl(NODE_RED_WS_PATHS.speak, host),
  voice: (host) => buildUrl(NODE_RED_WS_PATHS.voice, host),
  dashboard: (host) => buildUrl(NODE_RED_WS_PATHS.dashboard, host),
  stop: (host) => buildUrl(NODE_RED_WS_PATHS.stop, host),
  reset: (host) => buildUrl(NODE_RED_WS_PATHS.reset, host),
  placeOrder: (host) => buildUrl(NODE_RED_WS_PATHS.placeOrder, host),
  dateTime: (host) => buildUrl(NODE_RED_WS_PATHS.dateTime, host),
};

class SocketConnection {
  constructor(path) {
    this.path = path;
    this.socket = null;
    this.handlers = {};
    this.attempts = 0;
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

    this.closedManually = false;
    this.connecting = true;
    const url = this.getUrl();
    this.socket = new WebSocket(url);
    this.socket.onopen = () => this.onOpen();
    this.socket.onmessage = (event) => this.onMessage(event);
    this.socket.onerror = () => this.onError();
    this.socket.onclose = () => this.onClose();
    this.setConnectTimeout();
    return this.socket;
  }

  setConnectTimeout() {
    const key = `${this.path}-${this.currentHost.host}`;
    const existing = timeoutIds.get(key);
    if (existing) clearTimeout(existing);

    const id = setTimeout(() => {
      const s = this.socket;
      if (s?.readyState === WebSocket.CONNECTING) {
        s.onopen = null;
        s.onclose = null;
        s.onerror = null;
        s.onmessage = null;
        try { s.close(); } catch (_e) { void _e; }
      }
    }, RECONNECT.timeout);

    timeoutIds.set(key, id);
  }

  clearConnectTimeout() {
    const key = `${this.path}-${this.currentHost.host}`;
    const id = timeoutIds.get(key);
    if (id) {
      clearTimeout(id);
      timeoutIds.delete(key);
    }
  }

  onOpen() {
    this.connecting = false;
    this.clearConnectTimeout();
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
    this.clearConnectTimeout();

    if (!this.closedManually) {
      this.scheduleReconnect();
    }

    this.handlers.onclose?.();
  }

  scheduleReconnect() {
    const hostKey = this.currentHost.host;
    const key = `${this.path}-${hostKey}`;
    const existing = reconnectTimers.get(key);
    if (existing) clearTimeout(existing);

    const delay = Math.min(
      RECONNECT.initialDelay * Math.pow(RECONNECT.multiplier, this.attempts),
      RECONNECT.maxDelay
    );

    const timerId = setTimeout(() => {
      this.attempts += 1;
      this.connect();
    }, delay);

    reconnectTimers.set(key, timerId);
  }

  flushPending() {
    const queue = pendingMessages.get(this.path);
    if (!queue || queue.length === 0) return;
    if (this.socket?.readyState !== WebSocket.OPEN) return;

    while (queue.length > 0) {
      const payload = queue.shift();
      try {
        this.socket.send(JSON.stringify(payload));
      } catch {
        this.queue(payload);
        break;
      }
    }
    if (queue.length === 0) pendingMessages.delete(this.path);
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
    const queue = pendingMessages.get(this.path);
    if (queue.length >= MAX_PENDING_QUEUE) {
      queue.shift();
    }
    queue.push(payload);
  }

  close() {
    this.closedManually = true;

    const key = `${this.path}-${this.currentHost.host}`;
    const timer = reconnectTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      reconnectTimers.delete(key);
    }

    this.clearConnectTimeout();
    pendingMessages.delete(this.path);

    const s = this.socket;
    if (s) {
      if (s.readyState === WebSocket.OPEN) {
        try { s.close(); } catch (_e) { void _e; }
      } else if (s.readyState === WebSocket.CONNECTING) {
        s.onopen = null;
        s.onclose = null;
        s.onerror = null;
        s.onmessage = null;
      }
    }

    this.socket = null;
    this.connecting = false;
    this.attempts = 0;
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
