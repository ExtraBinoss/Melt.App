import { expect, test } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { Faq } from "../../../src/components/site/Faq";

const items = [
  { question: "Where are my projects?", answer: "Your projects stay in this browser." },
  { question: "Can I export?", answer: "Export the finished image or motion." },
];

test("server HTML keeps complete answers and usable native exclusive disclosures", () => {
  const html = renderToString(<Faq title="Questions" items={items} id="help" />);
  const document = new DOMParser().parseFromString(html, "text/html");
  const disclosures = document.querySelectorAll("details");
  expect(disclosures).toHaveLength(2);
  for (const [index, item] of items.entries()) {
    const disclosure = disclosures[index]!;
    expect(disclosure.getAttribute("name")).toBe("help-answers");
    expect(disclosure.open).toBe(false);
    expect(disclosure.querySelector("summary")?.textContent).toBe(item.question);
    expect(disclosure.textContent).toContain(item.answer);
    expect(disclosure.querySelector("[disabled], [inert], [aria-hidden=true]:not(svg)")).toBeNull();
  }
});

test("the summary opens and closes its answer without a hydration gate or React state", () => {
  render(<Faq title="Questions" items={items} />);
  const question = screen.getByText(items[0]!.question).closest("summary")!;
  const disclosure = question.parentElement as HTMLDetailsElement;
  fireEvent.click(question);
  expect(disclosure.open).toBe(true);
  fireEvent.click(question);
  expect(disclosure.open).toBe(false);
});
