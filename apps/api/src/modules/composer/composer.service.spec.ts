import { ComposerService, OPERATION_MANIFEST } from './composer.service';

describe('ComposerService', () => {
  let service: ComposerService;

  beforeEach(() => {
    service = new ComposerService();
  });

  describe('getOperations', () => {
    it('returns the operation manifest', () => {
      const result = service.getOperations();
      expect(result).toBe(OPERATION_MANIFEST);
    });

    it('includes payment operation', () => {
      const ops = service.getOperations();
      const payment = ops.find((op) => op.type === 'payment');
      expect(payment).toBeDefined();
      expect(payment!.label).toBe('Payment');
      expect(payment!.fields.length).toBeGreaterThan(0);
    });

    it('includes all 12 operation types', () => {
      const ops = service.getOperations();
      expect(ops).toHaveLength(12);

      const types = ops.map((op) => op.type);
      expect(types).toContain('payment');
      expect(types).toContain('create_account');
      expect(types).toContain('change_trust');
      expect(types).toContain('manage_sell_offer');
      expect(types).toContain('manage_buy_offer');
      expect(types).toContain('create_passive_sell_offer');
      expect(types).toContain('set_options');
      expect(types).toContain('account_merge');
      expect(types).toContain('allow_trust');
      expect(types).toContain('path_payment_strict_send');
      expect(types).toContain('path_payment_strict_receive');
      expect(types).toContain('manage_data');
    });

    it('each operation has required metadata', () => {
      const ops = service.getOperations();
      for (const op of ops) {
        expect(op.type).toBeDefined();
        expect(op.label).toBeDefined();
        expect(op.description).toBeDefined();
        expect(Array.isArray(op.fields)).toBe(true);
        for (const field of op.fields) {
          expect(field.name).toBeDefined();
          expect(field.label).toBeDefined();
          expect(field.type).toBeDefined();
          expect(typeof field.required).toBe('boolean');
        }
      }
    });
  });
});
