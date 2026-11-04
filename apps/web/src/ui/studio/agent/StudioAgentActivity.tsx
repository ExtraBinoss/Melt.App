import { useEffect, useState, useSyncExternalStore } from "react";
import type { EnginePort } from "@musart/core";
import { Bot, Circle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { getAgentBridge } from "../../../services/automation/bridge/store";
import "./messages";

export function StudioAgentActivity({ engine }: { engine: EnginePort }) {
  const { t } = useTranslation("studioAgent");
  const bridge = getAgentBridge(engine);
  const state = useSyncExternalStore(bridge.subscribe, bridge.read, bridge.read);
  const [endpoint, setEndpoint] = useState("ws://127.0.0.1:6101/");
  const [token, setToken] = useState("");
  useEffect(() => () => bridge.disconnect(), [bridge]);
  const connected = state.status === "connected" || state.status === "connecting";
  return (
    <Popover modal={false}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("title")}
          data-testid="studio-agent-trigger"
        >
          <Bot aria-hidden="true" />
          <span>{t("agent")}</span>
          <Circle
            aria-hidden="true"
            className={
              state.status === "connected"
                ? "size-2 fill-current text-primary"
                : "size-2 text-muted-foreground"
            }
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 max-w-[calc(100vw-2rem)] p-3"
        initialFocus="content"
      >
        <div className="flex items-center justify-between gap-2 text-sm">
          <strong>{t("title")}</strong>
          <span role="status" className="text-xs text-muted-foreground">
            {t(state.status)}
          </span>
        </div>
        <p className="my-2 text-xs text-muted-foreground">{t("description")}</p>
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            bridge.connect(endpoint.trim(), token.trim());
            setToken("");
          }}
        >
          <label className="grid gap-1 text-xs">
            {t("endpoint")}
            <Input
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              disabled={connected}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          {!connected && (
            <label className="grid gap-1 text-xs">
              {t("token")}
              <Input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                autoComplete="off"
              />
            </label>
          )}
          {connected ? (
            <Button type="button" size="sm" variant="outline" onClick={() => bridge.disconnect()}>
              {t("disconnect")}
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={!token.trim()}>
              {t("connect")}
            </Button>
          )}
        </form>
        {state.error && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {state.error}
          </p>
        )}
        {state.status === "connected" && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t(state.peerConnected ? "peerReady" : "waiting")}
          </p>
        )}
        <div className="mt-3 border-t pt-2">
          <p className="mb-1 text-xs font-medium">{t("activity")}</p>
          {state.logs.length === 0 && <p className="text-xs text-muted-foreground">{t("empty")}</p>}
          <ol className="max-h-52 space-y-2 overflow-y-auto text-xs" aria-label={t("activity")}>
            {state.logs
              .slice()
              .reverse()
              .map((entry) => (
                <li key={entry.id} className="break-words">
                  <span className={entry.ok ? "text-foreground" : "text-destructive"}>
                    {t(entry.source)} · {entry.operation}
                  </span>
                  <span className="ml-1 text-muted-foreground">r{entry.revision}</span>
                  {entry.targets.length > 0 && (
                    <p className="text-muted-foreground">{entry.targets.join(", ")}</p>
                  )}
                  {entry.error && <p className="text-destructive">{entry.error}</p>}
                </li>
              ))}
          </ol>
        </div>
      </PopoverContent>
    </Popover>
  );
}
