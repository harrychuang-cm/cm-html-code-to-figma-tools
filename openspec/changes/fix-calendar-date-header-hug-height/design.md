## Design

The observed calendar example has:

- width `157.57`
- height `173.6`
- two text children at `y=0`
- child heights `16` and `30`
- horizontal centering on the primary axis
- no visual fill, border, shadow, or background content

The height represents the week cell, not the intrinsic date label row. Figma should instead use a horizontal auto-layout frame that keeps width fixed but hugs the counter axis. The text row then resolves to approximately `30px` high, and the shorter day number is centered against the taller adjacent label.

The implementation must stay reusable for future HTML/CSS captures with the same structure. It must not key off the Figma node id, the visible strings, DOM class names, page URL, or the originating app name.

The heuristic stays conservative:

- layout must be horizontal, either from CSS flex or from existing non-flex flow inference,
- there must be at least two children,
- every child must be a single-line TEXT model,
- the parent must have no visual box style,
- the union of children must start at the leading counter-axis edge,
- the union height must be much smaller than the parent height.

When those conditions match, the layout model sets `counterAxisSizingMode: AUTO` and `counterAxisAlignItems: CENTER`. The same helper is used by the flex auto-layout path and the inferred non-flex flow auto-layout path, with only the flex path requiring `display:flex` or `display:inline-flex`.

The accessible iframe fix stays at capture time, not import time. When an iframe exposes `contentDocument` or `contentWindow.document`, the capturer walks the iframe document body's rendered children, snapshots them with the iframe document/window style context, and translates every descendant rect by the iframe's page rect. That preserves parent-page coordinates for the importer. If the iframe document is inaccessible, empty, or throws while being read, the captured iframe has no children and asset capture keeps the existing `iframe fallback` screenshot behavior.

The asset fallback rule becomes conditional for iframes:

- iframe with captured children: no `fallbackRef`, so the importer receives editable frames/text/images from the child DOM,
- iframe without captured children: keep `fallbackRef` and diagnostic reason `iframe fallback`.
