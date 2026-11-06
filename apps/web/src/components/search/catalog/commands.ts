import { backgroundImage } from "../../../services/selection/background-action";
import { isPublishedComposition, type Composition, type SessionSnapshot } from "@musart/core";
import type { BindingSnapshot } from "../../../state/keybindings/model";
import { layerSelection } from "../../layers/menu/selection";
import { ACTIONS, type ActionDefinition } from "./definitions";
import { createSearchCommandItems } from "./items";
import type { SearchItem, SearchTranslate } from "./model";

const EMPTY_SELECTION: string[] = [];
Object.freeze(EMPTY_SELECTION);
const gates = new Map(ACTIONS.map((action) => [`action:${action.action}`, action.gate]));
type Gate = NonNullable<ActionDefinition["gate"]>;
interface PreparedCommands {
  base: SearchItem[];
  enabled: SearchItem[];
  states: Map<string, SearchItem[]>;
}
/** Labels and shortcuts change independently of selection; only availability changes on a click. */
export class SearchCommands {
  private translate: SearchTranslate | null = null;
  private bindings: BindingSnapshot | null = null;
  private locale = "";
  private base: SearchItem[] = [];
  private enabled: SearchItem[] = [];
  private selectionPage: Composition | null = null;
  private selection: readonly string[] | null = null;
  private selectionState: ReturnType<typeof layerSelection> | null = null;
  private states = new Map<string, SearchItem[]>();
  private readonly prepared = new WeakMap<
    SearchTranslate,
    WeakMap<BindingSnapshot, Map<string, PreparedCommands>>
  >();
  read(
    snapshot: SessionSnapshot,
    t: SearchTranslate,
    bindings: BindingSnapshot,
    locale: string,
  ): SearchItem[] {
    if (this.translate !== t || this.bindings !== bindings || this.locale !== locale) {
      let byBindings = this.prepared.get(t);
      if (!byBindings) this.prepared.set(t, (byBindings = new WeakMap()));
      let byLocale = byBindings.get(bindings);
      if (!byLocale) byBindings.set(bindings, (byLocale = new Map()));
      let cached = byLocale.get(locale);
      if (!cached) {
        const motionHint = t("motion:requiresMotion");
        const base = createSearchCommandItems(
          { ...snapshot, selection: EMPTY_SELECTION, canUndo: false, canRedo: false },
          t,
          bindings,
        ).map((item) =>
          gates.get(item.id) === "motion" ? { ...item, disabled: motionHint } : item,
        );
        const enabled = base.map((item) =>
          item.disabled === undefined ? item : { ...item, disabled: undefined },
        );
        cached = { base, enabled, states: new Map() };
        byLocale.set(locale, cached);
        if (byLocale.size > 2) byLocale.delete(byLocale.keys().next().value!);
      }
      this.base = cached.base;
      this.enabled = cached.enabled;
      this.states = cached.states;
      this.translate = t;
      this.bindings = bindings;
      this.locale = locale;
    }
    const page =
      snapshot.project.pages.find((page) => page.id === snapshot.pageId) ??
      snapshot.project.pages[0]!;
    // Metadata/history publications reuse artwork. Spatial ungroup also consumes motion tracks.
    if (
      !this.selectionState ||
      !isPublishedComposition(page) ||
      !Object.isFrozen(snapshot.selection) ||
      this.selectionPage?.layers !== page.layers ||
      this.selectionPage?.motion !== page.motion ||
      this.selection !== snapshot.selection
    ) {
      this.selectionState = layerSelection(page, snapshot.selection);
      this.selectionPage = page;
      this.selection = snapshot.selection;
    }
    const state = this.selectionState;
    const allowed: Record<Gate, boolean> = {
      image: Boolean(backgroundImage(snapshot)),
      motion: page.motion?.mode === "motion",
      selection: state.selected.length > 0,
      editable: state.editable,
      group: state.canGroup,
      ungroup: state.canUngroup,
      undo: snapshot.canUndo,
      redo: snapshot.canRedo,
    };
    const key = JSON.stringify(Object.values(allowed));
    let rows = this.states.get(key);
    if (!rows)
      rows = this.base.map((item, index) => {
        const gate = item.target.kind === "effect" ? "editable" : gates.get(item.id);
        return gate && allowed[gate] ? this.enabled[index]! : item;
      });
    this.states.delete(key);
    this.states.set(key, rows);
    if (this.states.size > 8) this.states.delete(this.states.keys().next().value!);
    return rows;
  }
}
