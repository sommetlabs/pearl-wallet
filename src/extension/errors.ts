export type WalletErrorCode =
  | "LOCKED"
  | "NOT_CONNECTED"
  | "UNAVAILABLE"
  | "REQUEST_CLOSED"
  | "REQUEST_EXPIRED"
  | "REQUEST_REJECTED";

export class WalletError extends Error {
  constructor(
    readonly code: WalletErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WalletError";
  }
}
