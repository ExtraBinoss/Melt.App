import type { ComponentProps } from "react";
import type * as Radix from "radix-ui";
import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../src/components/ui/tooltip";
const observed = vi.hoisted(() => ({ portal: vi.fn() }));
vi.mock("radix-ui", async (original) => {
  const actual = await original<typeof Radix>();
  const Portal = actual.Tooltip.Portal;
  return {
    ...actual,
    Tooltip: {
      ...actual.Tooltip,
      Portal: (props: ComponentProps<typeof Portal>) => {
        observed.portal();
        return <Portal {...props} />;
      },
    },
  };
});

test("unvisited help skips portal controllers; first activation and retained exit still use real Radix", async () => {
  function Help({ open = false, text = "Details" }: { open?: boolean; text?: string }) {
    return (
      <TooltipProvider>
        <Tooltip open={open}>
          <TooltipTrigger>Help</TooltipTrigger>
          <TooltipContent>{text}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  const view = render(<Help />);
  view.rerender(<Help text="Updated details" />);
  expect(observed.portal).not.toHaveBeenCalled();
  view.rerender(<Help open text="Updated details" />);
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Updated details");
  observed.portal.mockClear();
  view.rerender(<Help />);
  expect(observed.portal).toHaveBeenCalled();
  view.rerender(<Help open text="Reopened" />);
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Reopened");
});

test("explicitly forced tooltip content bypasses the unvisited gate", async () => {
  render(
    <TooltipProvider>
      <Tooltip open={false}>
        <TooltipTrigger>Help</TooltipTrigger>
        <TooltipContent forceMount>Forced help</TooltipContent>
      </Tooltip>
    </TooltipProvider>,
  );
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Forced help");
});
