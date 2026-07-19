export const WATCH_EVENT_TYPES = [
  'transaction',
  'payment',
  'contract',
] as const;
export type WatchEventType = (typeof WATCH_EVENT_TYPES)[number];

export const ALERT_RULE_TYPES = [
  'amount_received_gte',
  'amount_sent_gte',
  'asset_received',
  'tx_failed',
  'any_activity',
] as const;
export type AlertRuleType = (typeof ALERT_RULE_TYPES)[number];

export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'webhook'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type WatchType = 'account' | 'contract';
export type StellarNetwork = 'testnet' | 'public';
export type StreamMode = 'sse' | 'poll';
export type StreamStatus = 'streaming' | 'polling' | 'error';
export type EventSource = 'transaction' | 'payment' | 'contract';
export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'retrying';

export interface AlertRuleDefinition {
  id: string;
  type: AlertRuleType;
  asset?: string;
  threshold?: string;
  channels: NotificationChannel[];
}

export interface DeliveryAttempt {
  channel: NotificationChannel;
  status: DeliveryStatus;
  attemptedAt?: string;
  error?: string;
}

export interface NormalizedMonitorEvent {
  pagingToken: string;
  source: EventSource;
  eventType: WatchEventType;
  ledger: number | null;
  occurredAt: string;
  amount?: string;
  asset?: string;
  sentAmount?: string;
  sentAsset?: string;
  receivedAmount?: string;
  receivedAsset?: string;
  from?: string;
  to?: string;
  successful?: boolean;
  transactionHash?: string;
  payload: Record<string, unknown>;
}

export interface NotificationJobData {
  alertEventId: string;
}
