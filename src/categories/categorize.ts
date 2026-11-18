import type pg from 'pg';

import { config } from '../config.ts';
import { categorizeWithClaude } from './claude.ts';
import { classifyByRule } from './rules.ts';

async function cache(
  pool: pg.Pool,
  raw: string,
  aisle: string,
  source: 'rule' | 'ai' | 'fallback',
  model: string | null,
  flagged: boolean,
): Promise<void> {
  await pool.query(`
    INSERT INTO category_map(raw_category, aisle, source, model, flagged)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (raw_category) DO NOTHING
  `, [raw, aisle, source, model, flagged]);
}

export async function categorizePending(pool: pg.Pool): Promise<{ rules: number; ai: number; uncategorized: number }> {
  const result = await pool.query<{ raw_category: string }>(`
    SELECT DISTINCT p.raw_category
    FROM products p LEFT JOIN category_map c ON c.raw_category = p.raw_category
    WHERE p.raw_category IS NOT NULL AND c.raw_category IS NULL
    ORDER BY p.raw_category
  `);
  const unmatched: string[] = [];
  let rules = 0;
  for (const { raw_category: raw } of result.rows) {
    const aisle = classifyByRule(raw);
    if (aisle) {
      await cache(pool, raw, aisle, 'rule', null, false);
      rules++;
    } else unmatched.push(raw);
  }
  if (!config.anthropicApiKey) {
    console.log(`ANTHROPIC_API_KEY is not set; ${unmatched.length} categories remain uncategorized`);
    return { rules, ai: 0, uncategorized: unmatched.length };
  }
  const assignments = await categorizeWithClaude(unmatched);
  let ai = 0;
  for (const [raw, assignment] of assignments) {
    await cache(pool, raw, assignment.aisle, assignment.flagged ? 'fallback' : 'ai', assignment.model, assignment.flagged);
    ai++;
  }
  return { rules, ai, uncategorized: unmatched.length - ai };
}

