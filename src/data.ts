import { readFileSync } from "node:fs";

/** Snapshot shipped inside the package (`npm run sync` copies it from ../data). */
const read = (name: string) => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), "utf8"));

export interface Reference {
  key: string;
  citation: string;
  doi?: string;
  pmid?: string;
  url?: string;
  link: string;
  kind: "article" | "web";
  usedInStatistics: string[];
}
export interface PrevalenceEntry {
  id: string;
  population: string;
  kind: "point" | "range";
  pct?: number;
  lo?: number;
  hi?: number;
  n: number | null;
  year: number;
  age: string | null;
  ageFrom?: number | null;
  ageTo?: number | null;
  ageBands?: [number, number][];
  ref: string;
  calc: boolean;
  note: string;
  [extra: string]: unknown;
}
export interface Chart { id: string; topic: string; section: string; title: string; description: string; columns: string[]; rows: unknown[]; svg: string; anchor: string }
export interface Table { id: string; topic: string; section: string; title: string; columns: string[]; rows: { cells: string[]; refs: string[] }[] }
export interface Statistics {
  name: string;
  page: string;
  updated: string;
  snapshot: string;
  nextReview: string;
  license: { name: string; url: string; note: string };
  citeAs: string;
  citeHtml: string;
  honestLimits: string[];
  calc: { path: string; how: string }[];
  prevalence: PrevalenceEntry[];
  keyFigures: unknown[];
  charts: Chart[];
  tables: Table[];
  rows: unknown[];
  files: { csv: string; json: string; charts: string[]; screeningTest: string; changelog: string };
}
export interface Game { key: string; name: string; skill: string; items: number; itemScore: string; gameScore: string; task?: string; [k: string]: unknown }
export interface Screening {
  name: string;
  page: string;
  notADiagnosis: string;
  methodology: { url: string; lastChanged: string };
  test: { totalItems: number; order: string; timeLimitPerAnswer: null; timesEnterScore: boolean; games: Game[] };
  limits: { norms: null; percentiles: null; accuracyStudy: null; note: string };
}

export const statistics: Statistics = read("statistics.json");
export const references: { references: Reference[]; count: number } = read("references.json");
export const screening: Screening = read("screening-test.json");

export const SITE = "https://dyscalculia.io";
export const STUDY_IDS = statistics.prevalence.map((p) => p.id);
export const TOPICS = [...new Set([...statistics.charts, ...statistics.tables].map((d) => d.topic).concat(references.references.flatMap((r) => r.usedInStatistics)))];
export const refByKey = (key: string) => references.references.find((r) => r.key === key);
export const cited = references.references.filter((r) => r.usedInStatistics.length > 0);

/** Percent range an entry covers (a point is a range of one value). */
export const span = (p: PrevalenceEntry): [number, number] => (p.kind === "range" ? [p.lo!, p.hi!] : [p.pct!, p.pct!]);
export const bands = (p: PrevalenceEntry): [number, number][] => p.ageBands ?? (p.ageFrom != null && p.ageTo != null ? [[p.ageFrom, p.ageTo]] : []);

export const refBrief = (key: string) => {
  const r = refByKey(key);
  return r ? { key: r.key, citation: r.citation, ...(r.doi ? { doi: r.doi } : {}), ...(r.pmid ? { pmid: r.pmid } : {}), link: r.link } : { key };
};
