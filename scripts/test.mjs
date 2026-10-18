// Protocol-level test: real client over stdio and over HTTP, every tool, plus the error paths.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const body = (r) => JSON.parse(r.content[0].text);
const call = (client, name, args = {}) => client.callTool({ name, arguments: args });

async function exercise(client, label) {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["explain_screening_test", "get_citation", "get_prevalence", "get_reference", "list_chart_data", "list_studies"]);
  for (const t of tools) assert.equal(t.annotations.readOnlyHint, true, `${t.name} must be read-only`);

  // get_prevalence
  const all = body(await call(client, "get_prevalence"));
  assert.equal(all.count, 10);
  assert.ok(all.entries.every((e) => e.ref && e.year && typeof e.calc === "boolean" && e.reference.citation));
  const il = body(await call(client, "get_prevalence", { study: "israel-1996" }));
  assert.equal(il.entries[0].pct, 6.5);
  assert.equal(il.entries[0].n, 3029);
  assert.equal(il.entries[0].ref, "grosstsur1996");
  assert.equal(il.entries[0].reference.pmid, "8606013");
  const a11 = body(await call(client, "get_prevalence", { age: 11 }));
  assert.deepEqual(a11.entries.map((e) => e.id), ["israel-1996"]);
  assert.ok(a11.notMatchedBecauseNoStatedAge.includes("brazil-2016"));
  const a12 = body(await call(client, "get_prevalence", { age: 12 }));
  assert.ok(a12.entries.some((e) => e.id === "england-devine-2018"));
  const rng = body(await call(client, "get_prevalence", { min_pct: 6.2, max_pct: 7 }));
  assert.ok(rng.entries.length >= 2 && rng.entries.every((e) => (e.hi ?? e.pct) >= 6.2 && (e.lo ?? e.pct) <= 7));
  assert.ok(/no worldwide pooled meta-analysis/i.test(all.note));
  const badStudy = await call(client, "get_prevalence", { study: "nope" });
  assert.equal(badStudy.isError, true);
  assert.match(badStudy.content[0].text, /israel-1996/);
  assert.equal((await call(client, "get_prevalence", { min_pct: 9, max_pct: 2 })).isError, true);

  // list_studies / get_reference
  const studies = body(await call(client, "list_studies"));
  assert.ok(studies.count > 20 && studies.studies.every((s) => s.citation && s.link && s.topics.length));
  const onlyPrev = body(await call(client, "list_studies", { topic: "persistence" }));
  assert.ok(onlyPrev.count > 0 && onlyPrev.count < studies.count);
  assert.equal((await call(client, "list_studies", { topic: "nope" })).isError, true);
  const ref = body(await call(client, "get_reference", { key: "shalev2000" }));
  assert.equal(ref.pmid, "11138905");
  assert.equal(ref.doi, "10.1007/s007870070009");
  assert.match(ref.citation, /Shalev/);
  const noDoi = body(await call(client, "get_reference", { key: "kosc1974" }));
  assert.equal(noDoi.pmid, undefined);
  assert.equal(noDoi.doi, "10.1177/002221947400700309");
  const web = body(await call(client, "get_reference", { key: "ncesDigest20430" }));
  assert.equal(web.doi, undefined);
  assert.match(web.url, /^https:\/\/nces\.ed\.gov/);
  const badRef = await call(client, "get_reference", { key: "shalev" });
  assert.equal(badRef.isError, true);
  assert.match(badRef.content[0].text, /shalev2000/);

  // explain_screening_test
  const ex = body(await call(client, "explain_screening_test"));
  assert.equal(ex.games.length, 5);
  assert.equal(ex.totalItems, 21);
  assert.equal(ex.games.reduce((a, g) => a + g.items, 0), 21);
  assert.equal(ex.thisToolDoesNotScoreAnyone, true);
  assert.equal(ex.timeLimitPerAnswer, null);
  assert.ok(!("itemSet" in ex.games[0]));
  const one = body(await call(client, "explain_screening_test", { game: "numberLine", include_items: true }));
  assert.deepEqual(one.games[0].itemSet.targets, [25, 67, 41]);
  assert.match(one.notADiagnosis, /does not diagnose/);
  assert.equal((await call(client, "explain_screening_test", { game: "x" })).isError, true);
  // nothing that looks like a person's result may ever be returned
  assert.ok(!/"(bands|strength|focus|percentile|yourScore)"\s*:/.test(JSON.stringify(ex)));
  assert.equal(ex.limits.norms, null);

  // list_chart_data
  const list = body(await call(client, "list_chart_data"));
  assert.equal(list.datasets.filter((d) => d.kind === "chart").length, 4);
  assert.equal(list.datasets.filter((d) => d.kind === "table").length, 3);
  assert.match(list.files.csv, /^https:\/\/dyscalculia\.io\/data\/dyscalculia-statistics\.csv$/);
  assert.ok(list.datasets.filter((d) => d.kind === "chart").every((d) => /^https:\/\/dyscalculia\.io\/data\/.+-chart-\d+\.svg$/.test(d.svg)));
  const c1 = body(await call(client, "list_chart_data", { id: "chart-1" }));
  assert.equal(c1.rows.length, 5);
  assert.equal(c1.rows[0].value, 6.5);
  const t5 = body(await call(client, "list_chart_data", { id: "table-5" }));
  assert.ok(t5.rows.every((r) => r.refs.length > 0));
  const badChart = await call(client, "list_chart_data", { id: "chart-2" });
  assert.equal(badChart.isError, true);
  assert.match(badChart.content[0].text, /chart-1/);

  // get_citation
  const cite = body(await call(client, "get_citation"));
  assert.equal(cite.license.name, "CC BY 4.0");
  assert.match(cite.citeAs, /Dyscalculia\.io/);
  assert.ok(cite.honestLimits.length >= 3);
  assert.match(cite.downloads.csv, /dyscalculia-statistics\.csv$/);

  // Wording: no treatment/therapy/cure claims anywhere in what the tools return.
  for (const t of tools) assert.ok(!/\b(therapy|cure)\b/i.test(t.description), t.name);
  console.log(`  ✓ ${label}: ${tools.length} tools, filters, errors, limits`);
}

{
  const client = new Client({ name: "test", version: "0" });
  await client.connect(new StdioClientTransport({ command: "node", args: ["dist/stdio.js"] }));
  await exercise(client, "stdio");
  await client.close();
}
{
  const port = 8793;
  const srv = spawn("node", ["dist/http.js"], { env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "ignore", "pipe"] });
  await new Promise((ok) => srv.stderr.once("data", ok));
  const client = new Client({ name: "test", version: "0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  await exercise(client, "http");
  await client.close();
  assert.equal((await fetch(`http://127.0.0.1:${port}/mcp`)).status, 405);
  assert.equal((await fetch(`http://127.0.0.1:${port}/nope`)).status, 404);
  assert.equal(await (await fetch(`http://127.0.0.1:${port}/health`)).text(), "ok");
  const big = await fetch(`http://127.0.0.1:${port}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ x: "a".repeat(120_000) }) });
  assert.equal(big.status, 413);
  const bad = await fetch(`http://127.0.0.1:${port}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" });
  assert.equal(bad.status, 400);
  srv.kill();
}
console.log("all good");
