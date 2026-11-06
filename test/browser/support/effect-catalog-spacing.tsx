import { createRoot } from "react-dom/client";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "../../../apps/web/src/components/ui/dropdown-menu";
import { EffectCatalog } from "../../../apps/web/src/components/layers/catalog/EffectCatalog";
import { i18n } from "../../../apps/web/src/state/i18n";
import "../../../apps/web/src/styles/global.css";
export async function mountCatalogSpacing() {
  await i18n.changeLanguage("en");
  const root = document.createElement("div");
  document.body.append(root);
  createRoot(root).render(
    <DropdownMenu>
      <DropdownMenuTrigger>Classic effects</DropdownMenuTrigger>
      <DropdownMenuContent className="effect-catalog-menu">
        <EffectCatalog
          category="effect"
          onAdd={(type) => {
            document.querySelector("output")!.textContent = type;
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
}
