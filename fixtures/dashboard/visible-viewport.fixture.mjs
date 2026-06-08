import { captureElementTree } from "../../apps/chrome-extension/dist/capture-core.js";

export function createDashboardVisibleViewportCapture() {
  return captureElementTree(
    {
      tagName: "main",
      rect: { x: 0, y: 0, width: 1440, height: 900 },
      styles: { display: "grid", backgroundColor: "rgb(249, 250, 251)" },
      attributes: { role: "main", class: "dashboard" },
      children: [
        {
          tagName: "aside",
          sourceNodeId: "dom-sidebar",
          rect: { x: 0, y: 0, width: 240, height: 900 },
          styles: { backgroundColor: "rgb(17, 24, 39)" },
          attributes: { class: "sidebar" },
          children: [
            {
              tagName: "span",
              sourceNodeId: "dom-sidebar-item",
              textContent: "Revenue",
              rect: { x: 24, y: 32, width: 120, height: 24 },
              styles: { color: "rgb(255, 255, 255)", fontSize: "14px" },
              attributes: {},
              children: []
            }
          ]
        },
        {
          tagName: "section",
          sourceNodeId: "dom-card",
          rect: { x: 280, y: 32, width: 360, height: 220 },
          styles: {
            backgroundColor: "rgb(255, 255, 255)",
            borderTopWidth: "1px",
            borderTopColor: "rgb(229, 231, 235)",
            borderTopLeftRadius: "8px",
            borderTopRightRadius: "8px",
            borderBottomRightRadius: "8px",
            borderBottomLeftRadius: "8px",
            boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.12)"
          },
          attributes: { class: "card" },
          children: [
            {
              tagName: "span",
              sourceNodeId: "dom-title",
              textContent: "Revenue",
              rect: { x: 304, y: 56, width: 120, height: 28 },
              styles: {
                fontFamily: "Inter",
                fontSize: "20px",
                fontWeight: "600",
                lineHeight: "28px",
                color: "rgb(17, 24, 39)"
              },
              attributes: {},
              children: []
            },
            {
              tagName: "img",
              sourceNodeId: "dom-chart-image",
              rect: { x: 304, y: 104, width: 160, height: 96 },
              styles: { objectFit: "cover" },
              attributes: { src: "data:image/png;base64,iVBORw0KGgo=", alt: "Revenue chart" },
              children: []
            },
            {
              tagName: "canvas",
              sourceNodeId: "dom-chart-canvas",
              rect: { x: 480, y: 104, width: 120, height: 96 },
              styles: {},
              attributes: {},
              children: []
            }
          ]
        },
        {
          tagName: "section",
          sourceNodeId: "dom-below-fold",
          rect: { x: 280, y: 1100, width: 360, height: 220 },
          styles: { backgroundColor: "rgb(255, 255, 255)" },
          attributes: { class: "card" },
          children: []
        }
      ]
    },
    { width: 1440, height: 900, devicePixelRatio: 2, scrollX: 0, scrollY: 0 },
    {
      sourceUrl: "https://app.example.com/dashboard",
      title: "Dashboard",
      captureTimestamp: "2026-06-08T08:00:00.000Z",
      deviceLabel: "desktop"
    }
  );
}
