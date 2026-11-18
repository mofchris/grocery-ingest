import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { classifyByRule } from './categories/rules.ts';
import type { Aisle } from './categories/taxonomy.ts';
import { validateAisle } from './categories/validator.ts';

export type GoldCategory = { raw: string; aisle: Aisle };
export type EvalResult = { total: number; correct: number; accuracy: number | null; mistakes: Array<{ raw: string; expected: Aisle; actual: Aisle | null }> };

export async function loadGold(path: string): Promise<GoldCategory[]> {
  const source = await readFile(path, 'utf8');
  const rows: GoldCategory[] = [];
  for (const line of source.split(/\r?\n/).filter(Boolean)) {
    const value = JSON.parse(line) as Record<string, unknown>;
    const aisle = validateAisle(value.aisle);
    if (typeof value.raw === 'string' && aisle) rows.push({ raw: value.raw, aisle });
  }
  return rows;
}

export function evaluateRules(gold: GoldCategory[]): EvalResult {
  const mistakes: EvalResult['mistakes'] = [];
  let correct = 0;
  for (const row of gold) {
    const actual = classifyByRule(row.raw);
    if (actual === row.aisle) correct++;
    else mistakes.push({ raw: row.raw, expected: row.aisle, actual });
  }
  return { total: gold.length, correct, accuracy: gold.length ? correct / gold.length : null, mistakes };
}

function percent(value: number | null): string {
  return value === null ? 'not measured' : `${(value * 100).toFixed(1)}%`;
}

export async function runEvaluation(): Promise<void> {
  const gold = await loadGold('eval/categories.gold.jsonl');
  const rules = evaluateRules(gold);
  const fixture = JSON.parse(await readFile('eval/ai-responses.fixture.json', 'utf8')) as {
    status: string; responses: Record<string, unknown>;
  };
  const recorded = fixture.status === 'RECORDED';
  let aiCorrect = 0;
  let combinedCorrect = 0;
  const confusion = new Map<string, number>();
  for (const row of gold) {
    const ai = recorded ? validateAisle(fixture.responses[row.raw]) : null;
    const rule = classifyByRule(row.raw);
    if (ai === row.aisle) aiCorrect++;
    const combined = rule ?? ai;
    if (combined === row.aisle) combinedCorrect++;
    else confusion.set(`${row.aisle} → ${combined ?? 'uncategorized'}`, (confusion.get(`${row.aisle} → ${combined ?? 'uncategorized'}`) ?? 0) + 1);
  }
  const aiAccuracy = recorded && gold.length ? aiCorrect / gold.length : null;
  const combinedAccuracy = recorded && gold.length ? combinedCorrect / gold.length : rules.accuracy;
  const lines = [
    '# Category evaluation', '',
    `Gold examples: ${gold.length}`,
    `Rules-only accuracy: ${percent(rules.accuracy)}`,
    `AI-only accuracy: ${percent(aiAccuracy)}`,
    `Combined accuracy: ${percent(combinedAccuracy)}`,
    `AI fixture: ${fixture.status}`, '',
    '## Confusion', '',
    ...(confusion.size ? [...confusion].sort((a, b) => b[1] - a[1]).map(([pair, count]) => `- ${pair}: ${count}`) : ['Not measured.']),
    '',
  ];
  await mkdir(dirname('docs/eval.md'), { recursive: true });
  await writeFile('docs/eval.md', lines.join('\n'));
  console.log(lines.slice(2, 7).join('\n'));
}

