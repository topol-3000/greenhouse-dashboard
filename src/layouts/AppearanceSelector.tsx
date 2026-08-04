/**
 * The shell's appearance selector.
 *
 * Three ordinary buttons rather than a menu: each one is reachable by Tab and
 * activated by Enter or Space, each carries the name of the appearance it
 * selects, and `aria-pressed` states which one is in effect — so the selection
 * is never carried by a highlight colour alone. The label is hidden visually at
 * narrow widths but stays in the accessibility tree, so the accessible name is
 * the same word at every viewport.
 */

import { cilContrast, cilMoon, cilSun } from "@coreui/icons";
import CIcon from "@coreui/icons-react";
import type { Appearance } from "./appearance";

interface AppearanceOption {
  readonly value: Appearance;
  readonly label: string;
  readonly icon: string[];
  readonly hint: string;
}

const OPTIONS: readonly AppearanceOption[] = [
  { value: "light", label: "Light", icon: cilSun, hint: "Always use the light theme." },
  { value: "dark", label: "Dark", icon: cilMoon, hint: "Always use the dark theme." },
  {
    value: "auto",
    label: "Auto",
    icon: cilContrast,
    hint: "Follow this device's colour scheme.",
  },
];

interface AppearanceSelectorProps {
  appearance: Appearance;
  onSelect: (next: Appearance) => void;
}

export function AppearanceSelector({ appearance, onSelect }: AppearanceSelectorProps) {
  return (
    <div className="appearance" role="group" aria-label="Appearance" data-testid="appearance">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className="appearance__option"
          aria-pressed={appearance === option.value}
          title={option.hint}
          onClick={() => {
            onSelect(option.value);
          }}
        >
          <CIcon icon={option.icon} className="appearance__icon" aria-hidden="true" />
          <span className="appearance__label">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
