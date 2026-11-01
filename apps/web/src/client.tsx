import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";

// A legacy-language migration must not hydrate or construct an editor in the document being replaced.
if (document.documentElement.dataset.localeRedirect !== "true") {
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>,
    );
  });
}
