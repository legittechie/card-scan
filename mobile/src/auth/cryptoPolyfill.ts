import * as ExpoCrypto from "expo-crypto";

/**
 * Supabase Auth PKCE requires crypto.subtle.digest (SHA-256). React Native / Expo Go
 * do not provide Web Crypto by default — without this, PKCE falls back to "plain".
 */
function ensureWebCryptoPolyfill(): void {
  const hasDigest =
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.subtle !== "undefined" &&
    typeof globalThis.crypto.subtle.digest === "function";

  if (hasDigest) return;

  const subtle: Pick<SubtleCrypto, "digest"> = {
    digest: async (algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> => {
      const name = typeof algorithm === "string" ? algorithm : algorithm.name;
      if (name !== "SHA-256") {
        throw new Error(`Unsupported digest algorithm: ${name}`);
      }
      const bytes =
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, bytes);
    },
  };

  if (typeof globalThis.crypto === "undefined") {
    Object.defineProperty(globalThis, "crypto", {
      value: {
        getRandomValues: (array: ArrayBufferView) =>
          ExpoCrypto.getRandomValues(array as Uint8Array),
        subtle,
      },
      configurable: true,
    });
  } else {
    Object.defineProperty(globalThis.crypto, "subtle", {
      value: subtle,
      configurable: true,
    });
  }
}

ensureWebCryptoPolyfill();
