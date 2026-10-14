import { createServer } from "node:http";
import { Buffer } from "node:buffer";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, relative, isAbsolute } from "node:path";
import process from "node:process";
import insightsHandler from "./api/insights.js";
import mentorHandler from "./api/mentor.js";

const distDirectory = resolve("dist");
const bodyLimit = 64 * 1024;
const handlers = new Map([
  ["/api/insights", insightsHandler],
  ["/api/mentor", mentorHandler],
]);
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > bodyLimit) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

async function serveStatic(request, response, pathname) {
  let requestedPath;
  try {
    requestedPath = decodeURIComponent(pathname);
  } catch {
    sendJson(response, 400, { error: "Invalid URL path." });
    return;
  }

  if (requestedPath.split("/").some((segment) => segment.startsWith("."))) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  const candidate = requestedPath === "/"
    ? resolve(distDirectory, "index.html")
    : resolve(distDirectory, `.${requestedPath}`);
  const relativePath = relative(distDirectory, candidate);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  let filePath = candidate;
  try {
    const fileInfo = await stat(filePath);
    if (!fileInfo.isFile()) filePath = resolve(distDirectory, "index.html");
  } catch {
    filePath = resolve(distDirectory, "index.html");
  }

  response.setHeader("content-type", contentTypes.get(extname(filePath).toLowerCase()) || "application/octet-stream");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("cache-control", filePath === resolve(distDirectory, "index.html") ? "no-cache" : "public, max-age=31536000, immutable");
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath)
    .on("error", (error) => {
      console.error("Could not serve the built app:", error);
      if (!response.headersSent) sendJson(response, 500, { error: "Could not serve the app." });
      else response.destroy(error);
    })
    .pipe(response);
}

const server = createServer(async (request, response) => {
  let pathname;
  try {
    pathname = new URL(request.url, "http://localhost").pathname;
  } catch {
    sendJson(response, 400, { error: "Invalid request URL." });
    return;
  }

  const handler = handlers.get(pathname);
  if (handler) {
    try {
      request.body = await readJsonBody(request);
      response.status = (status) => {
        response.statusCode = status;
        return response;
      };
      response.json = (body) => {
        response.setHeader("content-type", "application/json; charset=utf-8");
        response.end(JSON.stringify(body));
        return response;
      };
      await handler(request, response);
      if (!response.writableEnded) {
        console.error(`API handler did not complete its response: ${pathname}`);
        sendJson(response, 500, { error: "The server did not complete the API response." });
      }
    } catch (error) {
      if (response.writableEnded) return;
      const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
      if (status === 500) console.error("API request failed:", error);
      sendJson(response, status, { error: status === 500 ? "The server could not complete the request." : error.message });
    }
    return;
  }

  if (pathname.startsWith("/api/")) {
    sendJson(response, 404, { error: "API endpoint not found." });
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  await serveStatic(request, response, pathname);
});

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port number.");
}
if (!await stat(distDirectory).then((item) => item.isDirectory()).catch(() => false)) {
  throw new Error("The built app was not found. Run `npm run build` before starting the server.");
}

server.listen(port, "0.0.0.0", () => {
  console.log(`StudentPath is listening on port ${port}.`);
});
