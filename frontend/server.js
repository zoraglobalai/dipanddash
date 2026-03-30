import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const port = Number(process.env.PORT || 4173);
const host = "0.0.0.0";
const distDir = resolve(process.cwd(), "dist");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

if (!existsSync(distDir)) {
  console.error("dist folder not found. Run `npm run build` before `npm start`.");
  process.exit(1);
}

const serveFile = (filePath, res) => {
  const ext = extname(filePath);
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
  });
  createReadStream(filePath).pipe(res);
};

createServer(async (req, res) => {
  let requestPath = "/";
  try {
    requestPath = decodeURIComponent((req.url || "/").split("?")[0]);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad Request");
    return;
  }

  const normalizedPath = normalize(requestPath)
    .replace(/^(\.\.[\\/])+/, "")
    .replace(/^[/\\]+/, "");
  const filePath = resolve(distDir, normalizedPath);

  if (!filePath.startsWith(distDir)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    serveFile(filePath, res);
    return;
  }

  if (requestPath === "/" || requestPath.startsWith("/")) {
    const indexPath = join(distDir, "index.html");
    if (existsSync(indexPath)) {
      const html = await readFile(indexPath);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not Found");
})
  .listen(port, host, () => {
    console.log(`Frontend server running on http://${host}:${port}`);
  })
  .on("error", (err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
