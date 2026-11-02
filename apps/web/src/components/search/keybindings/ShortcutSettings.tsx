import { bindingMatches } from "../catalog/shortcut-search";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react";
import { Kbd, KbdGroup } from "../../ui/kbd";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import { BINDING_COMMANDS } from "../../../state/keybindings/registry";
import { keybindings } from "../../../state/keybindings/store";
import { useKeybindings } from "../../../state/keybindings/use-keybindings";
import { BindingList } from "./BindingList";
import { CANVAS_GESTURES, modifierLabel } from "../shortcuts";
import "../messages";
import "./messages";
import "./bindings.css";

const normalize = (value: string) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
/** The same editable keybinding controls are embedded in preferences and the standalone dialog. */
export function ShortcutSettings() {
  const { t } = useTranslation(),
    snapshot = useKeybindings();
  const [query, setQuery] = useState(""),
    [error, setError] = useState("");
  const commands = useMemo(() => {
    const needle = normalize(query.trim());
    return !needle
      ? BINDING_COMMANDS
      : BINDING_COMMANDS.filter((command) =>
          bindingMatches(command, snapshot.bindings.get(command.id) ?? [], query, t),
        );
  }, [query, snapshot, t]);
  return (
    <div className="shortcut-settings">
      <section className="binding-gestures" aria-label={t("search:navigation")}>
        <h3>{t("search:navigation")}</h3>
        <dl>
          {CANVAS_GESTURES.map(([label, keys], index) => (
            <div key={index}>
              <dt>{t(label)}</dt>
              <dd>
                <KbdGroup>
                  {keys.map((key) => (
                    <Kbd key={key}>{key === "Mod" ? modifierLabel() : t(key)}</Kbd>
                  ))}
                </KbdGroup>
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <div className="binding-toolbar">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={t("keybindings:search")}
          placeholder={t("keybindings:search")}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            try {
              keybindings.reset();
              setError("");
            } catch {
              setError(t("keybindings:storage"));
            }
          }}
        >
          <RotateCcw size={13} />
          {t("keybindings:resetAll")}
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      <BindingList
        commands={commands}
        snapshot={snapshot}
        label={t("search:shortcuts")}
        empty={t("keybindings:empty")}
      />
    </div>
  );
}
