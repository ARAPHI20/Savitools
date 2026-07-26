import { SandboxService } from './sandbox.service';
import { BadRequestException } from '@nestjs/common';

describe('SandboxService', () => {
  let service: SandboxService;

  beforeEach(() => {
    service = new SandboxService();
  });

  describe('generateKeypair', () => {
    it('returns a valid Stellar keypair', () => {
      const keypair = service.generateKeypair();

      expect(keypair.publicKey).toMatch(/^G[A-Z0-9]{55}$/);
      expect(keypair.secretKey).toMatch(/^S[A-Z0-9]{55}$/);
    });

    it('generates unique keypairs each call', () => {
      const kp1 = service.generateKeypair();
      const kp2 = service.generateKeypair();

      expect(kp1.publicKey).not.toBe(kp2.publicKey);
      expect(kp1.secretKey).not.toBe(kp2.secretKey);
    });

    it('public key corresponds to secret key', () => {
      const { Keypair } = require('@stellar/stellar-sdk');
      const keypair = service.generateKeypair();

      const reconstructed = Keypair.fromSecret(keypair.secretKey);
      expect(reconstructed.publicKey()).toBe(keypair.publicKey);
    });
  });

  describe('fundFromFriendbot', () => {
    it('returns funding details on success', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ hash: 'tx-hash-123' }),
      });

      const result = await service.fundFromFriendbot('GTEST');

      expect(result.publicKey).toBe('GTEST');
      expect(result.funded).toBe(true);
      expect(result.txHash).toBe('tx-hash-123');
      expect(result.startingBalance).toBe('10,000 XLM');
    });

    it('throws on fetch failure', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Timeout'));

      await expect(service.fundFromFriendbot('GTEST')).rejects.toThrow(BadRequestException);
    });

    it('throws on non-ok response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'Invalid address',
      });

      await expect(service.fundFromFriendbot('GTEST')).rejects.toThrow(BadRequestException);
    });
  });

  describe('sendPayment input validation', () => {
    it('throws on invalid secret key', async () => {
      await expect(
        service.sendPayment({
          fromSecret: 'INVALID',
          toPublicKey: 'GDESTINATION',
          asset: 'XLM',
          amount: '10',
        }),
      ).rejects.toThrow('Invalid source secret key');
    });

    it('throws on short destination key', async () => {
      const { Keypair } = require('@stellar/stellar-sdk');
      const kp = Keypair.random();

      await expect(
        service.sendPayment({
          fromSecret: kp.secret(),
          toPublicKey: 'short',
          asset: 'XLM',
          amount: '10',
        }),
      ).rejects.toThrow('Invalid destination public key');
    });

    it('throws on zero amount', async () => {
      const { Keypair } = require('@stellar/stellar-sdk');
      const kp = Keypair.random();
      const dest = Keypair.random().publicKey();

      await expect(
        service.sendPayment({
          fromSecret: kp.secret(),
          toPublicKey: dest,
          asset: 'XLM',
          amount: '0',
        }),
      ).rejects.toThrow('Amount must be a positive number');
    });

    it('throws on negative amount', async () => {
      const { Keypair } = require('@stellar/stellar-sdk');
      const kp = Keypair.random();
      const dest = Keypair.random().publicKey();

      await expect(
        service.sendPayment({
          fromSecret: kp.secret(),
          toPublicKey: dest,
          asset: 'XLM',
          amount: '-5',
        }),
      ).rejects.toThrow('Amount must be a positive number');
    });

    it('throws on invalid asset format', async () => {
      const { Keypair } = require('@stellar/stellar-sdk');
      const kp = Keypair.random();
      const dest = Keypair.random().publicKey();

      await expect(
        service.sendPayment({
          fromSecret: kp.secret(),
          toPublicKey: dest,
          asset: 'INVALID_FORMAT',
          amount: '10',
        }),
      ).rejects.toThrow('Invalid asset format');
    });
  });
});
