import { useTranslation } from "react-i18next";
import { spatialMaterial, spatialEnvironment } from "@musart/core";
import "../../../components/spatial/messages";
import "./messages";

export function useCatalogNames() {
  const { t } = useTranslation("studioCatalog");
  const { t: spatialText } = useTranslation("spatial");
  return {
    materialName(this: void, id: string) {
      const material = spatialMaterial(id);
      const base = spatialText(`materialNames.${material.baseId}`);
      return material.variant
        ? t("variantName", { base, variant: t(`variants.${material.variant}`) })
        : base;
    },
    environmentName(this: void, id: string) {
      const environment = spatialEnvironment(id);
      const base = spatialText(`environments.${environment.baseId}`);
      return environment.variant
        ? t("variantName", { base, variant: t(`variants.${environment.variant}`) })
        : base;
    },
    categoryName(this: void, kind: "material" | "environment", id: string) {
      return t(`${kind}Categories.${id}`);
    },
  };
}
