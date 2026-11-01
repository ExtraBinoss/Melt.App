import { expect, test, vi } from "vitest";
import { StudioSessionOwner } from "../../src/bootstrap/studio-session-owner";
const mocks = vi.hoisted(() => ({ data: vi.fn() }));
vi.mock("../../src/services/session/library-data", () => ({ createLibraryData: mocks.data }));

test("StrictMode reconnect acquires a fresh lease and suppresses errors from its closed predecessor", async () => {
  const disposals: ReturnType<typeof vi.fn>[] = [];
  mocks.data.mockImplementation(() => {
    const dispose = vi.fn(async () => {});
    disposals.push(dispose);
    return { store: { listPage: async () => ({ projects: [], before: null }) }, dispose };
  });
  const report = vi.fn();
  const owner = new StudioSessionOwner({ view: "dashboard", navigate: vi.fn() });
  owner.reporter(report);
  owner.connect();
  await owner.services.listProjectPage({ limit: 5 });
  const previousError = mocks.data.mock.calls[0]![0] as (error: unknown) => void;
  owner.close();
  owner.connect();
  previousError(Error("Stale read failed"));
  expect(report).not.toHaveBeenCalled();
  await owner.services.listProjectPage({ limit: 5 });
  expect(mocks.data).toHaveBeenCalledTimes(2);
  const currentError = mocks.data.mock.calls[1]![0] as (error: unknown) => void;
  const failure = Error("Current read failed");
  currentError(failure);
  expect(report).toHaveBeenCalledExactlyOnceWith(failure);
  owner.close();
  await vi.waitFor(() => disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce()));
});
