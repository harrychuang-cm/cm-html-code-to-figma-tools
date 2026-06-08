export function createValidPackage(overrides = {}) {
  const manifest = {
    schemaVersion: "1.0.0",
    generatorVersion: "0.1.0",
    sourceUrl: "https://app.example.com/dashboard",
    captureTimestamp: "2026-06-08T08:00:00.000Z",
    viewportWidth: 1440,
    viewportHeight: 900,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 120,
    deviceLabel: "desktop"
  };

  const capture = {
    sourceUrl: manifest.sourceUrl,
    title: "Dashboard",
    viewport: {
      width: manifest.viewportWidth,
      height: manifest.viewportHeight,
      devicePixelRatio: manifest.devicePixelRatio,
      scrollX: manifest.scrollX,
      scrollY: manifest.scrollY
    },
    root: {
      id: "node-1",
      sourceNodeId: "dom-1",
      nodeType: "element",
      tagName: "main",
      rect: { x: 0, y: 0, width: 1440, height: 900 },
      styles: {
        display: "grid",
        backgroundColor: "rgb(255, 255, 255)"
      },
      attributes: {
        role: "main"
      },
      children: [
        {
          id: "node-2",
          sourceNodeId: "dom-2",
          nodeType: "text",
          tagName: "#text",
          textContent: "Revenue",
          rect: { x: 32, y: 40, width: 120, height: 28 },
          styles: {
            fontFamily: "Inter",
            fontSize: "20px",
            color: "rgb(17, 24, 39)"
          },
          attributes: {},
          children: []
        },
        {
          id: "node-3",
          sourceNodeId: "dom-3",
          nodeType: "element",
          tagName: "img",
          rect: { x: 32, y: 96, width: 240, height: 160 },
          styles: {
            objectFit: "cover"
          },
          attributes: {
            src: "https://app.example.com/chart.png",
            alt: "Chart"
          },
          assetRef: "assets/image-1.png",
          children: []
        }
      ]
    }
  };

  const figmaPlan = {
    planVersion: "1.0.0",
    frames: [
      {
        id: "frame-source",
        role: "Source Screenshot",
        name: "Dashboard / 1440x900 / Source Screenshot",
        nodes: []
      },
      {
        id: "frame-accurate",
        role: "Editable Accurate",
        name: "Dashboard / 1440x900 / Editable Accurate",
        nodes: [
          {
            id: "plan-node-2",
            type: "text",
            sourceNodeId: "dom-2",
            rect: { x: 32, y: 40, width: 120, height: 28 },
            confidence: 1
          }
        ]
      }
    ],
    sourceNodeMap: [
      { sourceNodeId: "dom-2", planNodeId: "plan-node-2" }
    ]
  };

  const diagnostics = {
    status: "warning",
    warnings: ["1 fallback region"],
    counts: {
      fallbacks: 1,
      missingAssets: 0,
      unsupportedStyles: 1
    },
    fallbackReasons: [
      { sourceNodeId: "dom-canvas-1", reason: "canvas fallback" }
    ],
    missingAssets: [],
    unsupportedStyles: ["filter"],
    autoLayoutCandidates: [
      {
        sourceNodeId: "dom-nav-1",
        pattern: "navigation item list",
        confidence: 0.91,
        applied: true
      }
    ]
  };

  return {
    manifest,
    capture,
    figmaPlan,
    diagnostics,
    screenshot: new Uint8Array([137, 80, 78, 71]),
    assets: {
      "assets/image-1.png": new Uint8Array([1, 2, 3])
    },
    ...overrides
  };
}
