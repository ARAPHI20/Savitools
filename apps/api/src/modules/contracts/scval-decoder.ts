import { Address, scValToBigInt, xdr } from '@stellar/stellar-sdk';

/**
 * A decoded ScVal. `value` is always JSON-serializable: 64-bit-and-wider
 * integers become decimal strings and byte payloads become hex, because
 * Fastify's serializer throws on BigInt and mangles Buffer.
 */
export interface DecodedScVal {
  type: string;
  value: unknown;
  raw: string;
}

/** A map entry whose key is not a scalar, so it cannot be an object property. */
export interface DecodedMapPair {
  key: DecodedScVal;
  value: DecodedScVal;
}

/**
 * Scalar decodings are safe to use as an object key; everything else has to
 * survive as a { key, value } pair so no information is lost.
 */
function asObjectKey(decoded: DecodedScVal): string | null {
  const { value } = decoded;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function decodeMap(map: xdr.ScMapEntry[]): Record<string, unknown> | DecodedMapPair[] {
  const entries = map.map((entry) => ({
    key: decodeScVal(entry.key()),
    value: decodeScVal(entry.val()),
  }));

  const keys = entries.map((entry) => asObjectKey(entry.key));
  if (keys.some((key) => key === null)) {
    return entries;
  }

  const seen = new Set<string>();
  const record: Record<string, unknown> = {};
  for (let i = 0; i < entries.length; i++) {
    const key = keys[i] as string;
    // Distinct ScVal keys can collapse to the same string (e.g. Symbol("1")
    // and U32(1)); falling back to pairs keeps them distinguishable.
    if (seen.has(key)) return entries;
    seen.add(key);
    record[key] = entries[i].value.value;
  }
  return record;
}

function decodeError(error: xdr.ScError): Record<string, unknown> {
  const type = error.switch().name;
  switch (error.switch()) {
    case xdr.ScErrorType.sceContract():
      return { type, contractCode: error.contractCode() };
    default:
      return { type, code: error.code().name };
  }
}

function decodeContractInstance(
  instance: xdr.ScContractInstance,
): Record<string, unknown> {
  const executable = instance.executable();
  const storage = instance.storage();
  return {
    executable:
      executable.switch() === xdr.ContractExecutableType.contractExecutableWasm()
        ? { type: 'wasm', wasmHash: executable.wasmHash().toString('hex') }
        : { type: 'stellarAsset' },
    storage: storage ? decodeMap(storage) : null,
  };
}

/**
 * Recursively decodes an ScVal into a typed, JSON-safe shape. Never throws:
 * an unrecognised or malformed variant degrades to a `raw`-only result so a
 * single odd event cannot take down a whole query.
 */
export function decodeScVal(val: xdr.ScVal): DecodedScVal {
  const raw = val.toXDR('base64');
  const type = val.switch().name;

  try {
    switch (val.switch()) {
      case xdr.ScValType.scvBool():
        return { type, value: val.b(), raw };

      case xdr.ScValType.scvVoid():
        return { type, value: null, raw };

      case xdr.ScValType.scvError():
        return { type, value: decodeError(val.error()), raw };

      case xdr.ScValType.scvU32():
        return { type, value: val.u32(), raw };

      case xdr.ScValType.scvI32():
        return { type, value: val.i32(), raw };

      // Timepoint and duration are UnsignedHyper wrappers, not integer ScVals —
      // scValToBigInt rejects them, so they get their own branch.
      case xdr.ScValType.scvTimepoint():
        return { type, value: val.timepoint().toString(), raw };

      case xdr.ScValType.scvDuration():
        return { type, value: val.duration().toString(), raw };

      // 64-bit and wider are stringified: JSON cannot carry BigInt, and
      // Number would silently lose precision past 2^53.
      case xdr.ScValType.scvU64():
      case xdr.ScValType.scvI64():
      case xdr.ScValType.scvU128():
      case xdr.ScValType.scvI128():
      case xdr.ScValType.scvU256():
      case xdr.ScValType.scvI256():
        return { type, value: scValToBigInt(val).toString(), raw };

      case xdr.ScValType.scvBytes():
        return { type, value: val.bytes().toString('hex'), raw };

      case xdr.ScValType.scvString(): {
        const str = val.str();
        return {
          type,
          value: typeof str === 'string' ? str : str.toString(),
          raw,
        };
      }

      case xdr.ScValType.scvSymbol(): {
        const sym = val.sym();
        return {
          type,
          value: typeof sym === 'string' ? sym : sym.toString(),
          raw,
        };
      }

      case xdr.ScValType.scvVec():
        return { type, value: (val.vec() ?? []).map(decodeScVal), raw };

      case xdr.ScValType.scvMap():
        return { type, value: decodeMap(val.map() ?? []), raw };

      case xdr.ScValType.scvAddress():
        return { type, value: Address.fromScAddress(val.address()).toString(), raw };

      case xdr.ScValType.scvContractInstance():
        return { type, value: decodeContractInstance(val.instance()), raw };

      case xdr.ScValType.scvLedgerKeyContractInstance():
        return { type, value: null, raw };

      case xdr.ScValType.scvLedgerKeyNonce():
        return { type, value: val.nonceKey().nonce().toString(), raw };

      default:
        return { type, value: null, raw };
    }
  } catch {
    // Decoding is best-effort; `raw` is always the authoritative bytes.
    return { type, value: null, raw };
  }
}

/** Decodes an ScVal already in base64 wire form, as the RPC node returns it. */
export function decodeScValFromXdr(base64: string): DecodedScVal {
  return decodeScVal(xdr.ScVal.fromXDR(base64, 'base64'));
}
