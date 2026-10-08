const paths = {
  daily: 'M7 3v4m10-4v4M4 10h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Zm3 9h2m4 0h2m-8 3h2',
  talents: 'm12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8L12 2Z',
  loadout: 'm12 2 9 5v10l-9 5-9-5V7l9-5Zm0 5 4.5 2.5v5L12 17l-4.5-2.5v-5L12 7Z',
  workshop: 'M14 6a6 6 0 0 0-8 8l-3 3a2.8 2.8 0 0 0 4 4l3-3a6 6 0 0 0 8-8l-4 4-4-4 4-4Z',
  research: 'M9 3h6m-5 0v7l-6 9a1.3 1.3 0 0 0 1 2h14a1.3 1.3 0 0 0 1-2l-6-9V3M7 15h10m-6 3h2',
  codex: 'M12 6c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v15M6 9h3m-3 4h3m6-4h3m-3 4h3',
  goals: 'M8 3h8v6a4 4 0 0 1-8 0V3Zm0 2H3v3a5 5 0 0 0 5 5m8-8h5v3a5 5 0 0 1-5 5m-4 0v5m-4 3h8m-6-3h4v3',
  settings: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6',
};

/** Small, consistent line icons for the home menu; no font or image downloads. */
export function homeIcon(name: keyof typeof paths): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({
    viewBox: '0 0 24 24', width: '24', height: '24', fill: 'none',
    stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round',
    'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false',
  })) svg.setAttribute(key, value);
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', paths[name]);
  svg.append(path);
  return svg;
}
