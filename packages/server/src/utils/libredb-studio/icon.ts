// One color, in the stroke style of the lucide icons Dokploy shows next to it.
// Some views (the overview list, the deployments table, the breadcrumb) render the data URL
// as an <img>, where currentColor cannot follow the theme, so the stroke is the light theme's
// muted foreground, which stays legible on the dark theme's black.
export const LIBREDB_STUDIO_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#71717a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M10 9.5 8 12l2 2.5"/><path d="m14 9.5 2 2.5-2 2.5"/></svg>
`;

// btoa instead of Buffer keeps this module importable from browser code.
export const LIBREDB_STUDIO_ICON_DATA_URL = `data:image/svg+xml;base64,${btoa(LIBREDB_STUDIO_ICON_SVG)}`;
