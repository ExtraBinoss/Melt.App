import { MOTION_TEMPLATE_ASSET_REVISIONS } from "../../../../src/services/projects/templates/motion/asset-revisions";
import { TEMPLATE_CATALOG } from "../../../../src/services/projects/templates/catalog";
import { LIBRARY_MODE_KEY } from "../../../../src/components/projects/dashboard/library-mode";
import { beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { i18n } from "../../../../src/state/i18n";
import { TemplateGallery } from "../../../../src/components/projects/templates/TemplateGallery";
import { setup } from "../../../support/ui";
vi.mock(
  "../../../../src/components/projects/templates/motion-preview/MotionTemplatePreview",
  () => ({
    MotionTemplatePreview: ({
      templateId,
      poster,
      disabled,
    }: {
      templateId: string;
      poster: string;
      disabled?: boolean;
    }) => (
      <span data-motion-preview={templateId} data-preview-disabled={Boolean(disabled)}>
        <img src={poster} alt="" />
      </span>
    ),
  }),
);
test("exposes the current artwork card and searchable canonical branded formats", () => {
  const onChoose = vi.fn();
  const data = setup();
  data.mount(<TemplateGallery onChoose={onChoose} />);
  fireEvent.click(screen.getByRole("button", { name: "Créer depuis Cornell Box" }));
  expect(onChoose).toHaveBeenLastCalledWith("cornell-box");
  expect(
    document.querySelector('img[src="/templates/motion/cornell-box/cornell-box.webp?v=4"]'),
  ).not.toBeNull();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "TikTok" } });
  expect(document.querySelectorAll(".library-card")).toHaveLength(1);
  const tiktok = screen.getByRole("button", { name: /TikTok/ });
  expect(tiktok.querySelector("svg")).not.toBeNull();
  expect(tiktok.closest("article")).toHaveTextContent("1080 × 1920 px");
  fireEvent.click(tiktok);
  expect(onChoose).toHaveBeenLastCalledWith("preset:tiktok-video");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "not a known template" } });
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByText("Aucun modèle correspondant.")).toBeVisible();
});
test("disables every creation action during a pending transaction", () => {
  setup().mount(<TemplateGallery onChoose={vi.fn()} busy />);
  for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
  for (const choice of screen.getAllByRole("radio")) expect(choice).toBeDisabled();
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.getByRole("searchbox")).toBeDisabled();
});
test("shows honest preparation state and keeps explicit download cancellation usable", () => {
  const cancel = vi.fn();
  setup().mount(<TemplateGallery onChoose={vi.fn()} busy onCancel={cancel} />);
  expect(screen.getByRole("status")).toHaveTextContent("Préparation du modèle");
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(cancel).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: /Cornell Box/ })).toBeDisabled();
});
test("filters real Motion projects independently from blank formats and preserves an editable Static gallery", async () => {
  const onChoose = vi.fn();
  setup().mount(<TemplateGallery onChoose={onChoose} />);
  expect(screen.getByRole("radio", { name: "Tous" })).toHaveAttribute("aria-checked", "true");
  expect(screen.queryByText("Tous les modèles")).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "Motion" }));
  const cards = [...document.querySelectorAll(".library-card")];
  expect(cards).toHaveLength(
    TEMPLATE_CATALOG.filter((template) => template.mode === "motion").length,
  );
  for (const name of [/Cornell Box/, /Bloom Windows/, /Mascotte Melt/, /Terminal Signal/])
    await waitFor(() => expect(screen.getByRole("button", { name })).toBeVisible());
  expect(
    screen.getByRole("button", { name: /Bloom Windows/ }).closest("article"),
  ).toHaveTextContent("1920 × 1080 px");
  expect(cards.every((card) => Boolean(card.querySelector('[data-mode="motion"] svg')))).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /Bloom Windows/ }));
  expect(onChoose).toHaveBeenLastCalledWith("bloom-windows");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Terminal" } });
  expect(document.querySelectorAll(".library-card")).toHaveLength(1);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("radio", { name: "Statique" }));
  expect(screen.queryByRole("button", { name: /Bloom Windows/ })).toBeNull();
  expect(
    screen.queryByRole("button", {
      name: /Colorfield|AFTERHOURS|Orbit Study|Paper Motion|Laboratoire|Sound Playground|In Bloom/,
    }),
  ).toBeNull();
  expect(
    screen
      .getByRole("button", { name: /TikTok/ })
      .closest("article")!
      .querySelector('[data-mode="static"]'),
  ).not.toBeNull();
});

