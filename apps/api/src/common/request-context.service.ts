import { Injectable } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";

type RequestContextState = {
  requestId: string;
};

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function normalizeRequestId(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return REQUEST_ID_PATTERN.test(trimmed) ? trimmed : null;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextState>();

  run<T>(requestId: string, callback: () => T): T {
    return this.storage.run({ requestId }, callback);
  }

  getRequestId(): string | null {
    return this.storage.getStore()?.requestId ?? null;
  }
}
