import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

const MIME_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".avif": "image/avif",
	".ico": "image/x-icon",
	".txt": "text/plain; charset=utf-8",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".map": "application/json; charset=utf-8",
	".wasm": "application/wasm",
	".webmanifest": "application/manifest+json",
};

const sendFile = (
	res: ServerResponse,
	filePath: string,
	cacheControl: string,
) => {
	res.writeHead(200, {
		"content-type":
			MIME_TYPES[path.extname(filePath).toLowerCase()] ??
			"application/octet-stream",
		"cache-control": cacheControl,
	});
	fs.createReadStream(filePath).pipe(res);
};

export const createStaticHandler = (distDir: string) => {
	const hasDist = fs.existsSync(path.join(distDir, "index.html"));

	return (req: IncomingMessage, res: ServerResponse, url: URL) => {
		if (req.method !== "GET" && req.method !== "HEAD") {
			res.writeHead(404).end();
			return;
		}
		if (!hasDist) {
			res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
			res.end(
				"UI build not found. In development run the Vite dev server (pnpm --filter dokploy-vite dev); for production run vite build first.",
			);
			return;
		}

		const pathname = decodeURIComponent(url.pathname);
		const filePath = path.join(distDir, pathname);
		if (!filePath.startsWith(distDir)) {
			res.writeHead(403).end();
			return;
		}

		if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
			const cacheControl = pathname.startsWith("/assets/")
				? "public, max-age=31536000, immutable"
				: "public, max-age=0, must-revalidate";
			sendFile(res, filePath, cacheControl);
			return;
		}

		sendFile(
			res,
			path.join(distDir, "index.html"),
			"no-cache, no-store, must-revalidate",
		);
	};
};
