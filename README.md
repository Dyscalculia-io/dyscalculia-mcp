# dyscalculia-mcp

MCP server for the sourced dyscalculia statistics on [Dyscalculia.io](https://dyscalculia.io/dyscalculia-statistics): prevalence
studies with sample size, year, age and reference, 93 references with DOI or PMID where the site has one, the chart and table
datasets, and a plain description of the five number-skill screening games. Ask an assistant "what share of children have
dyscalculia, and which study says so?" and it answers from sourced figures. Read-only.

## Tools

| Tool | What it returns |
|---|---|
| `get_prevalence` | Prevalence figures with sample size, publication year, age, reference key and a `calc` flag; filter by study, age or percent range |
| `list_studies` | Every source the statistics page cites, with the topics it supports (prevalence, sex ratio, comorbidity, persistence, family, maths anxiety, interventions, ...) |
| `get_reference` | One full citation by key (for example `shalev2000`) with DOI or PMID where the site has one, and the topics that cite it |
| `explain_screening_test` | The five screening games: what each measures, item counts, how items and games are scored in general terms, optional item sets, and the limits |
| `list_chart_data` | The 4 charts and 3 tables on the statistics page with their CSV, JSON and SVG addresses; pass an id to get the rows with notes and reference keys |
| `get_citation` | License (CC BY 4.0 compilation, each figure belongs to its source), citation text, an HTML credit link and downloads |

Every tool is read-only (`readOnlyHint`). Invalid input returns `isError` with the valid options. **No tool scores a person,
takes answers or returns a screening result**: `explain_screening_test` describes the test, nothing more.

## Use

Hosted (no install): `https://mcp.dyscalculia.io/mcp`. Docs for each client: https://docs.dyscalculia.io/mcp

Local:

```json
{ "mcpServers": { "dyscalculia": { "command": "npx", "args": ["-y", "dyscalculia-mcp"] } } }
```

Claude Code: `claude mcp add --scope user dyscalculia -- npx -y dyscalculia-mcp`.
Self-host the HTTP transport: `npm run build && PORT=3000 npm run start:http` (POST `/mcp`, stateless, `/health`), or build the
`Dockerfile` (node:22-alpine, non-root, port 3000).

## Honest limits

- **There is no global prevalence figure.** No worldwide pooled meta-analysis of dyscalculia prevalence was found; the
  "worldwide" entry is a range across population studies. Studies use different criteria and ages, so figures are not directly
  comparable, and one English sample gave 1 to 6 percent depending on the cut-off.
- The figures are published research estimates, **not a diagnosis of any person**. The server gives no advice about a learning
  difficulty and does not tell anyone whether they have dyscalculia.
- The screening test is a screening of basic number skills. It has no norm sample, no percentiles and no published accuracy
  study; it does not diagnose dyscalculia and does not rule it out.
- DOIs and PMIDs are exactly those the site prints. Where the site has none, none is given.

Source of the figures: https://dyscalculia.io/dyscalculia-statistics · Method: https://dyscalculia.io/methodology

Data CC BY 4.0 (see [`dyscalculia-data`](https://github.com/Dyscalculia-io/dyscalculia-data)), code MIT.
