import { useTranslation } from "react-i18next";
export function ObjectSelectionGuide() {
  const { t } = useTranslation("pixelSelection");
  const steps = [
    ["objectMarkTitle", "objectGestureHelp"],
    ["objectRefineTitle", "objectRefineHelp"],
    ["objectFinishTitle", "objectApplyHelp"],
  ] as const;
  return (
    <ol className="object-selection-guide" role="list">
      {steps.map(([title, help], index) => (
        <li key={title}>
          <span className="object-selection-step" aria-hidden="true">
            {index + 1}
          </span>
          <div>
            <strong>{t(title)}</strong>
            <p>{t(help)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
