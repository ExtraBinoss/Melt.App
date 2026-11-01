import { choose } from "../../support/select";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ArtboardPerformanceButton } from "../../../src/canvas/performance/ArtboardPerformanceButton";
import {
  getCompositionPerformance,
  type CompositionPerformanceSnapshot,
} from "../../../src/state/session/composition-performance";
import { i18n } from "../../../src/state/i18n";
import { setup } from "../../support/ui";
import { deferred, performanceSnapshot } from "./fixtures";

test("profiles only on open and shows real counters, unavailable GPU timing and an explicit frame target", async () => {
  const d = setup();
  const profiler = vi.fn(async () => performanceSnapshot(d.page.id));
  getCompositionPerformance(d.engine).registerProfiler(profiler);
  d.mount(<ArtboardPerformanceButton engine={d.engine} compositionId={d.page.id} />);
  const trigger = screen.getByRole("button", { name: "Performances" });
  fireEvent.pointerEnter(trigger);
  expect(profiler).not.toHaveBeenCalled();
  const documentBefore = d.engine.getSnapshot();
  fireEvent.click(trigger);
  const panel = screen.getByRole("dialog", { name: "Performances" });
  expect(panel).not.toHaveAttribute("aria-modal", "true");
  await waitFor(() => expect(profiler).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(within(panel).getByText("3,25 ms")).toBeVisible());
  expect(within(panel).queryByText("Indisponible")).toBeNull();
  expect(within(panel).getAllByRole("meter")).toHaveLength(1);
  expect(within(panel).getByText("16,7 ms")).toBeVisible();
  await choose("Fréquence cible", "120 i/s");
  expect(within(panel).getByText("8,33 ms")).toBeVisible();
  expect(profiler).toHaveBeenCalledTimes(1);
  fireEvent.click(within(panel).getByRole("button", { name: /GPU/ }));
  expect(within(panel).getByText("Commandes de dessin")).toBeVisible();
  expect(within(panel).getByText("19")).toBeVisible();
  expect(d.engine.getSnapshot()).toBe(documentBefore);
  fireEvent.keyDown(panel, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(document.body.style.overflow).toBe("");
});

test("closing cancels pending work and a late result does not update a reopened panel", async () => {
  const d = setup();
  const first = deferred<CompositionPerformanceSnapshot>();
  const signals: AbortSignal[] = [];
  const profiler = vi.fn((_id: string, signal: AbortSignal) => {
    signals.push(signal);
    return signals.length === 1 ? first.promise : Promise.resolve(performanceSnapshot(d.page.id));
  });
  getCompositionPerformance(d.engine).registerProfiler(profiler);
  d.mount(<ArtboardPerformanceButton engine={d.engine} compositionId={d.page.id} />);
  fireEvent.click(screen.getByRole("button", { name: "Performances" }));
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(signals[0]?.aborted).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: "Performances" }));
  await waitFor(() => expect(screen.getByText("3,25 ms")).toBeVisible());
  await act(async () => {
    first.resolve({
      ...performanceSnapshot(d.page.id),
      cpu: { value: 999, availability: "measured" },
    });
  });
  expect(screen.queryByText("999 ms")).not.toBeInTheDocument();
});

test("reports real provider failure and localizes its unavailable state", async () => {
  const d = setup();
  d.mount(<ArtboardPerformanceButton engine={d.engine} compositionId={d.page.id} />);
  fireEvent.click(screen.getByRole("button", { name: "Performances" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("n’est pas disponible");
  await act(async () => {
    await i18n.changeLanguage("en");
  });
  expect(screen.getByRole("alert")).toHaveTextContent("unavailable for this preview");
  expect(screen.queryByRole("meter")).not.toBeInTheDocument();
});

test("links additive budget contributions and copies a report while omitting zero/unknown domains", async () => {
  const d = setup(),
    data = performanceSnapshot(d.page.id),
    writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
  const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  data.environment = { browser: "Chrome 156", os: "Linux", backend: "webgl" };
  data.cpu = { value: 20, availability: "measured" };
  data.contributions = {
    cpu: [
      { id: "sourcePreparation", value: 18 },
      { id: "composition", value: 2 },
    ],
    gpu: [],
  };
  data.metrics = [
    ...data.metrics,
    {
      id: "audioTracks",
      domain: "audio",
      kind: "inventory",
      unit: "count",
      value: 0,
      availability: "measured",
    },
    {
      id: "spatialMeshes",
      domain: "spatial",
      kind: "inventory",
      unit: "count",
      value: null,
      availability: "unavailable",
    },
  ];
  getCompositionPerformance(d.engine).registerProfiler(async () => data);
  d.mount(<ArtboardPerformanceButton engine={d.engine} compositionId={d.page.id} />);
  try {
    const trigger = screen.getByRole("button", { name: "Performances" });
    expect(trigger.textContent).toBe("");
    fireEvent.click(trigger);
    const panel = screen.getByRole("dialog", { name: "Performances" });
    await waitFor(() => expect(within(panel).getByText(/Budget dépassé/)).toBeVisible());
    fireEvent.click(within(panel).getByRole("button", { name: "Système" }));
    expect(within(panel).getByText("Chrome 156")).toBeVisible();
    expect(within(panel).queryByRole("button", { name: /^Audio/ })).toBeNull();
    expect(within(panel).queryByRole("button", { name: /^3D/ })).toBeNull();
    const bar = panel.querySelector<HTMLElement>(
      '.storage-segment[data-section="sourcePreparation"]',
    )!;
    fireEvent.pointerEnter(bar);
    expect(panel.querySelector('.storage-row[data-section="composition"]')).toHaveAttribute(
      "data-dimmed",
      "true",
    );
    fireEvent.click(within(panel).getByRole("button", { name: "Copier le rapport" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(JSON.parse(writeText.mock.calls[0]![0] as string)).toMatchObject({
      compositionId: d.page.id,
      cpu: { value: 20 },
      targetFps: 60,
      environment: data.environment,
      contributions: data.contributions,
    });
  } finally {
    if (previous) Object.defineProperty(navigator, "clipboard", previous);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});
