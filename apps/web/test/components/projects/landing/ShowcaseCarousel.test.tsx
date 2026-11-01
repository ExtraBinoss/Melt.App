import { LANDING_TEMPLATES } from "../../../../src/components/projects/landing/catalog";
import { beforeEach, expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { ShowcaseCarousel } from "../../../../src/components/projects/landing/ShowcaseCarousel";
import { setup } from "../../../support/ui";
import { installCarouselPan } from "../../../../src/components/projects/landing/carousel/controller";
const pan = vi.hoisted(() => ({ dispose: vi.fn(), position: () => 17 }));
beforeEach(() => vi.clearAllMocks());
vi.mock("../../../../src/components/projects/landing/carousel/controller", () => ({
  installCarouselPan: vi.fn(() => pan),
}));

test("opens real templates with one accessible card per template and no arrow controls", () => {
  const d = setup(),
    choose = vi.fn();
  d.mount(<ShowcaseCarousel onChoose={choose} />);
  fireEvent.click(screen.getByRole("button", { name: "Créer depuis Bloom Windows" }));
  expect(choose).toHaveBeenCalledExactlyOnceWith("bloom-windows");
  expect(screen.getAllByRole("button")).toHaveLength(7);
  expect(screen.queryByRole("button", { name: /Modèles (précédents|suivants)/ })).toBeNull();
  expect(screen.getByRole("group")).toHaveAttribute(
    "aria-description",
    "Faites glisser pour explorer les modèles.",
  );
});

test("keeps one imperative pan owner through unrelated renders and releases it on unmount", () => {
  const d = setup();
  const view = d.mount(<ShowcaseCarousel onChoose={vi.fn()} />);
  expect(installCarouselPan).toHaveBeenCalledOnce();
  expect(installCarouselPan).toHaveBeenCalledWith(screen.getByRole("group"), {
    reducedMotion: false,
    position: 0,
  });
  view.rerender(<ShowcaseCarousel onChoose={vi.fn()} busy />);
  expect(installCarouselPan).toHaveBeenCalledOnce();
  view.unmount();
  expect(pan.dispose).toHaveBeenCalledOnce();
});

test("uses posters on the landing without mounting interactive Three.js previews", () => {
  const d = setup();
  const view = d.mount(<ShowcaseCarousel onChoose={vi.fn()} />);
  expect(document.querySelectorAll("[data-motion-preview]")).toHaveLength(0);
  const posters = document.querySelectorAll(".landing-template-stage > img");
  expect(posters).toHaveLength(7);
  expect([...posters].map((image) => image.getAttribute("src"))).toEqual(
    LANDING_TEMPLATES.map((template) => template.preview),
  );
  const videos = [...document.querySelectorAll(".landing-template-stage > video")];
  expect(videos).toHaveLength(7);
  expect(videos.every((video) => !video.hasAttribute("src"))).toBe(true);
  expect(videos.every((video) => video.getAttribute("preload") === "none")).toBe(true);
  const card = screen.getByRole("button", { name: "Créer depuis Bloom Windows" });
  expect(card).toHaveAttribute("href", "/dashboard?preview=template&item=bloom-windows");
  view.rerender(<ShowcaseCarousel onChoose={vi.fn()} busy />);
  for (const button of screen.getAllByRole("button", { hidden: true }))
    expect(button).toHaveAttribute("aria-disabled", "true");
  expect([...document.querySelectorAll(".landing-template-stage > video")]).toEqual(videos);
  expect(document.querySelectorAll("[data-motion-preview]")).toHaveLength(0);
});
