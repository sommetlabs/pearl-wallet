import { proxyPearlRequest } from "../packages/connector/src/proxy.js";

export default {
  fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // Vercel sends nested provider paths to this one function.
    const path = url.searchParams.get("providerPath");
    url.searchParams.delete("providerPath");
    if (path !== null) url.pathname = `/api/pearl/${path}`;
    return proxyPearlRequest(new Request(url, request), true);
  },
};
