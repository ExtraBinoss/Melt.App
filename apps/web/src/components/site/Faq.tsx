import { ChevronDown } from "lucide-react";
export interface FaqItem {
  question: string;
  answer: string;
}
/** Native exclusive disclosures work from the server HTML, before hydration. */
export function Faq({
  items,
  title,
  id = "faq",
}: {
  items: readonly FaqItem[];
  title: string;
  id?: string;
}) {
  return (
    <section className="site-faq" id={id} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      <div className="site-faq-items">
        {items.map((item) => (
          <details key={item.question} name={`${id}-answers`} className="site-faq-item">
            <summary>
              <h3>{item.question}</h3>
              <ChevronDown size={16} aria-hidden />
            </summary>
            <div className="site-faq-answer">
              <p>{item.answer}</p>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
