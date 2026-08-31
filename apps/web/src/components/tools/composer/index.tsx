'use client';

import {
  buildTransaction,
  fetchOperations,
  OperationManifestEntry,
  simulateTransaction,
  SimulateTransactionResult,
} from '@/lib/composer-api';
import { useNetwork } from '@/lib/network-context';
import { addRecentItem } from '@/lib/recent-items';
import { useCommandPalette } from '@/components/command-palette';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ComposerToolbar } from './composer-toolbar';
import { OperationPalette } from './operation-palette';
import { OperationList } from './operation-list';
import { OperationForm } from './operation-form';
import { XdrPreview } from './xdr-preview';
import { SimulateResult } from './simulate-result';
import { SignSubmitDialog } from './sign-submit-dialog';
import { BenchmarkPanel } from './benchmark-panel';
import { ComposerOperationListSkeleton } from '../state-display';
import { ErrorState } from '../state-display';
import { Code2, ListOrdered, Zap } from 'lucide-react';

export interface ComposedOperation {
  id: string;
  type: string;
  fields: Record<string, unknown>;
}

function newId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function SourceAccountInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor="source-account-input"
        className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
      >
        Source Account <span className="text-rose-400">*</span>
      </label>
      <input
        id="source-account-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="G... (56-character Stellar public key)"
        maxLength={56}
        className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-violet-500/50 focus:border-violet-500/50 transition-colors"
      />
    </div>
  );
}

