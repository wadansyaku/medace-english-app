declare namespace NodeJS {
  interface ProcessEnv {
    CI?: string;
    PLAYWRIGHT_BASE_URL?: string;
    PLAYWRIGHT_SMOKE_PORT?: string;
    PLAYWRIGHT_OUTPUT_DIR?: string;
    PLAYWRIGHT_TRACE_MODE?: 'off' | 'on' | 'retain-on-failure' | 'on-first-retry';
    PLAYWRIGHT_VIDEO_MODE?: 'off' | 'on' | 'retain-on-failure' | 'on-first-retry';
    PLAYWRIGHT_SKIP_WEBSERVER?: '0' | '1';
    PLAYWRIGHT_EXPECT_PREVIEW?: '0' | '1';
    VITE_STORAGE_MODE?: 'cloudflare' | 'idb';
  }
}

declare const Buffer: {
  from(value: string, encoding?: string): Buffer;
  from(value: ArrayBuffer | SharedArrayBuffer | Uint8Array | readonly number[]): Buffer;
};
