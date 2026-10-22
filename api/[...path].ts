import { proxyPearlRequest } from "@sommetlabs/pearl-wallet-connect/proxy";

export default {
  fetch(request: Request): Promise<Response> | Response {
    const path = new URL(request.url).pathname;
    if (path !== "/api/pearl" && !path.startsWith("/api/pearl/")) {
      return new Response("Not found", { status: 404 });
    }
    return proxyPearlRequest(request, true);
  },
};
