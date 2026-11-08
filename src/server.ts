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
const ROW_COUNTS = [...statistics.charts, ...statistics.tables].map((d) => d.rows.length);
const TOPIC_SIZES = TOPICS.map((t) => cited.filter((r) => r.usedInStatistics.includes(t)).length);

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
      description: `Returns the published dyscalculia prevalence entries, one per population study or guideline: the figure or range in percent, sample size, publication year, stated age, a calc flag (true when the site calculated the figure itself) and the reference key with a short citation. Use this when you need a prevalence number and its source; use list_chart_data instead for the page's other datasets (persistence, sex ratio, comorbidity, maths anxiety, interventions, the by-country table), and get_reference or list_studies to look up sources rather than figures. Filters combine (all must match); with none, it returns all ${STUDY_IDS.length} entries in the page's order, not sorted by figure or year, together with count, the statistics page URL and its last-updated date. An unknown study id returns an error listing the valid ids, and min_pct above max_pct returns an error; the entry id is only a label in this dataset, so to cite a number cite its study via get_reference. ${GUIDE}`,
      inputSchema: {
        study: z.string().optional().describe(`Exact entry id (case-sensitive); returns only that entry. One of: ${STUDY_IDS.join(", ")}. Omit for all entries.`),
        age: z.number().int().min(3).max(99).optional().describe("Age in whole years, 3 to 99, e.g. 11. Keeps entries whose stated age range includes it. Entries with no numeric age range are never matched; their ids are returned in notMatchedBecauseNoStatedAge."),
        min_pct: z.number().min(0).max(100).optional().describe("Lower bound in percent, 0 to 100. Keeps entries whose figure, or the upper end of whose range, is at least this. Combine with max_pct for an overlap window; must not exceed max_pct."),
        max_pct: z.number().min(0).max(100).optional().describe("Upper bound in percent, 0 to 100. Keeps entries whose figure, or the lower end of whose range, is at most this. Combine with min_pct for an overlap window."),
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
      description: `Lists the ${cited.length} sources the statistics page cites (out of the ${references.count} references the site holds): peer-reviewed studies with DOI or PMID where the site prints one, plus official statistics and guidelines. Each row has the key, citation, identifiers, link, kind (article or web), the topics it supports and, for population studies, the get_prevalence entry ids built from it; rows keep the site's reference-list order. Use this to find which sources back a topic or to discover reference keys; use get_reference instead for one key's full record (it also covers references the statistics page does not cite), and get_citation to cite the dyscalculia.io compilation as a whole. With no topic it returns all ${cited.length} sources; an unknown topic returns an error listing the valid topics.`,
      inputSchema: { topic: z.string().optional().describe(`Keep only sources cited for this section of the statistics page (exact, lowercase; ${Math.min(...TOPIC_SIZES)} to ${Math.max(...TOPIC_SIZES)} sources each). Valid: ${TOPICS.join(", ")}. Omit for every cited source.`) },
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
      description: `Returns the full record for one reference key: citation, DOI and PMID when the site prints them (none is added), url and the link the site uses, kind, the statistics topics that cite it, the get_prevalence entry ids built from it, and a license note. Any of the ${references.count} keys in the site's reference list works, including those the statistics page does not cite. Use this when you hold a key (from get_prevalence, list_studies or a list_chart_data row) and need to cite that one study; use list_studies instead to discover keys or browse sources by topic, and get_citation instead to cite the dyscalculia.io compilation itself. An unknown key returns an error with similar keys and the keys the statistics page cites.`,
      inputSchema: { key: z.string().describe("Exact reference key, case-sensitive, e.g. shalev2000, grosstsur1996, ncesDigest20430. Required.") },
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
        `Describes the ${screening.test.games.length} number-skill screening games on dyscalculia.io (${screening.test.totalItems} items in total): for each game its key, name, the skill it measures, the task, item count and how items and games are scored in general terms, plus the fixed item order, the not-a-diagnosis statement, the limits (no norm sample, percentiles or accuracy study) and the methodology link. Use this to explain what the test is and how it works; use get_prevalence or list_chart_data instead for research figures about dyscalculia. It is a description only: it takes no answers, scores no one and returns no result, and the test is a screening of basic number skills, not a diagnosis. An unknown game key returns an error listing the valid keys.`,
      inputSchema: {
        game: z.string().optional().describe(`Return only this game (exact key): ${GAME_ORDER.join(", ")}. Omit for all ${GAME_ORDER.length} games, in the order listed here.`),
        include_items: z.boolean().optional().describe("When true, adds each returned game's item set (dot counts, number pairs, number-line targets, digit-sequence lengths). Default false. Works with or without game."),
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
        `Lists the ${DATASET_IDS.length} datasets behind the statistics page's ${statistics.charts.length} charts and ${statistics.tables.length} tables (id, kind, title, topic, section, row count; ids are not consecutive) with the download addresses: the whole page as CSV and JSON, one SVG per chart, the screening-test JSON and the changelog JSON. Pass an id to get that one dataset's rows (${Math.min(...ROW_COUNTS)} to ${Math.max(...ROW_COUNTS)} per dataset) with values, notes and reference keys, plus the license and citeAs text. Use this for topics beyond prevalence (persistence, maths anxiety, interventions, by-country, sex ratio, comorbidity) or for the exact rows a chart plots; use get_prevalence instead for prevalence figures with sample size, age and filters (chart-1 plots only a subset of those entries). An unknown id returns an error listing the valid ids.`,
      inputSchema: { id: z.string().optional().describe(`Dataset id, exact: ${DATASET_IDS.join(", ")}. Omit to list every dataset without its rows.`) },
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
      description: "Returns how to cite and reuse the dyscalculia.io statistics compilation as a whole: the license (the compilation is CC BY 4.0; each figure belongs to its cited source), the citeAs text, an HTML credit link, the page URL, last-updated and next-review dates, download addresses (CSV, JSON, screening-test JSON, chart SVGs), the methodology link and the honest limits. Takes no parameters and returns the same object for the current data snapshot. Use this when crediting the dataset, a chart or a table from dyscalculia.io; use get_reference instead to cite the single study behind one number, and list_studies to find which studies back a topic.",
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
