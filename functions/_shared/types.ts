export interface D1ResultMeta {
  changed_db?: boolean;
  changes?: number;
  duration?: number;
  last_row_id?: number | null;
  rows_read?: number;
  rows_written?: number;
  served_by?: string;
  size_after?: number;
}

export interface D1Result<TRow = Record<string, unknown>> {
  meta: D1ResultMeta;
  results?: TRow[];
  success?: boolean;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<TRow = Record<string, unknown>>(column?: string): Promise<TRow | null>;
  all<TRow = Record<string, unknown>>(): Promise<D1Result<TRow>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<TStatement extends D1PreparedStatement>(statements: TStatement[]): Promise<D1Result[]>;
}

export interface R2HttpMetadata {
  contentType?: string;
}

export interface R2ObjectBody {
  arrayBuffer(): Promise<ArrayBuffer>;
  body: ReadableStream | null;
  etag?: string;
  httpEtag?: string;
}

export interface R2PutOptions {
  httpMetadata?: R2HttpMetadata;
}

export interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | Blob | ReadableStream | string,
    options?: R2PutOptions,
  ): Promise<R2ObjectBody | null>;
}

export interface AppEnv {
  DB: D1Database;
  WRITING_ASSETS?: R2Bucket;
  WRITING_AI_MODE?: string;
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_OCR_MODEL?: string;
  OPENAI_EVAL_MODEL?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_OCR_MODEL?: string;
  CLOUDFLARE_EVAL_MODEL?: string;
  DEPLOYMENT_SHA?: string;
  INTERNAL_JOB_SECRET?: string;
  ADMIN_DEMO_PASSWORD?: string;
  ENABLE_ADMIN_DEMO?: string;
  ENABLE_PUBLIC_BUSINESS_DEMO?: string;
  ENABLE_DESTRUCTIVE_ADMIN_ACTIONS?: string;
  APP_ONLINE_ONLY?: string;
}

export interface DbUserRow {
  id: string;
  email: string;
  password_hash: string | null;
  display_name: string;
  role: string;
  grade: string | null;
  english_level: string | null;
  subscription_plan: string | null;
  organization_id: string | null;
  organization_name: string | null;
  organization_role: string | null;
  study_mode: string | null;
  stats_xp: number | null;
  stats_level: number | null;
  stats_current_streak: number | null;
  stats_last_login_date: string | null;
  created_at: number;
  updated_at: number;
}
