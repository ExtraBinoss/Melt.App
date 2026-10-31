import { useState } from "react";
import { useHydrated } from "@tanstack/react-router";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "../ui/accordion";
export interface FaqItem {
  question: string;
  answer: string;
}
/** Keep the full answer text in server HTML; only disclosure presentation is interactive. */
export function Faq({
  items,
  title,
  id = "faq",
}: {
  items: readonly FaqItem[];
  title: string;
  id?: string;
}) {
  const [open, setOpen] = useState("");
  const hydrated = useHydrated();
  return (
    <section className="site-faq" id={id} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      <Accordion
        type="single"
        collapsible
        disabled={!hydrated}
        value={open}
        onValueChange={setOpen}
      >
        {items.map((item, index) => (
          <AccordionItem key={item.question} value={String(index)}>
            <AccordionTrigger>{item.question}</AccordionTrigger>
            <AccordionContent
              forceMount
              aria-hidden={open !== String(index)}
              inert={open !== String(index)}
              className="site-faq-answer"
            >
              <div>
                <p>{item.answer}</p>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
