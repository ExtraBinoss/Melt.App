import { registerFeatureTranslations } from "../../../../state/i18n/feature-resources";
registerFeatureTranslations("effectDomain", {
  en: {
    title: "Position & area",
    position: "Position",
    positionHelp: "Drag to position. Arrow keys move; Shift moves farther.",
    domainEnabled: "Local area",
    domainX: "Position X",
    domainY: "Position Y",
    domainAngle: "Area direction",
    domainRadius: "Radius",
    domainAspect: "Aspect",
    domainFeather: "Feather",
  },
  fr: {
    title: "Position et zone",
    position: "Position",
    positionHelp: "Glisser pour positionner. Les flèches déplacent ; Maj amplifie le déplacement.",
    domainEnabled: "Zone locale",
    domainX: "Position X",
    domainY: "Position Y",
    domainAngle: "Direction de la zone",
    domainRadius: "Rayon",
    domainAspect: "Proportions",
    domainFeather: "Contour progressif",
  },
});
