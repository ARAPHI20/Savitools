import { decodeOperation } from './operation-decoder';

function makeAsset(isNative: boolean, code = 'XLM', issuer = 'GABC') {
  return {
    isNative: () => isNative,
    getCode: () => code,
    getIssuer: () => issuer,
  };
}

describe('decodeOperation', () => {
  describe('createAccount', () => {
    it('decodes a create account operation', () => {
      const result = decodeOperation({
        type: 'createAccount',
        destination: 'GDEST',
        startingBalance: '10',
        source: 'GSRC',
      });
      expect(result.type).toBe('create_account');
      expect(result.label).toBe('Create Account');
      expect(result.fields.destination).toBe('GDEST');
      expect(result.fields.startingBalance).toBe('10 XLM');
      expect(result.sourceAccount).toBe('GSRC');
    });

    it('sets sourceAccount to null when omitted', () => {
      const result = decodeOperation({
        type: 'createAccount',
        destination: 'GDEST',
        startingBalance: '1',
      });
      expect(result.sourceAccount).toBeNull();
    });
  });

  describe('payment', () => {
    it('decodes a native payment', () => {
      const result = decodeOperation({
        type: 'payment',
        destination: 'GDEST',
        asset: makeAsset(true),
        amount: '100',
      });
      expect(result.type).toBe('payment');
      expect(result.label).toBe('Payment');
      expect(result.fields.asset).toBe('XLM');
      expect(result.fields.amount).toBe('100');
    });

    it('decodes a non-native payment with issuer', () => {
      const result = decodeOperation({
        type: 'payment',
        destination: 'GDEST',
        asset: makeAsset(false, 'USDC', 'GISSUER'),
        amount: '50',
      });
      expect(result.fields.asset).toBe('USDC:GISSUER');
    });
  });

  describe('pathPaymentStrictReceive', () => {
    it('decodes with path', () => {
      const result = decodeOperation({
        type: 'pathPaymentStrictReceive',
        sendAsset: makeAsset(true),
        sendMax: '100',
        destination: 'GDEST',
        destAsset: makeAsset(false, 'USDC', 'GISS'),
        destAmount: '50',
        path: [makeAsset(false, 'BTC', 'GABC')],
      });
      expect(result.type).toBe('path_payment_strict_receive');
      expect(result.fields.path).toBe('BTC:GABC');
    });

    it('decodes with empty path as direct', () => {
      const result = decodeOperation({
        type: 'pathPaymentStrictReceive',
        sendAsset: makeAsset(true),
        sendMax: '100',
        destination: 'GDEST',
        destAsset: makeAsset(false, 'USDC', 'GISS'),
        destAmount: '50',
        path: [],
      });
      expect(result.fields.path).toBe('direct');
    });
  });

  describe('pathPaymentStrictSend', () => {
    it('decodes correctly', () => {
      const result = decodeOperation({
        type: 'pathPaymentStrictSend',
        sendAsset: makeAsset(true),
        sendAmount: '100',
        destination: 'GDEST',
        destAsset: makeAsset(false, 'USDC', 'GISS'),
        destMin: '45',
        path: [],
      });
      expect(result.type).toBe('path_payment_strict_send');
      expect(result.label).toBe('Path Payment (Strict Send)');
      expect(result.fields.sendAmount).toBe('100');
      expect(result.fields.destMin).toBe('45');
    });
  });

  describe('manageSellOffer', () => {
    it('decodes a sell offer', () => {
      const result = decodeOperation({
        type: 'manageSellOffer',
        selling: makeAsset(true),
        buying: makeAsset(false, 'USDC', 'GISS'),
        amount: '200',
        price: { n: 3, d: 1 },
        offerId: '42',
      });
      expect(result.type).toBe('manage_sell_offer');
      expect(result.fields.amount).toBe('200');
      expect(result.fields.offerId).toBe('42');
      expect(result.fields.price).toContain('3/1');
    });
  });

  describe('manageBuyOffer', () => {
    it('decodes a buy offer', () => {
      const result = decodeOperation({
        type: 'manageBuyOffer',
        selling: makeAsset(true),
        buying: makeAsset(false, 'USDC', 'GISS'),
        buyAmount: '50',
        price: { n: 1, d: 2 },
        offerId: '0',
      });
      expect(result.type).toBe('manage_buy_offer');
      expect(result.fields.buyAmount).toBe('50');
    });
  });

  describe('createPassiveSellOffer', () => {
    it('decodes a passive sell offer', () => {
      const result = decodeOperation({
        type: 'createPassiveSellOffer',
        selling: makeAsset(true),
        buying: makeAsset(false, 'USDC', 'GISS'),
        amount: '100',
        price: { n: 2, d: 1 },
      });
      expect(result.type).toBe('create_passive_sell_offer');
      expect(result.label).toBe('Passive Sell Offer');
    });
  });

  describe('setOptions', () => {
    it('decodes set options with all fields', () => {
      const result = decodeOperation({
        type: 'setOptions',
        inflationDest: 'GINFL',
        homeDomain: 'example.com',
        masterWeight: 10,
        lowThreshold: 1,
        medThreshold: 3,
        highThreshold: 5,
        setFlags: 1,
        clearFlags: 2,
        signer: { ed25519PublicKey: 'GSIGNER', weight: 2 },
      });
      expect(result.type).toBe('set_options');
      expect(result.fields.inflationDest).toBe('GINFL');
      expect(result.fields.homeDomain).toBe('example.com');
      expect(result.fields.masterWeight).toBe('10');
      expect(result.fields.signer).toContain('GSIGNER');
    });

    it('handles null fields', () => {
      const result = decodeOperation({ type: 'setOptions' });
      expect(result.fields.inflationDest).toBeNull();
      expect(result.fields.homeDomain).toBeNull();
      expect(result.fields.signer).toBeNull();
    });
  });

  describe('changeTrust', () => {
    it('decodes change trust with limit', () => {
      const result = decodeOperation({
        type: 'changeTrust',
        line: makeAsset(false, 'USDC', 'GISS'),
        limit: '1000',
      });
      expect(result.type).toBe('change_trust');
      expect(result.fields.limit).toBe('1000');
    });

    it('defaults limit to max', () => {
      const result = decodeOperation({
        type: 'changeTrust',
        line: makeAsset(false, 'USDC', 'GISS'),
      });
      expect(result.fields.limit).toBe('max');
    });
  });

  describe('allowTrust', () => {
    it('decodes allow trust', () => {
      const result = decodeOperation({
        type: 'allowTrust',
        trustor: 'GTRUSTOR',
        assetCode: 'USDC',
        authorize: true,
      });
      expect(result.type).toBe('allow_trust');
      expect(result.fields.trustor).toBe('GTRUSTOR');
      expect(result.fields.authorize).toBe('true');
    });
  });

  describe('accountMerge', () => {
    it('decodes account merge', () => {
      const result = decodeOperation({
        type: 'accountMerge',
        destination: 'GDEST',
      });
      expect(result.type).toBe('account_merge');
      expect(result.fields.destination).toBe('GDEST');
    });
  });

  describe('inflation', () => {
    it('decodes inflation', () => {
      const result = decodeOperation({ type: 'inflation' });
      expect(result.type).toBe('inflation');
      expect(result.label).toBe('Inflation');
      expect(result.fields).toEqual({});
    });
  });

  describe('manageData', () => {
    it('decodes manage data with value', () => {
      const result = decodeOperation({
        type: 'manageData',
        name: 'my-key',
        value: Buffer.from('hello'),
      });
      expect(result.type).toBe('manage_data');
      expect(result.fields.name).toBe('my-key');
      expect(result.fields.value).toBe('hello');
    });

    it('decodes manage data with null value', () => {
      const result = decodeOperation({
        type: 'manageData',
        name: 'my-key',
        value: null,
      });
      expect(result.fields.value).toBeNull();
    });
  });

  describe('bumpSequence', () => {
    it('decodes bump sequence', () => {
      const result = decodeOperation({
        type: 'bumpSequence',
        bumpTo: '999999',
      });
      expect(result.type).toBe('bump_sequence');
      expect(result.fields.bumpTo).toBe('999999');
    });
  });

  describe('createClaimableBalance', () => {
    it('decodes with claimants', () => {
      const result = decodeOperation({
        type: 'createClaimableBalance',
        asset: makeAsset(true),
        amount: '50',
        claimants: [{}, {}],
      });
      expect(result.type).toBe('create_claimable_balance');
      expect(result.fields.claimants).toBe('2');
    });

    it('decodes with empty claimants', () => {
      const result = decodeOperation({
        type: 'createClaimableBalance',
        asset: makeAsset(true),
        amount: '50',
      });
      expect(result.fields.claimants).toBe('0');
    });
  });

  describe('claimClaimableBalance', () => {
    it('decodes claim claimable balance', () => {
      const result = decodeOperation({
        type: 'claimClaimableBalance',
        balanceId: 'abc123',
      });
      expect(result.type).toBe('claim_claimable_balance');
      expect(result.fields.balanceId).toBe('abc123');
    });
  });

  describe('beginSponsoringFutureReserves', () => {
    it('decodes begin sponsoring', () => {
      const result = decodeOperation({
        type: 'beginSponsoringFutureReserves',
        sponsoredId: 'GSPONSORED',
      });
      expect(result.type).toBe('begin_sponsoring_future_reserves');
      expect(result.fields.sponsoredId).toBe('GSPONSORED');
    });
  });

  describe('endSponsoringFutureReserves', () => {
    it('decodes end sponsoring', () => {
      const result = decodeOperation({
        type: 'endSponsoringFutureReserves',
      });
      expect(result.type).toBe('end_sponsoring_future_reserves');
      expect(result.fields).toEqual({});
    });
  });

  describe('revokeSponsorship', () => {
    it('decodes revoke sponsorship', () => {
      const result = decodeOperation({
        type: 'revokeSponsorship',
        revokeSponsorshipType: 'account',
      });
      expect(result.type).toBe('revoke_sponsorship');
      expect(result.fields.type).toBe('account');
    });
  });

  describe('clawback', () => {
    it('decodes clawback', () => {
      const result = decodeOperation({
        type: 'clawback',
        asset: makeAsset(false, 'USDC', 'GISS'),
        from: 'GFROM',
        amount: '100',
      });
      expect(result.type).toBe('clawback');
      expect(result.fields.from).toBe('GFROM');
    });
  });

  describe('clawbackClaimableBalance', () => {
    it('decodes clawback claimable balance', () => {
      const result = decodeOperation({
        type: 'clawbackClaimableBalance',
        balanceId: 'xyz',
      });
      expect(result.type).toBe('clawback_claimable_balance');
      expect(result.fields.balanceId).toBe('xyz');
    });
  });

  describe('setTrustLineFlags', () => {
    it('decodes set trustline flags', () => {
      const result = decodeOperation({
        type: 'setTrustLineFlags',
        trustor: 'GTRUSTOR',
        asset: makeAsset(false, 'USDC', 'GISS'),
        setFlags: 1,
        clearFlags: 2,
      });
      expect(result.type).toBe('set_trust_line_flags');
      expect(result.fields.setFlags).toBe('1');
      expect(result.fields.clearFlags).toBe('2');
    });
  });

  describe('liquidityPoolDeposit', () => {
    it('decodes liquidity pool deposit', () => {
      const result = decodeOperation({
        type: 'liquidityPoolDeposit',
        liquidityPoolId: 'pool123',
        maxAmountA: '100',
        maxAmountB: '200',
        minPrice: { n: 1, d: 2 },
        maxPrice: { n: 2, d: 1 },
      });
      expect(result.type).toBe('liquidity_pool_deposit');
      expect(result.fields.liquidityPoolId).toBe('pool123');
    });
  });

  describe('liquidityPoolWithdraw', () => {
    it('decodes liquidity pool withdraw', () => {
      const result = decodeOperation({
        type: 'liquidityPoolWithdraw',
        liquidityPoolId: 'pool123',
        amount: '50',
        minAmountA: '20',
        minAmountB: '30',
      });
      expect(result.type).toBe('liquidity_pool_withdraw');
    });
  });

  describe('invokeHostFunction (Soroban)', () => {
    it('decodes invoke host function', () => {
      const result = decodeOperation({
        type: 'invokeHostFunction',
        func: {
          switch: () => ({ name: 'invoke' }),
        },
      });
      expect(result.type).toBe('invoke_host_function');
      expect(result.label).toBe('Invoke Host Function (Soroban)');
      expect(result.fields.hostFunction).toBe('invoke');
    });
  });

  describe('extendFootprintTtl', () => {
    it('decodes extend footprint ttl', () => {
      const result = decodeOperation({
        type: 'extendFootprintTtl',
        extendTo: 1000,
      });
      expect(result.type).toBe('extend_footprint_ttl');
      expect(result.fields.extendTo).toBe('1000');
    });
  });

  describe('restoreFootprint', () => {
    it('decodes restore footprint', () => {
      const result = decodeOperation({ type: 'restoreFootprint' });
      expect(result.type).toBe('restore_footprint');
      expect(result.label).toBe('Restore Footprint');
      expect(result.fields).toEqual({});
    });
  });

  describe('unknown operation', () => {
    it('returns fallback for unknown type', () => {
      const result = decodeOperation({ type: 'unknownOp' });
      expect(result.type).toBe('unknownOp');
      expect(result.label).toBe('unknownOp');
      expect(result.fields).toEqual({});
    });

    it('handles missing type', () => {
      const result = decodeOperation({});
      expect(result.type).toBe('unknown');
      expect(result.label).toBe('Unknown Operation');
    });
  });
});
