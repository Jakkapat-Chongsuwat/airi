/** Queryable log entry kind emitted by the conscious LLM runtime. */
export type LlmLogEntryKind
  = 'turn_input'
    | 'llm_attempt'
    | 'repl_result'
    | 'repl_error'
    | 'scheduler'
    | 'feedback'

/** Log entry captured for LLM turns, REPL execution, scheduler state, and feedback. */
export interface LlmLogEntry {
  /** Monotonic entry id assigned by the producing runtime. */
  id: number

  /** Logical conscious turn id associated with this entry. */
  turnId: number

  /** Entry kind used by structured queries. */
  kind: LlmLogEntryKind

  /** Epoch timestamp for sorting and range filters. */
  timestamp: number

  /** Original event type associated with the entry. */
  eventType: string

  /** Source type, such as `minecraft` or `system`. */
  sourceType: string

  /** Source-local identifier, such as a username or executor id. */
  sourceId: string

  /** Query tags copied on every returned entry. */
  tags: string[]

  /** Human-readable text payload for search and debugging. */
  text: string

  /** Optional structured details kept with the entry. */
  metadata?: Record<string, unknown>
}

/** Runtime facade for querying copied LLM log entries. */
export interface LlmLogRuntime {
  /** Snapshot copy of the current source entries. */
  readonly entries: LlmLogEntry[]

  /** Creates a fresh fluent query over the latest source entries. */
  query: () => LlmLogQuery

  /** Returns the latest entries sorted by descending timestamp. */
  latest: (count?: number) => LlmLogEntry[]

  /** Finds one entry by id and returns a copy when present. */
  byId: (id: number) => LlmLogEntry | null
}

interface LlmLogQueryPatch {
  predicates?: Array<(entry: LlmLogEntry) => boolean>
  sorter?: (a: LlmLogEntry, b: LlmLogEntry) => number
  sliceLatest?: number
}

/**
 * Builds immutable-style fluent queries over LLM log entries.
 *
 * Use when:
 * - Consumers need filtered views of conscious runtime logs
 * - Query calls should compose without mutating previous query instances
 *
 * Expects:
 * - Entries are supplied by the caller and may change between runtime queries
 *
 * Returns:
 * - Copied entries so callers cannot mutate the source tag arrays
 */
export class LlmLogQuery {
  public constructor(
    private readonly entries: readonly LlmLogEntry[],
    private readonly predicates: Array<(entry: LlmLogEntry) => boolean> = [],
    private readonly sorter?: (a: LlmLogEntry, b: LlmLogEntry) => number,
    private readonly sliceLatest?: number,
  ) {}

  public whereKind(kind: LlmLogEntryKind | LlmLogEntryKind[]): LlmLogQuery {
    const set = new Set(Array.isArray(kind) ? kind : [kind])
    return this.clone({
      predicates: [...this.predicates, entry => set.has(entry.kind)],
    })
  }

  public whereTag(tag: string | string[]): LlmLogQuery {
    const set = new Set((Array.isArray(tag) ? tag : [tag]).map(item => item.toLowerCase()))
    return this.clone({
      predicates: [...this.predicates, entry => entry.tags.some(item => set.has(item.toLowerCase()))],
    })
  }

  public whereSource(sourceType: string, sourceId?: string): LlmLogQuery {
    return this.clone({
      predicates: [...this.predicates, (entry) => {
        if (entry.sourceType !== sourceType)
          return false
        if (sourceId !== undefined)
          return entry.sourceId === sourceId
        return true
      }],
    })
  }

  public errors(): LlmLogQuery {
    return this.whereTag('error')
  }

  public turns(): LlmLogQuery {
    return this.whereKind('turn_input')
  }

  public between(startTs: number, endTs: number): LlmLogQuery {
    return this.clone({
      predicates: [...this.predicates, entry => entry.timestamp >= startTs && entry.timestamp <= endTs],
    })
  }

  public textIncludes(fragment: string): LlmLogQuery {
    const needle = fragment.toLowerCase()
    return this.clone({
      predicates: [...this.predicates, entry => entry.text.toLowerCase().includes(needle)],
    })
  }

  public latest(count: number): LlmLogQuery {
    return this.clone({
      sorter: (a, b) => b.timestamp - a.timestamp,
      sliceLatest: Math.max(1, Math.floor(count)),
    })
  }

  public list(): LlmLogEntry[] {
    let result = this.entries.filter(entry => this.predicates.every(predicate => predicate(entry)))
    if (this.sorter)
      result = [...result].sort(this.sorter)
    if (this.sliceLatest !== undefined)
      result = result.slice(0, this.sliceLatest)
    return result.map(entry => copyEntry(entry))
  }

  public first(): LlmLogEntry | null {
    return this.list()[0] ?? null
  }

  public count(): number {
    return this.list().length
  }

  private clone(patch: LlmLogQueryPatch): LlmLogQuery {
    return new LlmLogQuery(
      this.entries,
      patch.predicates ?? this.predicates,
      patch.sorter ?? this.sorter,
      patch.sliceLatest ?? this.sliceLatest,
    )
  }
}

function copyEntry(entry: LlmLogEntry): LlmLogEntry {
  return { ...entry, tags: [...entry.tags] }
}

/**
 * Creates a query facade over caller-owned LLM log entries.
 *
 * Use when:
 * - A runtime stores entries in its own array but wants reusable query helpers
 * - Consumers need copied snapshots from latest source data
 *
 * Expects:
 * - `getEntries` returns entries in caller-owned storage
 *
 * Returns:
 * - A runtime facade whose accessors copy entries and tag arrays
 */
export function createLlmLogRuntime(getEntries: () => readonly LlmLogEntry[]): LlmLogRuntime {
  return {
    get entries(): LlmLogEntry[] {
      return getEntries().map(entry => copyEntry(entry))
    },
    query(): LlmLogQuery {
      return new LlmLogQuery(getEntries())
    },
    latest(count = 20): LlmLogEntry[] {
      return new LlmLogQuery(getEntries()).latest(count).list()
    },
    byId(id: number): LlmLogEntry | null {
      const item = getEntries().find(entry => entry.id === id)
      return item ? copyEntry(item) : null
    },
  }
}
