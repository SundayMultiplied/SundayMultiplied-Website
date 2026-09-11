type D1Value = null | number | string | ArrayBuffer;

interface D1Result<T = Record<string, D1Value>> {
  results: T[];
}

interface D1PreparedStatement {
  bind(...values: D1Value[]): D1PreparedStatement;
  first<T = Record<string, D1Value>>(): Promise<T | null>;
  all<T = Record<string, D1Value>>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
}

interface R2ObjectMetadata {
  key?: string;
  httpEtag: string;
  size: number;
  range?: { offset?: number; length?: number; suffix?: number };
  writeHttpMetadata(headers: Headers): void;
}

interface R2ObjectBody extends R2ObjectMetadata {
  body: ReadableStream;
  json<T = unknown>(): Promise<T>;
}

interface R2ListedObject {
  key: string;
}

interface R2Objects {
  objects: R2ListedObject[];
  truncated: boolean;
  cursor?: string;
}

interface R2Bucket {
  head(key: string): Promise<R2ObjectMetadata | null>;
  get(key: string, options?: { range?: Headers }): Promise<R2ObjectBody | null>;
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<R2Objects>;
}

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

declare module "cloudflare:workers" {
  export const env: Cloudflare.Env;
}

declare namespace Cloudflare {
  interface Env {
    ASSETS: Fetcher;
    DB: D1Database;
    BUCKET: R2Bucket;
    BREVO_API_KEY?: string;
    APPROVAL_ADMIN_EMAIL?: string;
    APPROVAL_NOTIFICATION_EMAIL?: string;
    PUBLIC_SITE_ORIGIN?: string;
  }
}
