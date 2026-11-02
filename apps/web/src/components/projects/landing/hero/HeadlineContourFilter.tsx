const lattice = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="27" height="27"><path d="M-1 -1L28 28M-28 -1L1 28M26 -1L55 28" stroke="white" stroke-width="0.8"/></svg>')}`;

/** Sample the browser's actual glyph edges, including fallback fonts and shaped scripts. */
export function HeadlineContourFilter({ id }: { id: string }) {
  return (
    <svg className="hero-contour-definitions" width="0" height="0" aria-hidden>
      <defs>
        <filter
          id={id}
          x="-5%"
          y="-10%"
          width="110%"
          height="120%"
          colorInterpolationFilters="sRGB"
        >
          <feMorphology in="SourceAlpha" operator="erode" radius="0.7" result="inside" />
          <feComposite in="SourceAlpha" in2="inside" operator="out" result="edge" />
          <feImage x="0" y="0" width="27" height="27" href={lattice} result="cell" />
          <feTile in="cell" result="lattice" />
          <feComposite in="edge" in2="lattice" operator="in" result="samples" />
          <feMorphology in="samples" operator="dilate" radius="2.8" result="expanded" />
          <feGaussianBlur in="expanded" stdDeviation="1.2" result="rounded" />
          <feComponentTransfer in="rounded" result="nodes">
            <feFuncA type="discrete" tableValues="0 0 1 1" />
          </feComponentTransfer>
          <feFlood floodColor="var(--hero-ink)" result="color" />
          <feComposite in="color" in2="nodes" operator="in" />
        </filter>
      </defs>
    </svg>
  );
}
