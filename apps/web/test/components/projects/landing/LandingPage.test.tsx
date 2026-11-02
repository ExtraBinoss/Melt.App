import { beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { LandingPage } from "../../../../src/components/projects/landing/LandingPage";
import { setup } from "../../../support/ui";
import { i18n } from "../../../../src/state/i18n";

// Native face playback has its own lifecycle and real-browser regressions.
vi.mock("../../../../src/components/projects/landing/hero/mascot-playback", () => ({
  installHeroMascot: () => () => {},
}));
vi.mock("../../../../src/components/projects/landing/hero/glyph-geometry", () => ({
  prepareHeroGlyphs: async () => undefined,
}));

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

test("shows the animated headline, real templates and six deliberate video slots", () => {
  const d = setup(),
    create = vi.fn(),
    choose = vi.fn();
  d.mount(<LandingPage onCreate={create} onTemplate={choose} />);
  expect(screen.getByRole("heading", { level: 1, name: "Créez et animez." })).toBeVisible();
  expect(
    screen.getByText(
      "Un outil simple pour créer des visuels fixes ou animés. Combinez images, vidéos et 3D avec des réglages en temps réel.",
    ),
  ).toBeVisible();
  expect(screen.queryByText("Aperçu vidéo à venir")).toBeNull();
  expect(document.querySelectorAll("[data-feature-ui]")).toHaveLength(3);
  expect(
    [...document.querySelectorAll("[data-video-slot]")].map((slot) =>
      slot.getAttribute("data-video-slot"),
    ),
  ).toEqual(["canvas", "effects", "motion", "agent", "timelapse", "export"]);
  expect(screen.getByRole("heading", { name: "Créez un timelapse." })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Exportez images et vidéos." })).toBeVisible();
  expect(document.querySelectorAll("video[data-landing-video]")).toHaveLength(9);
  expect(document.querySelector(".landing-eyebrow")).toBeNull();
  expect(create).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole("button", { name: "Commencer à créer" })[0]!);
  fireEvent.click(screen.getByRole("button", { name: "Try Melt" }));
  expect(create).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "Créer depuis Mascotte Melt" }));
  expect(choose).toHaveBeenCalledExactlyOnceWith("morphing-type");
});

test("all landing copy follows the selected interface language", async () => {
  const d = setup();
  d.mount(<LandingPage onCreate={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "Créez et animez." })).toBeVisible();
  await act(async () => {
    await i18n.changeLanguage("en");
  });
  expect(screen.getByRole("heading", { name: "Design and animate." })).toBeVisible();
  expect(
    screen.getByText(
      "Create still or animated visuals in one simple tool. Combine images, video and 3D with real-time controls.",
    ),
  ).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Start with a template or make it your own." }),
  ).toBeVisible();
});

test("pending template loading disables creation and offers the actual cancellation action", () => {
  const d = setup(),
    cancel = vi.fn();
  d.mount(<LandingPage onCreate={vi.fn()} onTemplate={vi.fn()} busy onCancel={cancel} />);
  const status = screen
    .getByText("Préparation de votre modèle…")
    .closest<HTMLElement>('[role="status"]');
  expect(status).toBeVisible();
  expect(status).toHaveTextContent("Préparation de votre modèle");
  for (const button of screen.getAllByRole("button"))
    if (
      button.textContent === "Commencer à créer" ||
      button.getAttribute("aria-label")?.startsWith("Créer depuis")
    )
      expect(button).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(within(status!).getByRole("button", { name: "Annuler" }));
  expect(cancel).toHaveBeenCalledOnce();
});
