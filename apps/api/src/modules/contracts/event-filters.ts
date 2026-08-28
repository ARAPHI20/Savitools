import { DecodedScVal } from './scval-decoder';

export type EventFilterCriterion =
  | { kind: 'topic_contains'; value: string }
  | { kind: 'value_type_is'; value: string }
  | { kind: 'value_equals'; value: string }
  | { kind: 'ledger_range'; from?: number; to?: number };

export interface DecodedContractEvent {
  id: string;
  type: string;
  ledger: number;
  ledgerClosedAt: string;
  pagingToken: string;
  inSuccessfulContractCall: boolean;
  txHash: string;
  contractId: string | null;
  topic: DecodedScVal[];
  value: DecodedScVal;
  /** Criteria this event satisfied, populated only by `applyEventFilters`. */
  matchedCriteria?: string[];
}

/** A criterion rendered back as the compact text form the UI shows on a chip. */
export function describeCriterion(criterion: EventFilterCriterion): string {
  switch (criterion.kind) {
    case 'topic_contains':
      return `topic contains ${criterion.value}`;
    case 'value_type_is':
      return `value type is ${criterion.value}`;
    case 'value_equals':
      return `value equals ${criterion.value}`;
    case 'ledger_range':
      return `ledger ${criterion.from ?? '*'}..${criterion.to ?? '*'}`;
  }
}

/**
 * Flattens a decoded value to the strings a user would plausibly search for:
 * the scalar itself, plus every nested scalar inside vecs and maps.
 */
function searchableStrings(decoded: DecodedScVal, out: string[] = []): string[] {
  const { value } = decoded;

  if (value === null || value === undefined) {
    // Nothing searchable, but the type still matters to value_type_is.
  } else if (typeof value === 'string') {
    out.push(value);
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    out.push(String(value));
  } else if (Array.isArray(value)) {
    for (const item of value) {
      // A vec holds DecodedScVal (which always carries `raw`); an exotic-key
      // map holds DecodedMapPair, which does not.
      const entry = item as DecodedScVal | { key: DecodedScVal; value: DecodedScVal };
      if (typeof (entry as DecodedScVal).raw === 'string') {
        searchableStrings(entry as DecodedScVal, out);
      } else {
        const pair = entry as { key: DecodedScVal; value: DecodedScVal };
        searchableStrings(pair.key, out);
        searchableStrings(pair.value, out);
      }
    }
  } else if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out.push(key);
      if (typeof nested === 'string' || typeof nested === 'number' || typeof nested === 'boolean') {
        out.push(String(nested));
      } else if (nested && typeof nested === 'object') {
        // Nested container values are stored bare (not as DecodedScVal).
        out.push(...searchableStrings({ type: '', value: nested, raw: '' }));
      }
    }
  }

  return out;
}

function topicMatches(event: DecodedContractEvent, needle: string): boolean {
  const target = needle.toLowerCase();
  return event.topic.some((topic) =>
    searchableStrings(topic).some((s) => s.toLowerCase().includes(target)),
  );
}

function valueTypeMatches(event: DecodedContractEvent, type: string): boolean {
  const target = type.toLowerCase();
  // Accept both the wire name ("scvI128") and the bare name ("i128").
  const actual = event.value.type.toLowerCase();
  return actual === target || actual === `scv${target}`;
}

function valueEquals(event: DecodedContractEvent, expected: string): boolean {
  const target = expected.toLowerCase();
  return searchableStrings(event.value).some((s) => s.toLowerCase() === target);
}

function ledgerInRange(event: DecodedContractEvent, from?: number, to?: number): boolean {
  if (from !== undefined && event.ledger < from) return false;
  if (to !== undefined && event.ledger > to) return false;
  return true;
}

export function matchesCriterion(
  event: DecodedContractEvent,
  criterion: EventFilterCriterion,
): boolean {
  switch (criterion.kind) {
    case 'topic_contains':
      return topicMatches(event, criterion.value);
    case 'value_type_is':
      return valueTypeMatches(event, criterion.value);
    case 'value_equals':
      return valueEquals(event, criterion.value);
    case 'ledger_range':
      return ledgerInRange(event, criterion.from, criterion.to);
  }
}

/**
 * Returns the events satisfying every criterion (AND), each annotated with the
 * criteria it matched so the UI can show why a row survived. An empty criteria
 * list is a no-op rather than a match-nothing.
 */
export function applyEventFilters(
  events: DecodedContractEvent[],
  criteria: EventFilterCriterion[],
): DecodedContractEvent[] {
  if (criteria.length === 0) {
    return events.map((event) => ({ ...event, matchedCriteria: [] }));
  }

  const result: DecodedContractEvent[] = [];
  for (const event of events) {
    const matched: string[] = [];
    let survives = true;

    for (const criterion of criteria) {
      if (matchesCriterion(event, criterion)) {
        matched.push(describeCriterion(criterion));
      } else {
        survives = false;
        break;
      }
    }

    if (survives) {
      result.push({ ...event, matchedCriteria: matched });
    }
  }

  return result;
}
