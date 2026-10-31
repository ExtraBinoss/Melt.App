import { useId, type ComponentProps } from "react";
import { Label } from "../../ui/label";
import { SelectField } from "../../shared/SelectField";

export function VectorSelect(props: ComponentProps<typeof SelectField>) {
  const id = useId();
  return (
    <div className="vector-option-field">
      <Label htmlFor={id}>{props.label}</Label>
      <SelectField {...props} id={id} />
    </div>
  );
}
