import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { SITE, STUDY_IDS, TOPICS, bands, cited, refBrief, refByKey, references, screening, span, statistics } from "./data.js";

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const fail = (message: string) => ({ isError: true, content: [{ type: "text" as const, text: message }] });
const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

const GUIDE =
  "These are published research estimates, not a diagnosis of any person. There is no worldwide pooled meta-analysis of dyscalculia prevalence: the 'worldwide' entry is a range across population studies. Studies use different criteria and ages, so figures are not directly comparable.";

const DATASET_IDS = [...statistics.charts, ...statistics.tables].map((d) => d.id);
const GAME_ORDER = screening.test.games.map((g) => g.key);

/**
 * Every tool is read-only and returns published figures from the dataset. Nothing here scores
 * a person, returns a screening result or gives advice about a learning difficulty.
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: "dyscalculia", version: "0.1.0" });

  server.registerTool(
    "get_prevalence",
    {
      title: "Dyscalculia prevalence figures",
      description: `Published dyscalculia prevalence figures with sample size, publication year, age, the reference key (see get_reference) and a calc flag (true when the site calculated the figure itself). Filter by study id, by age (entries whose stated age range includes it; entries with no stated age are never matched) or by a percent range (entries whose figure or range overlaps it). With no filter, returns all ${STUDY_IDS.length} entries. ${GUIDE}`,
      inputSchema: {
        study: z.string().optional().describe(`One study id: ${STUDY_IDS.join(", ")}.`),
        age: z.number().int().min(3).max(99).optional().describe("Age in years, e.g. 11."),
        min_pct: z.number().min(0).max(100).optional().describe("Lower bound in percent."),
        max_pct: z.number().min(0).max(100).optional().describe("Upper bound in percent."),
      },
      annotations: READ_ONLY,
    },
    async ({ study, age, min_pct, max_pct }) => {
      let rows = statistics.prevalence;
      if (study !== undefined) {
        rows = rows.filter((p) => p.id === study);
        if (!rows.length) return fail(`No study "${study}". Valid ids: ${STUDY_IDS.join(", ")}.`);
      }
      if (min_pct !== undefined && max_pct !== undefined && min_pct > max_pct) return fail("min_pct is larger than max_pct.");
      if (age !== undefined) rows = rows.filter((p) => bands(p).some(([a, b]) => a <= age && age <= b));
      if (min_pct !== undefined) rows = rows.filter((p) => span(p)[1] >= min_pct);
      if (max_pct !== undefined) rows = rows.filter((p) => span(p)[0] <= max_pct);
      const withoutAge = age !== undefined ? statistics.prevalence.filter((p) => bands(p).length === 0).map((p) => p.id) : undefined;
      return text({
        count: rows.length,
        note: GUIDE,
        ...(withoutAge ? { notMatchedBecauseNoStatedAge: withoutAge } : {}),
        entries: rows.map((p) => ({ ...p, reference: refBrief(p.ref) })),
        page: statistics.page,
        updated: statistics.updated,
      });
    },
  );

  server.registerTool(
    "list_studies",
    {
      title: "List the studies and sources behind the statistics",
      description: `Lists every source the statistics page cites (peer-reviewed studies with DOI or PMID, plus official statistics and guidelines), with the topics each supports and, for population studies, the prevalence entries built from them. Filter by topic: ${TOPICS.join(", ")}. Use get_reference for one full citation.`,
      inputSchema: { topic: z.string().optional().describe(`One of: ${TOPICS.join(", ")}.`) },
      annotations: READ_ONLY,
    },
    async ({ topic }) => {
      if (topic !== undefined && !TOPICS.includes(topic)) return fail(`No topic "${topic}". Valid topics: ${TOPICS.join(", ")}.`);
      const rows = cited.filter((r) => !topic || r.usedInStatistics.includes(topic));
      return text({
        count: rows.length,
        topics: TOPICS,
        studies: rows.map((r) => ({
          key: r.key,
          citation: r.citation,
          ...(r.doi ? { doi: r.doi } : {}),
          ...(r.pmid ? { pmid: r.pmid } : {}),
          link: r.link,
          kind: r.kind,
          topics: r.usedInStatistics,
          prevalenceEntries: statistics.prevalence.filter((p) => p.ref === r.key).map((p) => p.id),
        })),
        note: "Identifiers are exactly those the site prints; none is added here.",
      });
    },
  );

  server.registerTool(
    "get_reference",
    {
      title: "Get one full reference",
      description: `Full citation for one reference key (for example shalev2000, grosstsur1996), with its DOI and PMID when the site has them, the link the site uses, and the topics that cite it. The site holds ${references.count} references; keys are returned by get_prevalence and list_studies.`,
      inputSchema: { key: z.string().describe("Reference key, e.g. shalev2000") },
      annotations: READ_ONLY,
    },
    async ({ key }) => {
      const r = refByKey(key);
      if (!r) {
        const near = references.references.filter((x) => x.key.toLowerCase().includes(key.toLowerCase().slice(0, 5))).map((x) => x.key).slice(0, 10);
        return fail(`No reference "${key}". ${near.length ? `Similar keys: ${near.join(", ")}. ` : ""}Keys cited by the statistics page: ${cited.map((x) => x.key).join(", ")}.`);
      }
      return text({ ...r, usedInStatistics: r.usedInStatistics, citedBy: statistics.prevalence.filter((p) => p.ref === key).map((p) => p.id), license: "Reference list: part of the CC BY 4.0 compilation; the cited work belongs to its authors and publisher." });
    },
  );

  server.registerTool(
    "explain_screening_test",
    {
      title: "Explain the free number-skills screening test",
      description:
        "Describes the five screening games on dyscalculia.io: what each measures, how many items it has, what an item is and how items and games are scored in general terms, and the limits. Optionally returns the item sets (dot counts, number pairs, number-line targets, digit-sequence lengths). It describes the test only: it does not score anyone, take answers or return a result. The test is a screening of basic number skills, not a diagnosis.",
      inputSchema: {
        game: z.string().optional().describe(`One game key: ${GAME_ORDER.join(", ")}.`),
        include_items: z.boolean().optional().describe("Include the item sets. Default false."),
      },
      annotations: READ_ONLY,
    },
    async ({ game, include_items }) => {
      if (game !== undefined && !GAME_ORDER.includes(game)) return fail(`No game "${game}". Valid keys: ${GAME_ORDER.join(", ")}.`);
      const META = new Set(["key", "name", "skill", "items", "itemScore", "gameScore", "task"]);
      const games = screening.test.games.filter((g) => !game || g.key === game).map((g) => ({
        key: g.key,
        name: g.name,
        measures: g.skill,
        task: g.task ?? null,
        items: g.items,
        itemScore: g.itemScore,
        gameScore: g.gameScore,
        ...(include_items ? { itemSet: Object.fromEntries(Object.entries(g).filter(([k]) => !META.has(k))) } : {}),
      }));
      return text({
        what: "A free, five-minute screening of basic number skills that runs in the browser.",
        notADiagnosis: screening.notADiagnosis,
        totalItems: screening.test.totalItems,
        order: screening.test.order,
        timeLimitPerAnswer: screening.test.timeLimitPerAnswer,
        scoringInGeneralTerms: "Each item is scored on its own (1 if correct, 0 if not; the number line gives partial credit by distance from the target). A game's score is the mean of its item scores, between 0 and 1. Response times do not enter the score.",
        games,
        limits: screening.limits,
        details: screening.methodology.url,
        thisToolDoesNotScoreAnyone: true,
      });
    },
  );

  server.registerTool(
    "list_chart_data",
    {
      title: "Charts and tables on the statistics page",
      description:
        "Lists the chart and table datasets on the statistics page (id, title, topic, section, row count) with their download addresses: the CSV and JSON of the whole page, one SVG per chart, the screening-test JSON and the changelog JSON. Pass an id (for example chart-1, table-2) to get that dataset's rows with their values, notes and reference keys.",
      inputSchema: { id: z.string().optional().describe(`One of: ${DATASET_IDS.join(", ")}.`) },
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      const all = [...statistics.charts.map((c) => ({ ...c, kind: "chart" as const })), ...statistics.tables.map((t) => ({ ...t, kind: "table" as const }))];
      if (id !== undefined) {
        const d = all.find((x) => x.id === id);
        if (!d) return fail(`No dataset "${id}". Valid ids: ${all.map((x) => x.id).join(", ")}.`);
        return text({ ...d, license: statistics.license.name, note: statistics.license.note, citeAs: statistics.citeAs });
      }
      return text({
        page: statistics.page,
        updated: statistics.updated,
        datasets: all.map((d) => ({ id: d.id, kind: d.kind, title: d.title, topic: d.topic, section: d.section, rows: d.rows.length, ...(d.kind === "chart" ? { svg: d.svg } : {}) })),
        files: statistics.files,
        license: statistics.license.name,
        note: "Pass an id to get one dataset's values. The CSV holds every figure of the page in long form, one row each.",
      });
    },
  );

  server.registerTool(
    "get_citation",
    {
      title: "How to cite and reuse the dyscalculia.io data",
      description: "License (the compilation is CC BY 4.0; each figure belongs to its cited source), the citation text, an HTML credit link and the download addresses. To cite a single number, cite its study: use get_reference.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => text({
      license: statistics.license,
      citeAs: statistics.citeAs,
      htmlCredit: statistics.citeHtml,
      page: statistics.page,
      updated: statistics.updated,
      nextReview: statistics.nextReview,
      downloads: { csv: statistics.files.csv, json: statistics.files.json, screeningTest: statistics.files.screeningTest, charts: statistics.files.charts },
      methodology: `${SITE}/methodology`,
      honestLimits: statistics.honestLimits,
    }),
  );

  return server;
}
