export const NODE_RED_HOSTS = {
  production: { protocol: "wss", host: "node-dev.iotaiml.dpdns.org" },
} as const;

type Host = (typeof NODE_RED_HOSTS)[keyof typeof NODE_RED_HOSTS];

const socketCache = new Map<string, SocketConnection>();
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
const timeoutIds = new Map<string, ReturnType<typeof setTimeout>>();
const pendingMessages = new Map<string, unknown[]>();

export const RECONNECT = {
  initialDelay: 1000,
  maxDelay: 30000,
  multiplier: 1.5,
  timeout: 8000,
} as const;

const MAX_PENDING_QUEUE = 50;

const buildUrl = (path: string, host: Host = NODE_RED_HOSTS.production) =>
  `${host.protocol}://${host.host}${path.startsWith("/") ? path : `/${path}`}`;

export const NODE_RED_WS_PATHS = {
  machine: "/ws/machine",
  robot: "/ws/robot",
  gripper: "/ws/gripper",
  joints: "/ws/joints",
  telemetry: "/ws/telemetry",
  orderData: "/ws/orderData",
  dateTime: "/ws/dateTime",
  placeOrder: "/ws/placeOrder",
  stop: "/ws/stop",
  reset: "/ws/reset",
  speak: "/ws/speak",
  voice: "/ws/voice",
} as const;

export type NodeRedPath = (typeof NODE_RED_WS_PATHS)[keyof typeof NODE_RED_WS_PATHS];

export const NODE_RED_WS_URLS = {
  machine: (host?: Host) => buildUrl(NODE_RED_WS_PATHS.machine, host),
  robot: (host?: Host) => buildUrl(NODE_RED_WS_PATHS.robot, host),
  gripper: (host?: Host) => buildUrl(NODE_RED_WS_PATHS.gripper, host),
  joints: (host?: Host) => buildUrl(NODE_RED_WS_PATHS.joints, host),
  telemetry: (host?: Host) => buildUrl(NODE_RED_WS_PATHS.telemetry, host),
  orderData: (host?: Host) => buildUrl(NODE_RED_WS_PATHS.orderData, host),
  dateTime: (host?: Host) => buildUrl(NODE_RED_WS_PATHS.dateTime, host),
  placeOrder: (host?: Host) => buildUrl(NODE_RED_WS_PATHS.placeOrder, host),
  stop: (host?: Host) => buildUrl(NODE_RED_WS_PATHS.stop, host),
  reset: (host?: Host) => buildUrl(NODE_RED_WS_PATHS.reset, host),
  speak: (host?: Host) => buildUrl(NODE_RED_WS_PATHS.speak, host),
  voice: (host?: Host) => buildUrl(NODE_RED_WS_PATHS.voice, host),
};

export type SocketHandlers = {
  onopen?: () => void;
  onmessage?: (_event: MessageEvent) => void;
  onerror?: (_event?: Event) => void;
  onclose?: (_event?: CloseEvent) => void;
};

class SocketConnection {
  path: string;
  socket: WebSocket | null = null;
  handlers: SocketHandlers = {};
  attempts = 0;
  closedManually = false;
  connecting = false;
  currentHost: Host = NODE_RED_HOSTS.production;

  constructor(path: string) {
    this.path = path;
  }

  getUrl() {
    return buildUrl(this.path, this.currentHost);
  }

  setHandlers(handlers: SocketHandlers) {
    this.handlers = { ...this.handlers, ...handlers };
  }

  connect(): WebSocket | null {
    if (typeof window === "undefined" || typeof WebSocket === "undefined") return null;
    if (this.socket?.readyState === WebSocket.OPEN) return this.socket;
    if (this.socket?.readyState === WebSocket.CONNECTING || this.connecting) return this.socket;

    this.closedManually = false;
    this.connecting = true;
    const url = this.getUrl();
    this.socket = new WebSocket(url);
    this.socket.onopen = () => this.onOpen();
    this.socket.onmessage = (event) => this.onMessage(event);
    this.socket.onerror = (event) => this.onError(event);
    this.socket.onclose = (event) => this.onClose(event);
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
        try {
          s.close();
        } catch {
          void 0;
        }
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

  onMessage(event: MessageEvent) {
    this.handlers.onmessage?.(event);
  }

  onError(event?: Event) {
    if (this.attempts <= 2) {
      console.debug(`WebSocket connection failed for ${this.getUrl()}`, event);
    }
    this.handlers.onerror?.(event);
  }

  onClose(event?: CloseEvent) {
    this.connecting = false;
    this.clearConnectTimeout();
    if (!this.closedManually) this.scheduleReconnect();
    this.handlers.onclose?.(event);
  }

  scheduleReconnect() {
    const hostKey = this.currentHost.host;
    const key = `${this.path}-${hostKey}`;
    const existing = reconnectTimers.get(key);
    if (existing) clearTimeout(existing);
    const delay = Math.min(RECONNECT.initialDelay * Math.pow(RECONNECT.multiplier, this.attempts), RECONNECT.maxDelay);
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

  send(payload: unknown): boolean {
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

  queue(payload: unknown) {
    if (!pendingMessages.has(this.path)) pendingMessages.set(this.path, []);
    const queue = pendingMessages.get(this.path)!;
    if (queue.length >= MAX_PENDING_QUEUE) queue.shift();
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
        try {
          s.close();
        } catch {
          void 0;
        }
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

export function getNodeRedSocket(path: string, handlers: SocketHandlers = {}): WebSocket | null {
  let connection = socketCache.get(path);
  if (!connection) {
    connection = new SocketConnection(path);
    socketCache.set(path, connection);
  }
  connection.setHandlers(handlers);
  return connection.connect();
}

export function sendNodeRedMessage(path: string, payload: unknown): boolean {
  const connection = socketCache.get(path);
  if (connection) return connection.send(payload);
  const tmp = new SocketConnection(path);
  socketCache.set(path, tmp);
  tmp.connect();
  return tmp.send(payload);
}

export function closeNodeRedSocket(path: string): void {
  const connection = socketCache.get(path);
  if (!connection) return;
  connection.close();
  socketCache.delete(path);
}
