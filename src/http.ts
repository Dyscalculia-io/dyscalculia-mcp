#!/usr/bin/env node
import { createServer as createHttp } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createServer } from "./server.js";

/**
 * Hosted transport: stateless Streamable HTTP at POST /mcp.
 *
 * Stateless on purpose: every tool is read-only and none keeps session state,
 * so each request gets its own server and transport and nothing needs sticky
 * routing. There is no person-data path here, and no request body is logged.
 */
const port = Number(process.env.PORT ?? 3000);

createHttp(async (req, res) => {
  if (req.url === "/health") { res.writeHead(200).end("ok"); return; }
  if (req.url !== "/mcp") { res.writeHead(404).end(); return; }
  if (req.method !== "POST") { res.writeHead(405, { Allow: "POST" }).end(); return; }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > 100_000) { res.writeHead(413).end(); return; } chunks.push(c as Buffer); }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { res.writeHead(400).end(); return; }
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}).listen(port, () => console.error(`dyscalculia-mcp listening on :${port}/mcp`));
