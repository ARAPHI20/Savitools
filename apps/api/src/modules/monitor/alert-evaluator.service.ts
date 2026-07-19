import { Injectable } from '@nestjs/common';
import { AlertRuleDefinition, NormalizedMonitorEvent } from './monitor.types';
import { Watch } from './entities/watch.entity';

@Injectable()
export class AlertEvaluator {
  matches(
    rule: AlertRuleDefinition,
    watch: Watch,
    event: NormalizedMonitorEvent,
  ): boolean {
    switch (rule.type) {
      case 'any_activity':
        return true;
      case 'tx_failed':
        return event.source === 'transaction' && event.successful === false;
      case 'asset_received':
        return (
          event.source === 'payment' &&
          event.to === watch.publicKey &&
          this.sameAsset(event.receivedAsset ?? event.asset, rule.asset)
        );
      case 'amount_received_gte':
        return (
          event.source === 'payment' &&
          event.to === watch.publicKey &&
          this.meetsThreshold(
            event.receivedAmount ?? event.amount,
            rule.threshold,
          )
        );
      case 'amount_sent_gte':
        return (
          event.source === 'payment' &&
          event.from === watch.publicKey &&
          this.meetsThreshold(event.sentAmount ?? event.amount, rule.threshold)
        );
    }
  }

  private sameAsset(actual?: string, expected?: string): boolean {
    return Boolean(
      actual && expected && actual.toLowerCase() === expected.toLowerCase(),
    );
  }

  private meetsThreshold(actual?: string, threshold?: string): boolean {
    if (!actual || !threshold) {
      return false;
    }

    const left = this.decimalParts(actual);
    const right = this.decimalParts(threshold);
    if (!left || !right) {
      return false;
    }

    const scale = Math.max(left.fraction.length, right.fraction.length);
    const leftValue = BigInt(
      `${left.whole}${left.fraction.padEnd(scale, '0')}`,
    );
    const rightValue = BigInt(
      `${right.whole}${right.fraction.padEnd(scale, '0')}`,
    );
    return leftValue >= rightValue;
  }

  private decimalParts(
    value: string,
  ): { whole: string; fraction: string } | null {
    const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
    if (!match) {
      return null;
    }
    return { whole: match[1], fraction: match[2] ?? '' };
  }
}
