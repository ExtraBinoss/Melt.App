import type { Fetcher as WorkersFetcher } from "@cloudflare/workers-types";

// Generated binding declarations refer to Fetcher; avoid injecting Worker globals into the DOM app.
declare global {
  type Fetcher = WorkersFetcher;
}
