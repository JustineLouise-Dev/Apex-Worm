/**
 * Cloudflare Worker — Apex Worm static server + multiplayer WebSocket
 * JANGAN edit file ini secara manual untuk mengganti game.
 * File ini adalah TEMPLATE. Untuk update game:
 *   1. Edit index.html (dan/atau game-engine.js, durable-object.js)
 *   2. Jalankan: node build-worker.js
 *   3. Jalankan: wrangler deploy
 */

const HTML_PAGE = `__INDEX_HTML__`;
const CSS_PAGE = `__STYLE_CSS__`;
const JS_PAGE = `__APP_JS__`;

__GAME_ENGINE__

__DURABLE_OBJECT__

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const id = env.APEX_WORM_ROOM.idFromName("global-room");
      const stub = env.APEX_WORM_ROOM.get(id);
      return stub.fetch(request);
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(HTML_PAGE, {
        headers: {
          "content-type": "text/html; charset=UTF-8",
          "cache-control": "public, max-age=300",
        },
      });
    }

    if (url.pathname === "/style.css") {
      return new Response(CSS_PAGE, {
        headers: {
          "content-type": "text/css; charset=UTF-8",
          "cache-control": "public, max-age=300",
        },
      });
    }

    if (url.pathname === "/app.js") {
      return new Response(JS_PAGE, {
        headers: {
          "content-type": "text/javascript; charset=UTF-8",
          "cache-control": "public, max-age=300",
        },
      });
    }

    if (url.pathname === "/health") {
      return new Response("OK", { status: 200 });
    }

    return new Response("Not Found", { status: 404 });
  },
};
