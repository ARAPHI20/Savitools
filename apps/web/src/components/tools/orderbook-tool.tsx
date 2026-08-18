'use client';

import {
  getOrderbook,
  getOrderbookHistory,
  type AssetType,
  type NetworkChoice,
  type OrderbookLevel,
  type OrderbookResult,
  type MidPriceSnapshot,
} from '@/lib/api';
import { ArrowLeftRight, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ErrorState, LoadingState } from './state-display';

const REFRESH_INTERVAL_MS = 10_000;
const DEPTH_ROWS = 15;
/** Circle USDC issuer on Stellar testnet (real, checksum-valid). */
const TESTNET_USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

interface AssetInput {
  type: AssetType;
  code: string;
  issuer: string;
}

function assetToParam(asset: AssetInput): string {
  if (asset.type === 'native') return 'XLM';
  return `${asset.code}:${asset.issuer}`;
}

function AssetPicker({
  label,
  asset,
  onChange,
}: {
  label: string;
  asset: AssetInput;
  onChange: (asset: AssetInput) => void;
}) {
  const isNative = asset.type === 'native';

  return (
    <div className="flex-1 min-w-[200px] space-y-2">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange({ ...asset, type: 'native' })}
          className={`px-3 py-2 text-sm font-mono rounded-md border transition-colors ${
            isNative
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background border-border hover:bg-muted'
          }`}
        >
          XLM
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...asset, type: 'credit_alphanum4' })}
          className={`px-3 py-2 text-sm rounded-md border transition-colors ${
            !isNative
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background border-border hover:bg-muted'
          }`}
        >
          Token
        </button>
      </div>
      {!isNative && (
        <div className="flex gap-2">
          <input
            type="text"
            value={asset.code}
            onChange={(e) => onChange({ ...asset, code: e.target.value })}
            placeholder="Code (e.g. USDC)"
            maxLength={12}
            className="w-1/3 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
          />
          <input
            type="text"
            value={asset.issuer}
            onChange={(e) => onChange({ ...asset, issuer: e.target.value })}
            placeholder="Issuer address"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
          />
        </div>
      )}
    </div>
  );
}

