# sytax

A browser app for calculating Syrian salary income tax, compensation tax and social security. It is a web version of `syriantaxescli`. The interface is in Arabic and English, works offline as a PWA, and runs entirely in the browser.

## Features

- **Gross → Net**: enter a salary and compensation to see every deduction and the net pay.
- **Net → Gross**: enter a target net amount to find the salary and compensation that produce it.
- **Salary scale**: build a range of salaries and export it as XLSX, CSV, JSON or JSONL.
- **Rules**: edit the tax brackets, rates, minimum salary, social security and rounding. You can save several configs in the browser and reset them to the built-in 2024 rules.

## Development

Requires Node.js.

```bash
npm install
```

```bash
npm run dev
```

| Script | What it does |
|--------|--------------|
| `npm run dev` | Starts the Vite dev server |
| `npm run build` | Type-checks and builds to `dist/` |
| `npm run preview` | Serves the production build |
| `npm test` | Runs the Vitest tests |

The build is a static site. Routes use the URL hash (`#/net`), so it works on any static host without server rewrites.

## Project layout

- `src/core/`: tax calculations (`taxes.ts`), salary services, settings, built-in defaults and export
- `src/pages/`: the four tabs (Gross, Net, Range, Rules)
- `src/components/`: shared UI parts
- `src/lib/`: amount parsing, errors and i18n

Built with React, TypeScript, Tailwind CSS and decimal.js. Amounts use decimal.js, so results have no floating-point rounding errors.
