'use client';

import { useState } from 'react';
import { OperationList } from './operation-list';
import { OperationForm } from './operation-form';
import { XdrPreview } from './xdr-preview';
import { SimulateResult } from './simulate-result';
import { BenchmarkPanel } from './benchmark-panel';
import { useNetwork } from '@/lib/network-context';
import { Sliders, Code2, Play, Zap } from 'lucide-react';

export function ComposerTool() {
  const { network } = useNetwork();
  const [mode, setMode] = useState<'build' | 'benchmark'>('build');
  const [operations, setOperations] = useState<any[]>([]);
  const [selectedOpIndex, setSelectedOpIndex] = useState<number | null>(null);
  const [signerSecret, setSignerSecret] = useState('');
  const [fee, setFee] = useState('100');
  const [timeBounds, setTimeBounds] = useState<any>(null);
  const [builtXdr, setBuiltXdr] = useState('');
  const [buildHash, setBuildHash] = useState('');
  const [simResult, setSimResult] = useState<any>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  const handleAddOperation = (type: string) => {
    const newOp: any = { type };
    if (type === 'payment') {
      newOp.destination = '';
      newOp.asset = { code: 'native' };
      newOp.amount = '10';
    } else if (type === 'create_account') {
      newOp.destination = '';
      newOp.startingBalance = '10';
    } else if (type === 'change_trust') {
      newOp.asset = { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' };
    } else if (type === 'account_merge') {
      newOp.destination = '';
    } else if (type === 'set_options') {
      newOp.homeDomain = 'example.com';
    }
    setOperations([...operations, newOp]);
    setSelectedOpIndex(operations.length);
  };

  const handleUpdateOperation = (updatedOp: any) => {
    if (selectedOpIndex === null) return;
    const updated = [...operations];
    updated[selectedOpIndex] = updatedOp;
    setOperations(updated);
  };

  const handleDeleteOperation = (index: number) => {
    const updated = operations.filter((_, i) => i !== index);
    setOperations(updated);
    setSelectedOpIndex(null);
  };

  const handleBuild = async () => {
    if (!signerSecret) {
      setBuildError('Signer secret key is required to build and sign.');
      return;
    }
    setBuilding(true);
    setBuildError(null);

    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${API_BASE}/composer/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operations,
          signerSecret,
          fee,
          timeBounds,
          network,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to build transaction');
      }

      const data = await res.json();
      setBuiltXdr(data.xdr);
      setBuildHash(data.hash);

      // Automatically simulate
      handleSimulate(data.xdr);
    } catch (err: any) {
      setBuildError(err.message || 'Failed to build transaction');
    } finally {
      setBuilding(false);
    }
  };

  const handleSimulate = async (xdrToSim: string) => {
    setSimLoading(true);
    setSimError(null);
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${API_BASE}/composer/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          xdr: xdrToSim,
          network,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Simulation failed');
      }

      const data = await res.json();
      setSimResult(data);
    } catch (err: any) {
      setSimError(err.message || 'Simulation failed');
    } finally {
      setSimLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Mode Switcher Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card border rounded-xl p-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transaction Composer</h1>
          <p className="text-sm text-muted-foreground">Build, simulate, and benchmark Stellar transactions.</p>
        </div>
        <div className="flex bg-secondary p-1 rounded-lg">
          <button
            onClick={() => setMode('build')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${mode === 'build' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Code2 className="h-4 w-4" />
            Builder
          </button>
          <button
            onClick={() => setMode('benchmark')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${mode === 'benchmark' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Zap className="h-4 w-4" />
            Benchmark
          </button>
        </div>
      </div>

      {mode === 'benchmark' ? (
        <BenchmarkPanel xdr={builtXdr} network={network} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <div className="border rounded-xl bg-card p-4 space-y-4 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Operations ({operations.length})
              </h2>
              <OperationList
                operations={operations}
                selectedOpIndex={selectedOpIndex}
                onSelect={setSelectedOpIndex}
                onAdd={handleAddOperation}
                onDelete={handleDeleteOperation}
              />
            </div>

            <div className="border rounded-xl bg-card p-4 space-y-4 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Sign & Build Settings
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Signer Secret Key (S...)</label>
                  <input
                    type="password"
                    value={signerSecret}
                    onChange={(e) => setSignerSecret(e.target.value)}
                    placeholder="S..."
                    className="w-full mt-1 px-3 py-2 border rounded-md bg-background text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Fee (stroops)</label>
                  <input
                    type="text"
                    value={fee}
                    onChange={(e) => setFee(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border rounded-md bg-background text-sm font-mono"
                  />
                </div>
                {buildError && (
                  <p className="text-xs text-rose-500 font-medium">{buildError}</p>
                )}
                <button
                  onClick={handleBuild}
                  disabled={building}
                  className="w-full py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {building ? 'Building & Signing...' : 'Build & Sign Transaction'}
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            {selectedOpIndex !== null && operations[selectedOpIndex] ? (
              <div className="border rounded-xl bg-card p-6 shadow-sm">
                <h2 className="text-base font-semibold mb-4 capitalize">
                  Configure {operations[selectedOpIndex].type.replace('_', ' ')}
                </h2>
                <OperationForm
                  operation={operations[selectedOpIndex]}
                  onChange={handleUpdateOperation}
                />
              </div>
            ) : (
              <div className="border rounded-xl bg-card p-8 text-center text-muted-foreground">
                Select or add an operation on the left to configure parameters.
              </div>
            )}

            {builtXdr && (
              <div className="space-y-6">
                <div className="border rounded-xl bg-card p-4 shadow-sm">
                  <XdrPreview xdr={builtXdr} hash={buildHash} />
                </div>

                <div className="border rounded-xl bg-card p-4 shadow-sm space-y-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Simulation Results
                  </h2>
                  <SimulateResult
                    result={simResult}
                    loading={simLoading}
                    error={simError}
                    onRetry={() => handleSimulate(builtXdr)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