test("wires live previews only for authored Motion cards and disables their intent during opening", () => {
  const d = setup(),
    choose = vi.fn();
  const view = d.mount(<TemplateGallery onChoose={choose} />);
  const motionTemplates = TEMPLATE_CATALOG.filter(
    (template) => template.mode === "motion" && template.preview,
  );
  expect(document.querySelectorAll(".template-grid [data-motion-preview]")).toHaveLength(
    motionTemplates.length,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Motion" }));
  const previews = document.querySelectorAll<HTMLElement>(".template-grid [data-motion-preview]");
  expect([...previews].map((preview) => preview.dataset.motionPreview)).toEqual(
    motionTemplates.map((template) => template.id),
  );
  expect(document.querySelector('[data-motion-preview="bloom-windows"] img')).toHaveAttribute(
    "src",
    `/templates/motion/bloom-windows/bloom-windows.webp?v=${MOTION_TEMPLATE_ASSET_REVISIONS["bloom-windows"]}`,
  );
  fireEvent.click(screen.getByRole("button", { name: /Créer depuis Bloom Windows/ }));
  expect(choose).toHaveBeenCalledExactlyOnceWith("bloom-windows");
  view.rerender(<TemplateGallery onChoose={choose} busy />);
  for (const preview of document.querySelectorAll(".template-grid [data-motion-preview]"))
    expect(preview).toHaveAttribute("data-preview-disabled", "true");
});

test("controlled query and mode filter list-only presentation without a duplicate toolbar", () => {
  const d = setup();
  const view = d.mount(
    <TemplateGallery onChoose={vi.fn()} query="Bloom" mode="motion" hideToolbar />,
  );
  expect(screen.queryByRole("searchbox")).toBeNull();
  expect(screen.queryByRole("radiogroup")).toBeNull();
  expect(document.querySelectorAll(".library-card")).toHaveLength(1);
  expect(screen.getByRole("button", { name: /Bloom Windows/ })).toBeInTheDocument();
  view.rerender(<TemplateGallery onChoose={vi.fn()} query="TikTok" mode="static" hideToolbar />);
  expect(document.querySelectorAll(".library-card")).toHaveLength(1);
  expect(screen.getByRole("button", { name: /TikTok/ })).toBeInTheDocument();
});

beforeEach(() => localStorage.removeItem(LIBRARY_MODE_KEY));

test("cards show localized descriptions and search the automatically detected effects", async () => {
  setup().mount(<TemplateGallery onChoose={vi.fn()} />);
  const cards = [...document.querySelectorAll(".library-card")];
  expect(cards).toHaveLength(TEMPLATE_CATALOG.length);
  for (const card of cards) {
    expect(card.querySelector(".library-card-description")).toHaveTextContent(/\S/);
    expect(card.querySelector(".library-content-tags")).not.toBeNull();
  }
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Flou" } });
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getByRole("article")).toHaveTextContent("Too Hot to Haunt");
  await act(async () => {
    await i18n.changeLanguage("en");
  });
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "blur" } });
  expect(screen.getByRole("article")).toHaveTextContent("soft shadows and a blur entrance");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "TikTok" } });
  expect(screen.getByRole("article")).toHaveTextContent("An empty 1080 × 1920 canvas");
  expect(
    screen.getByRole("article").querySelector('[data-content-tag="feature:blank"]'),
  ).toHaveTextContent("Blank canvas");
});
