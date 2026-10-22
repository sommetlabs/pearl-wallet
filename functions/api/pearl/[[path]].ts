import { proxyPearlRequest } from "@sommetlabs/pearl-wallet-connect/proxy";
export function onRequest({ request }: { request: Request }): Promise<Response> {
  return proxyPearlRequest(request, true);
}
