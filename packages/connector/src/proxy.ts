export async function proxyPearlRequest(
  request: Request,
  allowBroadcast = false,
): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.slice("/api/pearl".length).split("/");
  const network = parts[1];
  const hasNetwork = network === "testnet2" || network === "mainnet";
  const path = (hasNetwork ? `/${parts.slice(2).join("/")}` : parts.join("/")).replace(/\/$/, "");
  const origin =
    network === "mainnet"
      ? "https://blockbook.pearlresearch.ai"
      : "https://blockbook.testnet.pearlresearch.ai";
  const read =
    /^\/(?:block-index\/[0-9]+|block\/[0-9a-f]{64}|tx\/[0-9a-f]{64}|tx-specific\/[0-9a-f]{64}|utxo\/(?:tprl|prl)1p[0-9a-z]+|address\/(?:tprl|prl)1p[0-9a-z]+)$/.test(
      path,
    ) || path === "";
  const broadcast =
    allowBroadcast &&
    request.method === "POST" &&
    path === "/sendtx" &&
    request.headers.get("origin") === url.origin;
  if (!(request.method === "GET" && read) && !broadcast)
    return new Response("Unsupported request", { status: 403 });
  if (url.search) {
    if (!path.startsWith("/address/")) return new Response("Unsupported query", { status: 400 });
    for (const [key, value] of url.searchParams) {
      if (
        !(
          (key === "details" && value === "txids") ||
          (["page", "pageSize"].includes(key) &&
            /^[1-9][0-9]{0,3}$/.test(value) &&
            Number(value) <= 1000)
        )
      )
        return new Response("Unsupported query", { status: 400 });
    }
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > 100_000) return new Response("Payload too large", { status: 413 });
  const body = broadcast ? await request.text() : undefined;
  if (body !== undefined && (body.length > 100_000 || !/^(?:[0-9a-f]{2})+$/.test(body)))
    return new Response("Invalid signed transaction", { status: 400 });
  try {
    const upstream = await fetch(`${origin}/api/v2${path}${broadcast ? "/" : ""}${url.search}`, {
      method: request.method,
      ...(body === undefined ? {} : { body }),
      headers: { "Content-Type": "text/plain", Accept: "application/json" },
      signal: AbortSignal.timeout(25_000),
      redirect: "error",
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Public Pearl provider unavailable" }, { status: 502 });
  }
}
