import { createServer } from "node:net";

function isFree(port) {
	return new Promise((resolve) => {
		const server = createServer();
		server.once("error", () => resolve(false));
		server.listen(port, "0.0.0.0", () => {
			server.close(() => resolve(true));
		});
	});
}

async function findFreePort(start) {
	let port = start;
	while (!(await isFree(port))) {
		port++;
	}
	return port;
}

const start = Number.parseInt(
	process.argv[2] || process.env.PORT || "3000",
	10,
);
const port = await findFreePort(start);
process.stdout.write(String(port));
