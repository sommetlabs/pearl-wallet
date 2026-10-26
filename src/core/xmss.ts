/** Only official XMSS key generation is exposed. Stateful XMSS signing is deliberately absent. */
export interface XmssPublicKeyProvider {
  publicKey(
    privateSeed: Uint8Array,
    publicSeed: Uint8Array,
  ): Promise<Uint8Array>;
}

interface XmssExports {
  memory: WebAssembly.Memory;
  malloc(size: number): number;
  xmss_keygen(
    privateSeed: number,
    publicSeed: number,
    publicKey: number,
    secretKey: number,
  ): number;
}

export async function loadXmss(
  bytes: Uint8Array,
): Promise<XmssPublicKeyProvider> {
  const module = await WebAssembly.compile(Uint8Array.from(bytes).buffer);
  if (WebAssembly.Module.imports(module).length !== 0)
    throw new Error("XMSS must have no host imports");
  const exports = WebAssembly.Module.exports(module);
  for (const [name, kind] of [
    ["memory", "memory"],
    ["malloc", "function"],
    ["xmss_keygen", "function"],
  ])
    if (!exports.some((entry) => entry.name === name && entry.kind === kind))
      throw new Error("Invalid XMSS module");
  return {
    async publicKey(privateSeed, publicSeed) {
      if (privateSeed.length !== 64 || publicSeed.length !== 32)
        throw new Error("Invalid XMSS seed lengths");
      // A separate memory per call lets us erase native stack copies as well as heap keys.
      // The compiled module is reusable; no secret-bearing instance is reused.
      const instance = await WebAssembly.instantiate(module, {});
      const api = instance.exports as unknown as XmssExports; // exports validated above
      try {
        const pointer = api.malloc(288); // 64 private seed + 32 public seed + 64 pk + 128 sk
        if (
          !pointer ||
          pointer < 0 ||
          pointer + 288 > api.memory.buffer.byteLength
        )
          throw new Error("XMSS allocation failed");
        const memory = new Uint8Array(api.memory.buffer);
        memory.set(privateSeed, pointer);
        memory.set(publicSeed, pointer + 64);
        if (
          api.xmss_keygen(
            pointer,
            pointer + 64,
            pointer + 96,
            pointer + 160,
          ) !== 0
        )
          throw new Error("XMSS key generation failed");
        return new Uint8Array(api.memory.buffer).slice(
          pointer + 96,
          pointer + 160,
        );
      } finally {
        // Destroy this instance after use; clearing allocator/data segments is intentional.
        new Uint8Array(api.memory.buffer).fill(0);
      }
    },
  };
}
