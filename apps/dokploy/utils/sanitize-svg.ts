import DOMPurify from "dompurify";

export const sanitizeSvg = (svgContent: string): string | null => {
	const clean = DOMPurify.sanitize(svgContent, {
		USE_PROFILES: { svg: true, svgFilters: true },
	});

	if (!clean) return null;

	// Fix unicode base64 bug (TextEncoder byte-loop handles non-Latin1 chars)
	const bytes = new TextEncoder().encode(clean);
	let binString = "";
	for (let i = 0; i < bytes.length; i++) {
		binString += String.fromCharCode(bytes[i]!);
	}

	return `data:image/svg+xml;base64,${btoa(binString)}`;
};
