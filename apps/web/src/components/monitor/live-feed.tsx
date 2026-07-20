'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  FileCode2,
  Pause,
  Play,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Paginated, Watch, WatchEvent } from './monitor-types';

export function LiveFeed({
  watch,
  liveEvents,
}: {
  watch?: Watch;
  liveEvents: WatchEvent[];
}) {
  const [history, setHistory] = useState<WatchEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!watch) {
      setHistory([]);
      return;
    }
    void apiFetch<Paginated<WatchEvent>>(
      `/monitor/watches/${watch.id}/events?limit=100`,
    ).then((page) => setHistory(page.items));
  }, [watch]);

  const events = useMemo(() => {
    const byId = new Map<string, WatchEvent>();
    [...liveEvents, ...history].forEach((event) => byId.set(event.id, event));
    return Array.from(byId.values()).sort(
      (left, right) =>
        new Date(right.occurredAt).getTime() -
        new Date(left.occurredAt).getTime(),
    );
  }, [history, liveEvents]);

  useEffect(() => {
    if (!paused && feedRef.current) {
      feedRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [events.length, paused]);

  if (!watch) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div>
          <Activity className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h3 className="font-medium">Select a watch</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Live ledger activity and saved history will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="flex min-h-0 flex-col border-b border-border">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">
              {watch.label || watch.publicKey}
            </h3>
            <ConnectionDot watch={watch} />
          </div>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {watch.publicKey}
          </p>
          {watch.lastError && watch.status === 'error' && (
            <p className="mt-1 truncate text-xs text-red-500">
              {watch.lastError}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setPaused((current) => !current)}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs"
        >
          {paused ? (
            <Play className="h-3.5 w-3.5" />
          ) : (
            <Pause className="h-3.5 w-3.5" />
          )}
          {paused ? 'Resume scroll' : 'Pause scroll'}
        </button>
      </header>

      <div
        ref={feedRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4"
      >
        {events.map((event) => (
          <EventCard key={event.id} event={event} watch={watch} />
        ))}
        {events.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Listening for {watch.eventTypes.join(' and ')} events...
          </div>
        )}
      </div>
    </section>
  );
}

function EventCard({ event, watch }: { event: WatchEvent; watch: Watch }) {
  const payload = event.payload;
  const amount = text(payload.amount);
  const assetType = text(payload.asset_type);
  const assetCode = text(payload.asset_code);
  const asset = assetType === 'native' ? 'XLM' : assetCode;
  const from = text(payload.from ?? payload.source_account);
  const to = text(payload.to ?? payload.account);
  const transactionHash = text(
    payload.transaction_hash ?? payload.hash ?? payload.transactionHash,
  );
  const Icon =
    event.eventType === 'contract'
      ? FileCode2
      : to === watch.publicKey
        ? ArrowDownLeft
        : from === watch.publicKey
          ? ArrowUpRight
          : Activity;

  return (
    <article className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide">
              {event.eventType}
            </p>
            {amount && (
              <p className="text-sm font-medium">
                {amount} {asset || ''}
              </p>
            )}
            {from && (
              <p className="truncate text-xs text-muted-foreground">
                From {from}
              </p>
            )}
            {to && (
              <p className="truncate text-xs text-muted-foreground">To {to}</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <time className="block text-[11px] text-muted-foreground">
            {new Date(event.occurredAt).toLocaleString()}
          </time>
          {transactionHash && (
            <a
              href={`https://stellar.expert/explorer/${watch.network}/tx/${transactionHash}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary"
            >
              Stellar Expert <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function ConnectionDot({ watch }: { watch: Watch }) {
  const color =
    watch.status === 'streaming'
      ? 'bg-emerald-500'
      : watch.status === 'polling'
        ? 'bg-amber-500'
        : 'bg-red-500';
  return (
    <span
      className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`}
      title={watch.lastError ?? `${watch.status} via ${watch.streamMode}`}
    />
  );
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : undefined;
}
