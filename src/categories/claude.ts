import { config } from '../config.ts';
import { AISLES, type Aisle } from './taxonomy.ts';
import { validateAisle } from './validator.ts';

export const CATEGORY_MODEL = 'claude-haiku-5-5';

export type AiCategory = { aisle: Aisle; flagged: boolean; model: string };

function parseAssignments(text: string): Map<string, Aisle> {
  const first = text.indexOf('[');
  const last = text.lastIndexOf(']');
  if (first < 0 || last < first) return new Map();
  let value: unknown;
  try { value = JSON.parse(text.slice(first, last + 1)); } catch { return new Map(); }
  if (!Array.isArray(value)) return new Map();
  const result = new Map<string, Aisle>();
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const object = item as Record<string, unknown>;
    const aisle = validateAisle(object.aisle);
    if (typeof object.raw_category === 'string' && aisle) result.set(object.raw_category, aisle);
  }
  return result;
}

async function requestBatch(categories: string[], apiKey: string): Promise<Map<string, Aisle>> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: CATEGORY_MODEL,
    max_tokens: 4096,
    system: `Map manufacturer food categories to exactly one allowed grocery aisle. Allowed aisles: ${AISLES.join(', ')}. Return only a JSON array of {"raw_category": string, "aisle": string}; it is parsed programmatically.`,
    messages: [{ role: 'user', content: JSON.stringify(categories) }],
  });
  const text = message.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n');
  return parseAssignments(text);
}

export async function categorizeWithClaude(
  categories: string[],
  apiKey = config.anthropicApiKey,
): Promise<Map<string, AiCategory>> {
  const output = new Map<string, AiCategory>();
  if (!apiKey || !categories.length) return output;
  for (let offset = 0; offset < categories.length; offset += 50) {
    const batch = categories.slice(offset, offset + 50);
    const first = await requestBatch(batch, apiKey);
    const invalid = batch.filter((raw) => !first.has(raw));
    const retry = invalid.length ? await requestBatch(invalid, apiKey) : new Map<string, Aisle>();
    for (const raw of batch) {
      const aisle = first.get(raw) ?? retry.get(raw);
      output.set(raw, { aisle: aisle ?? 'Other', flagged: !aisle, model: CATEGORY_MODEL });
    }
  }
  return output;
}

