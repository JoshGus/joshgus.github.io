var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var MAX_FRAME_BYTES = 96 * 1024;
var MAX_CLIENTS = 16;
var IDLE_MS = 30 * 60 * 1e3;
var CLOSE_ROOM_TAKEN = 4001;
var CLOSE_NO_HOST = 4002;
var CLOSE_ROOM_FULL = 4003;
var CLOSE_BAD_FRAME = 4004;
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response("ok", { headers: { "Cache-Control": "no-store" } });
    }
    const m = url.pathname.match(/^\/room\/([a-z0-9_-]{1,24})\/([A-Za-z0-9]{1,12})$/i);
    if (!m) return new Response("not found", { status: 404 });
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const gameId = m[1].toLowerCase();
    const code = m[2].toUpperCase();
    const id = env.ROOMS.idFromName(`${gameId}:${code}`);
    return env.ROOMS.get(id).fetch(request);
  }
};
var Room = class {
  static {
    __name(this, "Room");
  }
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  // Hibernation means this object can be evicted between messages, so socket
  // metadata lives on the sockets themselves rather than in instance fields.
  meta(ws) {
    try {
      return ws.deserializeAttachment() || {};
    } catch {
      return {};
    }
  }
  sockets() {
    return this.state.getWebSockets().map((ws) => ({ ws, ...this.meta(ws) }));
  }
  hostSocket() {
    return this.sockets().find((s) => s.role === "host") || null;
  }
  // Records activity and keeps the idle alarm armed. The timestamp is persisted
  // at most once a minute: the alarm has to survive hibernation, but writing on
  // every message would be pure waste.
  async touch() {
    this.last = Date.now();
    if (!this.lastPersist || this.last - this.lastPersist > 6e4) {
      this.lastPersist = this.last;
      await this.state.storage.put("last", this.last);
    }
    if (!this.alarmArmed) {
      this.alarmArmed = true;
      await this.state.storage.setAlarm(Date.now() + IDLE_MS);
    }
  }
  async alarm() {
    this.alarmArmed = false;
    const sockets = this.state.getWebSockets();
    if (!sockets.length) {
      await this.state.storage.deleteAll();
      return;
    }
    const last = await this.state.storage.get("last") || 0;
    const idle = Date.now() - last;
    if (idle >= IDLE_MS) {
      for (const ws of sockets) {
        try {
          ws.close(1e3, "room idle");
        } catch {
        }
      }
      await this.state.storage.deleteAll();
      return;
    }
    this.alarmArmed = true;
    await this.state.storage.setAlarm(Date.now() + (IDLE_MS - idle));
  }
  async fetch(request) {
    const url = new URL(request.url);
    const role = url.searchParams.get("role") === "host" ? "host" : "client";
    const existing = this.sockets();
    const host = existing.find((s) => s.role === "host");
    const pair = new WebSocketPair();
    const [clientEnd, serverEnd] = Object.values(pair);
    await this.touch();
    if (role === "host") {
      if (host) {
        serverEnd.accept();
        serverEnd.close(CLOSE_ROOM_TAKEN, "room code in use");
        return new Response(null, { status: 101, webSocket: clientEnd });
      }
      this.state.acceptWebSocket(serverEnd);
      serverEnd.serializeAttachment({ role: "host", id: 0 });
      return new Response(null, { status: 101, webSocket: clientEnd });
    }
    if (!host) {
      serverEnd.accept();
      serverEnd.close(CLOSE_NO_HOST, "no host for that code");
      return new Response(null, { status: 101, webSocket: clientEnd });
    }
    if (existing.filter((s) => s.role === "client").length >= MAX_CLIENTS) {
      serverEnd.accept();
      serverEnd.close(CLOSE_ROOM_FULL, "room full");
      return new Response(null, { status: 101, webSocket: clientEnd });
    }
    const hostMeta = this.meta(host.ws);
    const nextId = hostMeta.nextId || 1;
    host.ws.serializeAttachment({ ...hostMeta, nextId: nextId + 1 });
    this.state.acceptWebSocket(serverEnd);
    serverEnd.serializeAttachment({ role: "client", id: nextId });
    this.send(host.ws, { t: "open", id: nextId });
    return new Response(null, { status: 101, webSocket: clientEnd });
  }
  send(ws, obj) {
    try {
      ws.send(JSON.stringify(obj));
    } catch {
    }
  }
  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string") return;
    if (raw.length > MAX_FRAME_BYTES) {
      try {
        ws.close(CLOSE_BAD_FRAME, "frame too large");
      } catch {
      }
      return;
    }
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    await this.touch();
    const me = this.meta(ws);
    if (me.role === "host") {
      if (msg.t === "kick") {
        const victim = this.sockets().find((s) => s.role === "client" && s.id === msg.id);
        if (victim) try {
          victim.ws.close(1e3, "kicked");
        } catch {
        }
        return;
      }
      const to = msg.to;
      if (to === "*") {
        for (const s of this.sockets()) if (s.role === "client") this.send(s.ws, { d: msg.d });
        return;
      }
      const target = this.sockets().find((s) => s.role === "client" && s.id === to);
      if (target) this.send(target.ws, { d: msg.d });
      return;
    }
    const host = this.hostSocket();
    if (host) this.send(host.ws, { from: me.id, d: msg.d });
  }
  async webSocketClose(ws) {
    this.onGone(ws);
  }
  async webSocketError(ws) {
    this.onGone(ws);
  }
  async onGone(ws) {
    const me = this.meta(ws);
    const remaining = this.state.getWebSockets().filter((s) => s !== ws);
    if (!remaining.length) {
      try {
        await this.state.storage.deleteAll();
      } catch {
      }
      this.alarmArmed = false;
    }
    if (me.role === "host") {
      for (const s of this.sockets()) {
        if (s.role !== "client") continue;
        this.send(s.ws, { t: "hostgone" });
        try {
          s.ws.close(1e3, "host left");
        } catch {
        }
      }
      return;
    }
    const host = this.hostSocket();
    if (host) this.send(host.ws, { t: "close", id: me.id });
  }
};

// ../../../../.npm/_npx/d77349f55c2be1c0/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../.npm/_npx/d77349f55c2be1c0/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-bhVevw/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../../../.npm/_npx/d77349f55c2be1c0/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-bhVevw/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  Room,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
