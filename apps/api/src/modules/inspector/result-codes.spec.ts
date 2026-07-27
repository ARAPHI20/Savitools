import { TX_RESULT_CODES, OP_RESULT_CODES, explainTxCode, explainOpCode } from './result-codes';

describe('result-codes', () => {
  describe('TX_RESULT_CODES', () => {
    it('maps tx_success to a human-readable message', () => {
      expect(TX_RESULT_CODES.tx_success).toBe('All operations succeeded.');
    });

    it('maps tx_failed to a human-readable message', () => {
      expect(TX_RESULT_CODES.tx_failed).toBe('One or more operations failed.');
    });

    it('maps all known transaction result codes', () => {
      expect(Object.keys(TX_RESULT_CODES).length).toBeGreaterThanOrEqual(15);
    });
  });

  describe('OP_RESULT_CODES', () => {
    it('maps op_success', () => {
      expect(OP_RESULT_CODES.op_success).toBe('Operation succeeded.');
    });

    it('contains payment-related codes', () => {
      expect(OP_RESULT_CODES.op_no_trust).toBeDefined();
      expect(OP_RESULT_CODES.op_not_authorized).toBeDefined();
      expect(OP_RESULT_CODES.op_no_issuer).toBeDefined();
      expect(OP_RESULT_CODES.op_line_full).toBeDefined();
    });

    it('contains DEX-related codes', () => {
      expect(OP_RESULT_CODES.op_sell_no_trust).toBeDefined();
      expect(OP_RESULT_CODES.op_buy_no_trust).toBeDefined();
      expect(OP_RESULT_CODES.op_offer_not_found).toBeDefined();
      expect(OP_RESULT_CODES.op_too_few_offers).toBeDefined();
    });
  });

  describe('explainTxCode', () => {
    it('returns human-readable text for known codes', () => {
      expect(explainTxCode('tx_success')).toBe('All operations succeeded.');
      expect(explainTxCode('tx_bad_seq')).toBe('Sequence number does not match source account.');
    });

    it('returns fallback for unknown codes', () => {
      expect(explainTxCode('tx_whatever')).toBe('Unknown transaction result code: tx_whatever');
    });
  });

  describe('explainOpCode', () => {
    it('returns human-readable text for known codes', () => {
      expect(explainOpCode('op_success')).toBe('Operation succeeded.');
      expect(explainOpCode('op_underfunded')).toContain('base reserve');
    });

    it('returns fallback for unknown codes', () => {
      expect(explainOpCode('op_foo_bar')).toBe('Unknown operation result code: op_foo_bar');
    });
  });
});
