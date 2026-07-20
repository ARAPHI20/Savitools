import { AlertEvaluator } from './alert-evaluator.service';
import { Watch } from './entities/watch.entity';
import { AlertRuleDefinition, NormalizedMonitorEvent } from './monitor.types';

describe('AlertEvaluator', () => {
  const evaluator = new AlertEvaluator();
  const watch = {
    publicKey: 'GACCOUNT',
  } as Watch;
  const payment = {
    pagingToken: '1',
    source: 'payment',
    eventType: 'payment',
    ledger: 1,
    occurredAt: new Date().toISOString(),
    amount: '100.0000000',
    asset: 'USDC:GISSUER',
    from: 'GSENDER',
    to: 'GACCOUNT',
    payload: {},
  } satisfies NormalizedMonitorEvent;

  it('matches received amounts without floating-point comparisons', () => {
    expect(
      evaluator.matches(
        rule('amount_received_gte', { threshold: '99.9999999' }),
        watch,
        payment,
      ),
    ).toBe(true);
    expect(
      evaluator.matches(
        rule('amount_received_gte', { threshold: '100.0000001' }),
        watch,
        payment,
      ),
    ).toBe(false);
  });

  it('distinguishes sent and received payments', () => {
    expect(
      evaluator.matches(
        rule('amount_sent_gte', { threshold: '1' }),
        watch,
        payment,
      ),
    ).toBe(false);
    expect(
      evaluator.matches(rule('amount_sent_gte', { threshold: '100' }), watch, {
        ...payment,
        from: 'GACCOUNT',
        to: 'GRECEIVER',
      }),
    ).toBe(true);
  });

  it('uses source amounts for outgoing path payments', () => {
    expect(
      evaluator.matches(rule('amount_sent_gte', { threshold: '150' }), watch, {
        ...payment,
        from: 'GACCOUNT',
        to: 'GRECEIVER',
        amount: '100',
        sentAmount: '200',
      }),
    ).toBe(true);
  });

  it('matches assets case-insensitively and only on receipt', () => {
    expect(
      evaluator.matches(
        rule('asset_received', { asset: 'usdc:gissuer' }),
        watch,
        payment,
      ),
    ).toBe(true);
    expect(
      evaluator.matches(
        rule('asset_received', { asset: 'USDC:GISSUER' }),
        watch,
        { ...payment, to: 'GOTHER' },
      ),
    ).toBe(false);
  });

  it('matches failed transactions and any activity', () => {
    const transaction: NormalizedMonitorEvent = {
      ...payment,
      source: 'transaction',
      eventType: 'transaction',
      successful: false,
    };
    expect(evaluator.matches(rule('tx_failed'), watch, transaction)).toBe(true);
    expect(evaluator.matches(rule('any_activity'), watch, transaction)).toBe(
      true,
    );
  });
});

function rule(
  type: AlertRuleDefinition['type'],
  values: Partial<AlertRuleDefinition> = {},
): AlertRuleDefinition {
  return { id: type, type, channels: ['in_app'], ...values };
}