function SequenceRunner({
  operations,
  clearOperations,
  sourceAccount,
  memo,
  network,
}: {
  operations: ComposedOperation[];
  clearOperations: () => void;
  sourceAccount: string;
  memo: string;
  network: string;
}) {
  const [steps, setSteps] = useState<ComposedOperation[][]>([]);
  const [stopOnFailure, setStopOnFailure] = useState(true);
  const [results, setResults] = useState<Array<{ step: number; hash?: string; status: string; next?: string }>>([]);
  const [running, setRunning] = useState(false);

  const addStep = () => {
    if (operations.length === 0) return;
    setSteps((prev) => [...prev, operations]);
    clearOperations();
  };

  const removeStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const run = async () => {
    const allSteps = steps.length > 0 ? steps : (operations.length > 0 ? [operations] : []);
    if (allSteps.length === 0) return;
    setRunning(true);
    setResults([]);
    let currentSource = sourceAccount;
    for (let i = 0; i < allSteps.length; i++) {
      const ops = allSteps[i];
      try {
        const payload = {
          sourceAccount: currentSource.trim(),
          memo: memo.trim() || undefined,
          operations: ops.map((op) => ({ type: op.type, fields: op.fields })),
          network,
        };
        const built = await buildTransaction(payload);
        const sim = (await simulateTransaction({ xdr: built.xdr, network })) as any;
        const status = sim?.success ? 'success' : 'failed';
        setResults((prev) => [...prev, { step: i + 1, hash: sim?.hash, status, next: sim?.nextSequence }]);
        if (stopOnFailure && !sim?.success) break;
        currentSource = sim?.nextSource || currentSource;
      } catch (e) {
        setResults((prev) => [...prev, { step: i + 1, status: 'error', next: undefined }]);
        if (stopOnFailure) break;
      }
    }
    setRunning(false);
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card/30 p-4">
      <h2 className="text-lg font-semibold">Transaction Sequence</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Build multiple transactions that run in order with automatic sequence numbers.
      </p>

      {steps.length === 0 && operations.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-3">No steps yet. Use the builder to compose an operation set, then click "Add Step".</p>
      ) : null}

      <div className="flex flex-col gap-2 mb-3">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center justify-between bg-background/50 rounded-lg px-3 py-2">
            <span className="text-xs font-medium">Step {i + 1}: {step.length} op(s)</span>
            <button onClick={() => removeStep(i)} className="text-xs text-rose-400 hover:text-rose-300">Remove</button>
          </div>
        ))}
        {operations.length > 0 && (
          <button onClick={addStep} className="text-xs bg-secondary rounded-lg px-3 py-2 hover:bg-secondary/80">
            Add current ops as Step {steps.length + 1}
          </button>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={stopOnFailure}
          onChange={(e) => setStopOnFailure(e.target.checked)}
          className="rounded border-border"
        />
        Stop on failure
      </label>

      <button
        onClick={() => void run()}
        disabled={running || (steps.length === 0 && operations.length === 0)}
        className="mt-3 bg-violet-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {running ? 'Running…' : 'Run Sequence'}
      </button>

      {results.length > 0 && (
        <div className="mt-4 space-y-2">
          {results.map((r, i) => (
            <div key={i} className="text-xs bg-background/50 rounded-lg px-3 py-2 flex justify-between">
              <span>Step {r.step}</span>
              <span>Status: {r.status}</span>
              <span className="font-mono">{r.hash ?? r.next ?? ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ComposerTool() {
  const { network } = useNetwork();
  const { registerContextActions } = useCommandPalette();

  // Mode switcher: Builder vs Benchmark
  const [mode, setMode] = useState<'build' | 'benchmark' | 'sequence'>('build');

  // Remote manifest
  const [manifest, setManifest] = useState<OperationManifestEntry[]>([]);
  const [manifestLoading, setManifestLoading] = useState(true);
  const [manifestError, setManifestError] = useState<string | null>(null);

  // Composer state
  const [sourceAccount, setSourceAccount] = useState('');
  const [memo, setMemo] = useState('');
  const [operations, setOperations] = useState<ComposedOperation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // XDR
  const [xdr, setXdr] = useState<string | null>(null);
  const [xdrBuilding, setXdrBuilding] = useState(false);
  const buildDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Simulate
  const [simResult, setSimResult] = useState<SimulateTransactionResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  // Sign & submit
  const [showSignDialog, setShowSignDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    success: boolean;
    hash?: string;
    error?: string;
  } | null>(null);

  // ---------------------------------------------------------------------------
  // Load manifest once
  // ---------------------------------------------------------------------------
  const loadManifest = useCallback(async () => {
    setManifestLoading(true);
    setManifestError(null);
    try {
      const data = await fetchOperations();
      setManifest(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load operation manifest';
      setManifestError(message);
    } finally {
      setManifestLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadManifest();
  }, [loadManifest]);

  // ---------------------------------------------------------------------------
  // Rebuild XDR when operations / source / memo change (debounced 300ms)
  // ---------------------------------------------------------------------------
  const rebuildXdr = useCallback(
    async (ops: ComposedOperation[], src: string, mem: string) => {
      if (!src.trim() || ops.length === 0) {
        setXdr(null);
        return;
      }
      setXdrBuilding(true);
      try {
        const payload = {
          sourceAccount: src.trim(),
          memo: mem.trim() || undefined,
          operations: ops.map((op) => ({ type: op.type, fields: op.fields })),
          network,
        };
        const built = await buildTransaction(payload);
        setXdr(built.xdr);
      } catch {
        setXdr(null);
      } finally {
        setXdrBuilding(false);
      }
    },
    [network],
  );

  useEffect(() => {
    if (buildDebounce.current) clearTimeout(buildDebounce.current);
    buildDebounce.current = setTimeout(() => {
      void rebuildXdr(operations, sourceAccount, memo);
    }, 300);
    return () => {
      if (buildDebounce.current) clearTimeout(buildDebounce.current);
    };
  }, [operations, sourceAccount, memo, rebuildXdr]);

  // ---------------------------------------------------------------------------
  // Operation handlers
  // ---------------------------------------------------------------------------

  const handleAdd = (type: string) => {
    const op: ComposedOperation = { id: newId(), type, fields: {} };
    setOperations((prev) => [...prev, op]);
    setSelectedId(op.id);
  };

  const handleRemove = (id: string) => {
    setOperations((prev) => prev.filter((o) => o.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  };

  const handleReorder = (reordered: ComposedOperation[]) => {
    setOperations(reordered);
  };

  const handleFieldChange = (id: string, fields: Record<string, unknown>) => {
    setOperations((prev) =>
      prev.map((op) => (op.id === id ? { ...op, fields } : op)),
    );
  };

  const handleSimulate = useCallback(async () => {
    if (!xdr) return;
    setSimLoading(true);
    setSimError(null);
    setSimResult(null);
    try {
      const result = await simulateTransaction({ xdr, network });
      setSimResult(result);
      addRecentItem({
        category: 'composer',
        title: `Composed Tx (${operations.length} op${operations.length !== 1 ? 's' : ''})`,
        subtitle: `Simulated successfully on ${network}`,
        href: '/composer',
      });
    } catch (e) {
      setSimError(e instanceof Error ? e.message : 'Simulation error');
    } finally {
      setSimLoading(false);
    }
  }, [xdr, network, operations.length]);

  // Register contextual shortcuts for Cmd+Enter and Cmd+C
  useEffect(() => {
    const unregister = registerContextActions({
      actionLabel: 'Simulate Composed Transaction',
      runAction: () => {
        if (xdr && !simLoading) {
          void handleSimulate();
        }
      },
      copyTxHash: () => {
        if (submitResult?.hash) {
          void navigator.clipboard.writeText(submitResult.hash);
          return true;
        }
        if (xdr) {
          void navigator.clipboard.writeText(xdr);
          return true;
        }
        return false;
      },
      txHash: submitResult?.hash,
    });

    return unregister;
  }, [xdr, simLoading, submitResult?.hash, registerContextActions, handleSimulate]);

  const handleSignSubmitSuccess = (hash: string) => {
    setSubmitting(false);
    setSubmitResult({ success: true, hash });
    addRecentItem({
      category: 'composer',
      title: `Submitted Tx (${operations.length} ops)`,
      subtitle: `Hash: ${hash.slice(0, 16)}… · ${network}`,
      href: `/inspector?hash=${hash}`,
    });
  };

  const handleSignSubmitError = (message: string) => {
    setSubmitting(false);
    setSubmitResult({ success: false, error: message });
  };

  const selected = operations.find((o) => o.id === selectedId) ?? null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-5">
      {/* Mode Switcher Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card border border-border/60 rounded-xl p-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Transaction Composer</h1>
          <p className="text-xs text-muted-foreground">Build, simulate, and benchmark Stellar transactions.</p>
        </div>
        <div className="flex bg-secondary p-1 rounded-lg">
          <button
            onClick={() => setMode('build')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'build' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Code2 className="h-3.5 w-3.5" />
            Builder
          </button>
          <button
            onClick={() => setMode('benchmark')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'benchmark' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Zap className="h-3.5 w-3.5" />
            Benchmark
          </button>
          <button
            onClick={() => setMode('sequence')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'sequence' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <ListOrdered className="h-3.5 w-3.5" />
            Sequence
          </button>
        </div>
      </div>

      {mode === 'benchmark' ? (
        <BenchmarkPanel xdr={xdr || ''} network={network} />
      ) : mode === 'sequence' ? (
        <SequenceRunner
          operations={operations}
          clearOperations={() => setOperations([])}
          sourceAccount={sourceAccount}
          memo={memo}
          network={network}
        />
      ) : (
        <>
          {/* Toolbar */}
          <ComposerToolbar
            xdr={xdr}
            opCount={operations.length}
            onSimulate={handleSimulate}
            onSignSubmit={() => {
              setSubmitResult(null);
              setShowSignDialog(true);
            }}
            simulating={simLoading}
            submitting={submitting}
            submitResult={submitResult}
          />

          {/* Source account */}
          <SourceAccountInput value={sourceAccount} onChange={setSourceAccount} />

          {/* Optional memo */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="memo-input"
              className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
            >
              Memo <span className="text-muted-foreground/40 font-normal normal-case">(optional)</span>
            </label>
            <input
              id="memo-input"
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Transaction memo text"
              maxLength={28}
              className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-violet-500/50 focus:border-violet-500/50 transition-colors"
            />
          </div>

          {/* 3-column composer area */}
          <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_280px] gap-4 min-h-[400px]">
            {/* Left — palette */}
            <div className="rounded-xl border border-border/60 bg-card/30 p-3 overflow-hidden">
              {manifestLoading ? (
                <ComposerOperationListSkeleton />
              ) : manifestError ? (
                <ErrorState
                  title="Failed to load operations"
                  message={manifestError}
                  onRetry={loadManifest}
                  retryLabel="Reload manifest"
                  details={manifestError}
                />
              ) : (
                <OperationPalette operations={manifest} onAdd={handleAdd} />
              )}
            </div>

            {/* Center — op list */}
            <div className="rounded-xl border border-border/60 bg-card/30 p-4 overflow-y-auto">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Transaction ({operations.length} op{operations.length !== 1 ? 's' : ''})
              </p>
              <OperationList
                operations={operations}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onRemove={handleRemove}
                onReorder={handleReorder}
              />
            </div>

            {/* Right — form */}
            <div className="rounded-xl border border-border/60 bg-card/30 p-4 overflow-y-auto">
              <OperationForm
                operation={selected}
                manifest={manifest}
                onChange={handleFieldChange}
              />
            </div>
          </div>

          {/* XDR preview */}
          <XdrPreview xdr={xdr} loading={xdrBuilding} />

          {/* Simulate result */}
          <SimulateResult
            result={simResult}
            loading={simLoading}
            error={simError}
            onRetry={handleSimulate}
          />

          {/* Sign & Submit dialog */}
          {showSignDialog && xdr && (
            <SignSubmitDialog
              xdr={xdr}
              network={network}
              onClose={() => setShowSignDialog(false)}
              onSuccess={handleSignSubmitSuccess}
              onError={handleSignSubmitError}
            />
          )}
        </>
      )}
    </div>
  );
}
