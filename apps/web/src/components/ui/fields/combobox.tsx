import type { InputHTMLAttributes } from "react";

import { Input } from "./input";

type ComboboxOption = {
  value: string;
  label?: string;
};

type ComboboxProps = InputHTMLAttributes<HTMLInputElement> & {
  options: ComboboxOption[];
  listId: string;
  uiSize?: "md" | "lg";
  invalid?: boolean;
};

export function Combobox({ options, listId, uiSize = "md", invalid = false, ...props }: ComboboxProps) {
  return (
    <>
      <Input list={listId} uiSize={uiSize} invalid={invalid} {...props} />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label ?? option.value}
          </option>
        ))}
      </datalist>
    </>
  );
}
