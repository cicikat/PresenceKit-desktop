import { invoke } from '@tauri-apps/api/core';

export type JsonRecord = Record<string, unknown>;

export type ObservabilityResource =
  | 'growth_interests'
  | 'growth_works'
  | 'growth_work'
  | 'growth_notes'
  | 'growth_practice'
  | 'visual_trace'
  | 'spend_ledger'
  | 'spend_budget'
  | 'spend_mandates'
  | 'group_trace'
  | 'group_relations'
  | 'memory_digest'
  | 'memory_recall';

interface ObservabilityRequest {
  resource: ObservabilityResource;
  charId?: string;
  itemId?: string;
  filename?: string;
  date?: string;
}

async function observabilityGet<T>(request: ObservabilityRequest): Promise<T> {
  return invoke<T>('observability_get', {
    resource: request.resource,
    charId: request.charId ?? null,
    itemId: request.itemId ?? null,
    filename: request.filename ?? null,
    date: request.date ?? null,
  });
}

export interface GrowthInterest extends JsonRecord {
  id?: string;
  interest_id?: string;
  name?: string;
  level?: number;
  progress?: number;
  history?: unknown[];
  stalled?: boolean;
  recent_scores?: unknown[];
  learning_progress?: number;
  stalled_since?: number | null;
}

export interface GrowthBundle {
  interests: GrowthInterest[];
  works: Record<string, JsonRecord[]>;
  notes: Record<string, JsonRecord[]>;
  practice: JsonRecord[];
}

export async function loadGrowthObservability(charId: string): Promise<GrowthBundle> {
  const interestsResponse = await observabilityGet<JsonRecord>({ resource: 'growth_interests', charId });
  const interests = records(interestsResponse.interests) as GrowthInterest[];
  const workPairs = await Promise.all(interests.map(async interest => {
    const id = interestId(interest);
    if (!id) return [id, []] as const;
    const response = await observabilityGet<JsonRecord>({ resource: 'growth_works', charId, itemId: id });
    return [id, records(response.entries)] as const;
  }));
  const notePairs = await Promise.all(interests.map(async interest => {
    const id = interestId(interest);
    if (!id) return [id, []] as const;
    const response = await observabilityGet<JsonRecord>({ resource: 'growth_notes', charId, itemId: id });
    return [id, records(response.entries)] as const;
  }));
  const practiceResponse = await observabilityGet<JsonRecord>({ resource: 'growth_practice' });
  const practice = records(practiceResponse.entries).filter(row => {
    const rowCharId = stringValue(row.char_id);
    return rowCharId === charId;
  });
  return {
    interests,
    works: Object.fromEntries(workPairs),
    notes: Object.fromEntries(notePairs),
    practice,
  };
}

export function loadWorkContent(charId: string, interestIdValue: string, filename: string) {
  return observabilityGet<JsonRecord>({
    resource: 'growth_work',
    charId,
    itemId: interestIdValue,
    filename,
  });
}

export async function loadVisualObservability(date: string): Promise<JsonRecord[]> {
  const response = await observabilityGet<JsonRecord>({ resource: 'visual_trace', date });
  return records(response.entries);
}

export interface SpendBundle {
  ledger: JsonRecord[];
  budget: JsonRecord;
  mandates: JsonRecord[];
}

export async function loadSpendObservability(): Promise<SpendBundle> {
  const [ledger, budget, mandates] = await Promise.all([
    observabilityGet<JsonRecord>({ resource: 'spend_ledger' }),
    observabilityGet<JsonRecord>({ resource: 'spend_budget' }),
    observabilityGet<JsonRecord>({ resource: 'spend_mandates' }),
  ]);
  return { ledger: records(ledger.entries), budget, mandates: records(mandates.entries) };
}

export async function loadGroupObservability(groupId: string) {
  const [trace, relations] = await Promise.all([
    observabilityGet<unknown>({ resource: 'group_trace', itemId: groupId }),
    observabilityGet<JsonRecord>({ resource: 'group_relations', itemId: groupId }),
  ]);
  return { trace: records(trace), relations: records(relations.relations) };
}

export async function loadMemoryObservability(charId: string) {
  const [digest, recall] = await Promise.all([
    observabilityGet<JsonRecord>({ resource: 'memory_digest', charId }),
    observabilityGet<JsonRecord>({ resource: 'memory_recall', charId }),
  ]);
  return { digest: stringValue(digest.content), recall: records(recall.records) };
}

export function interestId(interest: GrowthInterest): string {
  return stringValue(interest.id) || stringValue(interest.interest_id) || stringValue(interest.name);
}

export function trendOf(values: unknown[]): 'up' | 'down' | 'flat' {
  const numeric = values.map(numberValue).filter(Number.isFinite);
  if (numeric.length < 2) return 'flat';
  const delta = numeric[numeric.length - 1] - numeric[0];
  return delta > 0.01 ? 'up' : delta < -0.01 ? 'down' : 'flat';
}

export function visualHeat(entries: JsonRecord[]): number[] {
  const hours = Array.from({ length: 24 }, () => 0);
  entries.forEach(row => {
    const timestamp = numberValue(row.ts);
    if (timestamp > 0 && !stringValue(row.dropped)) hours[new Date(timestamp * 1000).getHours()] += 1;
  });
  return hours;
}

export function droppedReasons(entries: JsonRecord[]): Record<string, number> {
  return entries.reduce<Record<string, number>>((counts, row) => {
    const reason = stringValue(row.dropped);
    if (reason) counts[reason] = (counts[reason] ?? 0) + 1;
    return counts;
  }, {});
}

export function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
