import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(
  readFileSync(join(root, "native/xmss/provenance.json"), "utf8"),
);
const source = process.env.PEARL_SOURCE;
const sdk = process.env.WASI_SDK_PATH;
if (!source || !sdk)
  throw new Error(
    "Set PEARL_SOURCE to the pinned official checkout and WASI_SDK_PATH to WASI SDK 34",
  );
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const [file, digest] of Object.entries(manifest.sources))
  if (sha(readFileSync(resolve(source, file))) !== digest)
    throw new Error(`Official source mismatch: ${file}`);

const work = mkdtempSync(join(tmpdir(), "abyss-xmss-"));
try {
  const objects = [];
  for (const file of Object.keys(manifest.sources).filter((path) =>
    /\.(c|cpp)$/.test(path),
  )) {
    const target = join(work, `${objects.length}.o`);
    const cpp = file.endsWith(".cpp");
    execFileSync(
      join(sdk, "bin", cpp ? "clang++" : "clang"),
      [
        ...(cpp ? ["-std=c++20"] : []),
        "-O2",
        "-c",
        resolve(source, file),
        "-o",
        target,
      ],
      { stdio: "inherit" },
    );
    objects.push(target);
  }
  const output = join(work, "xmss.wasm");
  execFileSync(
    join(sdk, "bin/clang++"),
    [
      "-O2",
      "-nostartfiles",
      ...objects,
      "-Wl,--no-entry",
      "-Wl,--export=xmss_keygen",
      "-Wl,--export=malloc",
      "-Wl,--export-memory",
      "-Wl,--strip-all",
      "-Wl,-z,stack-size=1048576",
      "-o",
      output,
    ],
    { stdio: "inherit" },
  );
  const bytes = readFileSync(output);
  const module = new WebAssembly.Module(bytes);
  if (WebAssembly.Module.imports(module).length)
    throw new Error("XMSS unexpectedly imports host capabilities");
  const names = WebAssembly.Module.exports(module)
    .map(({ name }) => name)
    .sort();
  if (JSON.stringify(names) !== JSON.stringify([...manifest.exports].sort()))
    throw new Error("XMSS export mismatch");
  if (sha(bytes) !== manifest.wasmSha256)
    throw new Error(
      "XMSS build differs from recorded artifact; review source/compiler before updating provenance",
    );
  writeFileSync(join(root, "src/core/wasm/xmss.wasm"), bytes);
  console.log(`Verified official XMSS: ${bytes.length} bytes; no host imports`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