function LiquidityBadge({ score }: { score: number }) {
  const tone =
    score >= 70
      ? 'bg-green-500/10 text-green-600'
      : score >= 20
        ? 'bg-yellow-500/10 text-yellow-600'
        : 'bg-red-500/10 text-red-600';
  const label = score >= 70 ? 'Deep' : score >= 20 ? 'Moderate' : 'Thin';

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${tone}`}>
      {label} · {score}/100
    </span>
  );
}

function OrderbookRow({
  level,
  side,
  isBest,
}: {
  level: OrderbookLevel;
  side: 'bid' | 'ask';
  isBest: boolean;
}) {
  const barColor = side === 'bid' ? 'bg-green-500/10' : 'bg-red-500/10';
  const highlight = isBest ? (side === 'bid' ? 'bg-green-500/15' : 'bg-red-500/15') : '';
  const priceColor = side === 'bid' ? 'text-green-600' : 'text-red-600';

  return (
    <div className={`relative grid grid-cols-3 gap-2 px-2 py-1.5 text-xs font-mono ${highlight}`}>
      <div
        className={`absolute inset-y-0 ${side === 'bid' ? 'right-0' : 'left-0'} ${barColor}`}
        style={{ width: `${Math.min(level.cumulativePercent, 100)}%` }}
        aria-hidden="true"
      />
      <span className={`relative z-10 ${priceColor} font-medium`}>{Number(level.price).toFixed(7)}</span>
      <span className="relative z-10 text-right">{Number(level.amount).toFixed(2)}</span>
      <span className="relative z-10 text-right text-muted-foreground">
        {Number(level.cumulativeAmount).toFixed(2)}
      </span>
    </div>
  );
}

export function OrderbookTool() {
  const [network, setNetwork] = useState<NetworkChoice>('testnet');
  const [selling, setSelling] = useState<AssetInput>({ type: 'native', code: '', issuer: '' });
  const [buying, setBuying] = useState<AssetInput>({
    type: 'credit_alphanum4',
    code: 'USDC',
    issuer: TESTNET_USDC_ISSUER,
  });

  const [orderbook, setOrderbook] = useState<OrderbookResult | null>(null);
  const [history, setHistory] = useState<MidPriceSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const sellingParam = useMemo(() => assetToParam(selling), [selling]);
  const buyingParam = useMemo(() => assetToParam(buying), [buying]);

  const requestId = useRef(0);

  const fetchData = useCallback(async () => {
    const thisRequest = ++requestId.current;
    setLoading(true);
    setError('');

    try {
      const [orderbookRes, historyRes] = await Promise.all([
        getOrderbook(sellingParam, buyingParam, network),
        getOrderbookHistory(sellingParam, buyingParam, network),
      ]);

      if (thisRequest !== requestId.current) return;

      setOrderbook(orderbookRes);
      setHistory(historyRes);
      setLastUpdated(Date.now());
    } catch (err: any) {
      if (thisRequest !== requestId.current) return;
      setError(err.message ?? 'Failed to load order book');
    } finally {
      if (thisRequest === requestId.current) setLoading(false);
    }
  }, [sellingParam, buyingParam, network]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleSwap = () => {
    setSelling(buying);
    setBuying(selling);
  };

  const depthChartData = useMemo(() => {
    if (!orderbook) return [];

    const bidPoints = [...orderbook.bids].reverse().map((b) => ({
      price: Number(b.price),
      bidVolume: Number(b.cumulativeAmount),
    }));
    const askPoints = orderbook.asks.map((a) => ({
      price: Number(a.price),
      askVolume: Number(a.cumulativeAmount),
    }));

    return [...bidPoints, ...askPoints];
  }, [orderbook]);

  const sparklineData = useMemo(
    () =>
      history.map((h) => ({
        time: new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        midPrice: Number(h.midPrice),
      })),
    [history],
  );

  return (
    <div className="space-y-6">
      {/* Network toggle */}
      <div className="flex bg-secondary p-1 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setNetwork('mainnet')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            network === 'mainnet' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Mainnet
        </button>
        <button
          type="button"
          onClick={() => setNetwork('testnet')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            network === 'testnet' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Testnet
        </button>
      </div>

      {/* Asset pair selector */}
      <div className="flex flex-wrap items-end gap-3">
        <AssetPicker label="Selling" asset={selling} onChange={setSelling} />
        <button
          type="button"
          onClick={handleSwap}
          title="Swap pair"
          className="flex items-center justify-center h-10 w-10 rounded-md border border-border bg-background hover:bg-muted transition-colors mb-0.5"
        >
          <ArrowLeftRight className="h-4 w-4" />
        </button>
        <AssetPicker label="Buying" asset={buying} onChange={setBuying} />
      </div>

      {/* Refresh + last updated */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted disabled:opacity-40 transition-colors"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
        {lastUpdated && (
          <span className="text-xs text-muted-foreground">
            Last updated {new Date(lastUpdated).toLocaleTimeString()}
          </span>
        )}
      </div>

      {error && <ErrorState title="Failed to load order book" message={error} onRetry={fetchData} />}

      {!error && loading && !orderbook && <LoadingState label="Loading order book…" />}

      {orderbook && (
        <>
          {/* Spread panel */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-xl border border-border bg-card p-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Mid price</p>
              <p className="font-mono font-semibold">{orderbook.midPrice}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Spread</p>
              <p className="font-mono font-semibold">{orderbook.spread}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Spread (bps)</p>
              <p className="font-mono font-semibold">{orderbook.spreadBps.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Liquidity</p>
              <LiquidityBadge score={orderbook.liquidityScore} />
            </div>
          </div>

          {/* Mid-price sparkline */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-2">Mid-price (last 60m)</h3>
            <div className="h-20 w-full">
              {sparklineData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sparklineData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid hsl(var(--border))',
                        backgroundColor: 'hsl(var(--background))',
                        fontSize: '11px',
                      }}
                      labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="midPrice"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  Collecting history data…
                </div>
              )}
            </div>
          </div>

          {/* Depth chart */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-2">Depth chart</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={depthChartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="price"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    stroke="#888888"
                    fontSize={11}
                    tickFormatter={(v) => Number(v).toFixed(4)}
                  />
                  <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid hsl(var(--border))',
                      backgroundColor: 'hsl(var(--background))',
                      fontSize: '11px',
                    }}
                    formatter={(value: number) => value.toFixed(2)}
                    labelFormatter={(label) => `Price: ${Number(label).toFixed(7)}`}
                  />
                  <Area
                    type="stepAfter"
                    dataKey="bidVolume"
                    stroke="#22c55e"
                    fill="#22c55e"
                    fillOpacity={0.15}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Area
                    type="stepAfter"
                    dataKey="askVolume"
                    stroke="#ef4444"
                    fill="#ef4444"
                    fillOpacity={0.15}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Order book table */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-border">
              <div>
                <div className="grid grid-cols-3 gap-2 px-2 py-2 text-[11px] font-medium text-muted-foreground border-b border-border">
                  <span>Bid price</span>
                  <span className="text-right">Amount</span>
                  <span className="text-right">Cumulative</span>
                </div>
                <div className="divide-y divide-border/50 max-h-[420px] overflow-y-auto">
                  {orderbook.bids.slice(0, DEPTH_ROWS).map((level, i) => (
                    <OrderbookRow key={`bid-${i}`} level={level} side="bid" isBest={i === 0} />
                  ))}
                  {orderbook.bids.length === 0 && (
                    <p className="px-2 py-4 text-xs text-muted-foreground text-center">No bids</p>
                  )}
                </div>
              </div>
              <div>
                <div className="grid grid-cols-3 gap-2 px-2 py-2 text-[11px] font-medium text-muted-foreground border-b border-border">
                  <span>Ask price</span>
                  <span className="text-right">Amount</span>
                  <span className="text-right">Cumulative</span>
                </div>
                <div className="divide-y divide-border/50 max-h-[420px] overflow-y-auto">
                  {orderbook.asks.slice(0, DEPTH_ROWS).map((level, i) => (
                    <OrderbookRow key={`ask-${i}`} level={level} side="ask" isBest={i === 0} />
                  ))}
                  {orderbook.asks.length === 0 && (
                    <p className="px-2 py-4 text-xs text-muted-foreground text-center">No asks</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
