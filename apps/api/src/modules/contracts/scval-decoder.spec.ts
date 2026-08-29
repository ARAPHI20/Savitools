import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { DecodedMapPair, DecodedScVal, decodeScVal, decodeScValFromXdr } from './scval-decoder';

const CONTRACT_ID = 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE';
const ACCOUNT_ID = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7';

describe('decodeScVal', () => {
  describe('scalars', () => {
    const cases: Array<[string, xdr.ScVal, string, unknown]> = [
      ['bool true', xdr.ScVal.scvBool(true), 'scvBool', true],
      ['bool false', xdr.ScVal.scvBool(false), 'scvBool', false],
      ['void', xdr.ScVal.scvVoid(), 'scvVoid', null],
      ['u32', xdr.ScVal.scvU32(42), 'scvU32', 42],
      ['i32', xdr.ScVal.scvI32(-42), 'scvI32', -42],
      ['string', nativeToScVal('hello'), 'scvString', 'hello'],
      ['symbol', nativeToScVal('transfer', { type: 'symbol' }), 'scvSymbol', 'transfer'],
      ['bytes', xdr.ScVal.scvBytes(Buffer.from([0xde, 0xad, 0xbe, 0xef])), 'scvBytes', 'deadbeef'],
    ];

    it.each(cases)('decodes %s', (_label, val, type, value) => {
      const decoded = decodeScVal(val);
      expect(decoded.type).toBe(type);
      expect(decoded.value).toEqual(value);
    });
  });

  describe('wide integers are stringified', () => {
    const cases: Array<[string, xdr.ScVal, string, string]> = [
      ['u64', nativeToScVal(123n, { type: 'u64' }), 'scvU64', '123'],
      ['i64', nativeToScVal(-123n, { type: 'i64' }), 'scvI64', '-123'],
      ['timepoint', xdr.ScVal.scvTimepoint(new xdr.Uint64(1700000000n)), 'scvTimepoint', '1700000000'],
      ['duration', xdr.ScVal.scvDuration(new xdr.Uint64(3600n)), 'scvDuration', '3600'],
      ['u128', nativeToScVal(340282366920938463463374607431768211455n, { type: 'u128' }), 'scvU128', '340282366920938463463374607431768211455'],
      ['i128', nativeToScVal(-170141183460469231731687303715884105728n, { type: 'i128' }), 'scvI128', '-170141183460469231731687303715884105728'],
      ['u256', nativeToScVal(12345678901234567890123456789012345678n, { type: 'u256' }), 'scvU256', '12345678901234567890123456789012345678'],
      ['i256', nativeToScVal(-12345678901234567890123456789012345678n, { type: 'i256' }), 'scvI256', '-12345678901234567890123456789012345678'],
    ];

    it.each(cases)('decodes %s to a decimal string', (_label, val, type, value) => {
      const decoded = decodeScVal(val);
      expect(decoded.type).toBe(type);
      expect(decoded.value).toBe(value);
      expect(typeof decoded.value).toBe('string');
    });

    it('preserves precision beyond Number.MAX_SAFE_INTEGER', () => {
      const big = 2n ** 53n + 1n;
      const decoded = decodeScVal(nativeToScVal(big, { type: 'u64' }));

      expect(decoded.value).toBe('9007199254740993');
      expect(BigInt(decoded.value as string)).toBe(big);
      // Routing the same value through Number would have lost the low bit.
      expect(BigInt(Number(decoded.value as string))).not.toBe(big);
    });
  });

  describe('addresses', () => {
    it('decodes a contract address', () => {
      const decoded = decodeScVal(new Address(CONTRACT_ID).toScVal());
      expect(decoded.type).toBe('scvAddress');
      expect(decoded.value).toBe(CONTRACT_ID);
    });

    it('decodes an account address', () => {
      const decoded = decodeScVal(new Address(ACCOUNT_ID).toScVal());
      expect(decoded.type).toBe('scvAddress');
      expect(decoded.value).toBe(ACCOUNT_ID);
    });
  });

  describe('errors', () => {
    it('decodes a contract error with its code', () => {
      const decoded = decodeScVal(xdr.ScVal.scvError(xdr.ScError.sceContract(7)));
      expect(decoded.type).toBe('scvError');
      expect(decoded.value).toEqual({ type: 'sceContract', contractCode: 7 });
    });

    it('decodes a host error with its symbolic code', () => {
      const decoded = decodeScVal(
        xdr.ScVal.scvError(xdr.ScError.sceWasmVm(xdr.ScErrorCode.scecInvalidInput())),
      );
      expect(decoded.value).toEqual({ type: 'sceWasmVm', code: 'scecInvalidInput' });
    });
  });

  describe('ledger keys and instances', () => {
    it('decodes a nonce key', () => {
      const val = xdr.ScVal.scvLedgerKeyNonce(
        new xdr.ScNonceKey({ nonce: xdr.Int64.fromString('42') }),
      );
      expect(decodeScVal(val)).toMatchObject({ type: 'scvLedgerKeyNonce', value: '42' });
    });

    it('decodes a ledger key contract instance', () => {
      const decoded = decodeScVal(xdr.ScVal.scvLedgerKeyContractInstance());
      expect(decoded.type).toBe('scvLedgerKeyContractInstance');
      expect(decoded.value).toBeNull();
    });

    it('decodes a wasm contract instance', () => {
      const val = xdr.ScVal.scvContractInstance(
        new xdr.ScContractInstance({
          executable: xdr.ContractExecutable.contractExecutableWasm(Buffer.alloc(32, 0xab)),
          storage: null,
        }),
      );
      const decoded = decodeScVal(val);
      expect(decoded.type).toBe('scvContractInstance');
      expect(decoded.value).toEqual({
        executable: { type: 'wasm', wasmHash: 'ab'.repeat(32) },
        storage: null,
      });
    });
  });

  describe('vectors', () => {
    it('decodes a vec of scalars into decoded children', () => {
      const val = xdr.ScVal.scvVec([xdr.ScVal.scvU32(1), nativeToScVal('two', { type: 'symbol' })]);
      const decoded = decodeScVal(val);
      expect(decoded.type).toBe('scvVec');
      const children = decoded.value as DecodedScVal[];
      expect(children.map((c) => c.type)).toEqual(['scvU32', 'scvSymbol']);
      expect(children.map((c) => c.value)).toEqual([1, 'two']);
    });

    it('decodes a deeply nested vec', () => {
      const depth = 5;
      let val = xdr.ScVal.scvU32(7);
      for (let i = 0; i < depth; i++) val = xdr.ScVal.scvVec([val]);

      let cursor = decodeScVal(val);
      for (let i = 0; i < depth; i++) {
        expect(cursor.type).toBe('scvVec');
        cursor = (cursor.value as DecodedScVal[])[0];
      }
      expect(cursor).toMatchObject({ type: 'scvU32', value: 7 });
    });

    it('decodes an empty vec', () => {
      expect(decodeScVal(xdr.ScVal.scvVec([])).value).toEqual([]);
    });
  });

  describe('maps', () => {
    it('decodes Map<Symbol, I128> into a plain object', () => {
      const val = xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
          key: nativeToScVal('amount', { type: 'symbol' }),
          val: nativeToScVal(1000n, { type: 'i128' }),
        }),
        new xdr.ScMapEntry({
          key: nativeToScVal('fee', { type: 'symbol' }),
          val: nativeToScVal(-5n, { type: 'i128' }),
        }),
      ]);

      const decoded = decodeScVal(val);
      expect(decoded.type).toBe('scvMap');
      expect(decoded.value).toEqual({ amount: '1000', fee: '-5' });
    });

    it('falls back to key/value pairs for non-scalar keys', () => {
      const val = xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvVec([xdr.ScVal.scvU32(1)]),
          val: xdr.ScVal.scvU32(9),
        }),
      ]);

      const decoded = decodeScVal(val);
      const pairs = decoded.value as DecodedMapPair[];
      expect(Array.isArray(pairs)).toBe(true);
      expect(pairs[0].key.type).toBe('scvVec');
      expect(pairs[0].value).toMatchObject({ type: 'scvU32', value: 9 });
    });

    it('falls back to pairs when distinct keys collapse to the same string', () => {
      const val = xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: nativeToScVal('1', { type: 'symbol' }), val: xdr.ScVal.scvU32(1) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvU32(1), val: xdr.ScVal.scvU32(2) }),
      ]);

      expect(Array.isArray(decodeScVal(val).value)).toBe(true);
    });

    it('decodes a nested map inside a map', () => {
      const inner = xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
          key: nativeToScVal('n', { type: 'symbol' }),
          val: nativeToScVal(1n, { type: 'u64' }),
        }),
      ]);
      const outer = xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: nativeToScVal('inner', { type: 'symbol' }), val: inner }),
      ]);

      expect(decodeScVal(outer).value).toEqual({ inner: { n: '1' } });
    });
  });

  describe('raw round-trip', () => {
    it('returns base64 that reconstructs the original ScVal', () => {
      const original = nativeToScVal(1000n, { type: 'i128' });
      const decoded = decodeScVal(original);

      expect(decoded.raw).toBe(original.toXDR('base64'));
      expect(xdr.ScVal.fromXDR(decoded.raw, 'base64').toXDR('base64')).toBe(
        original.toXDR('base64'),
      );
    });

    it('decodeScValFromXdr matches decodeScVal', () => {
      const original = nativeToScVal('transfer', { type: 'symbol' });
      expect(decodeScValFromXdr(original.toXDR('base64'))).toEqual(decodeScVal(original));
    });
  });

  describe('JSON-serializability', () => {
    it('serializes a payload mixing every wide type, bytes and nesting', () => {
      const val = xdr.ScVal.scvVec([
        nativeToScVal(1n, { type: 'u64' }),
        nativeToScVal(-1n, { type: 'i128' }),
        nativeToScVal(2n, { type: 'u256' }),
        xdr.ScVal.scvBytes(Buffer.from('cafe', 'hex')),
        new Address(CONTRACT_ID).toScVal(),
        xdr.ScVal.scvMap([
          new xdr.ScMapEntry({
            key: nativeToScVal('amount', { type: 'symbol' }),
            val: nativeToScVal(5n, { type: 'i128' }),
          }),
        ]),
      ]);

      const decoded = decodeScVal(val);
      expect(() => JSON.stringify(decoded)).not.toThrow();
      expect(JSON.parse(JSON.stringify(decoded))).toEqual(decoded);
    });
  });

  describe('coverage', () => {
    it('handles every ScValType variant the SDK exposes without throwing', () => {
      const variants = Object.keys(xdr.ScValType).filter(
        (key) => typeof (xdr.ScValType as unknown as Record<string, unknown>)[key] === 'function',
      );

      // Guards against a future SDK bump adding a variant the switch misses.
      expect(variants).toHaveLength(22);

      const samples: xdr.ScVal[] = [
        xdr.ScVal.scvBool(true),
        xdr.ScVal.scvVoid(),
        xdr.ScVal.scvError(xdr.ScError.sceContract(1)),
        xdr.ScVal.scvU32(1),
        xdr.ScVal.scvI32(1),
        nativeToScVal(1n, { type: 'u64' }),
        nativeToScVal(1n, { type: 'i64' }),
        xdr.ScVal.scvTimepoint(new xdr.Uint64(1n)),
        xdr.ScVal.scvDuration(new xdr.Uint64(1n)),
        nativeToScVal(1n, { type: 'u128' }),
        nativeToScVal(1n, { type: 'i128' }),
        nativeToScVal(1n, { type: 'u256' }),
        nativeToScVal(1n, { type: 'i256' }),
        xdr.ScVal.scvBytes(Buffer.from([1])),
        nativeToScVal('s'),
        nativeToScVal('s', { type: 'symbol' }),
        xdr.ScVal.scvVec([]),
        xdr.ScVal.scvMap([]),
        new Address(CONTRACT_ID).toScVal(),
        xdr.ScVal.scvContractInstance(
          new xdr.ScContractInstance({
            executable: xdr.ContractExecutable.contractExecutableStellarAsset(),
            storage: null,
          }),
        ),
        xdr.ScVal.scvLedgerKeyContractInstance(),
        xdr.ScVal.scvLedgerKeyNonce(new xdr.ScNonceKey({ nonce: xdr.Int64.fromString('1') })),
      ];

      const decodedTypes = samples.map((s) => decodeScVal(s).type);
      expect(new Set(decodedTypes).size).toBe(samples.length);
      expect(decodedTypes.sort()).toEqual(variants.sort());
      samples.forEach((s) => expect(() => JSON.stringify(decodeScVal(s))).not.toThrow());
    });
  });
});
