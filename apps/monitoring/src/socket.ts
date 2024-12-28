import os from "node:os";
import { exec } from "node:child_process";
import WebSocket from "ws";
import fs from "node:fs";
import path from "node:path";
import Docker from "dockerode";
import si from "systeminformation";
import { config } from "dotenv";
config();

console.log(process.env.WS_URL);

const docker = new Docker();
const serverLogFile = path.join(
	"/Users/mauricio/Documents/Github/Personal/dokploy/apps/dokploy/.docker",
	"server_metrics.log",
);
const containerLogFile = path.join(
	"/Users/mauricio/Documents/Github/Personal/dokploy/apps/dokploy/.docker",
	"containers_metrics.log",
);
// const ws = new WebSocket(
// 	process.env.WS_URL || "ws://localhost:3000/listen-monitoring",
// );

async function getServerMetrics() {
	const [cpu, mem, load, fsSize, network] = await Promise.all([
		si.cpu(),
		si.mem(),
		si.currentLoad(),
		si.fsSize(),
		si.networkStats(),
	]);

	return {
		cpu: load.currentLoad.toFixed(2), // Carga de CPU en %
		totalMem: (mem.total / 1024 / 1024).toFixed(2), // Memoria Total en MB
		memUsed: ((1 - mem.available / mem.total) * 100).toFixed(2), // % de memoria usada
		uptime: si.time().uptime, // Tiempo de actividad (segundos)
		diskUsed: fsSize[0].use.toFixed(2), // % de uso del primer disco
		totalDisk: (fsSize[0].size / 1024 / 1024 / 1024).toFixed(2), // Disco total en GB
		networkIn: (network[0].rx_bytes / 1024 / 1024).toFixed(2), // MB recibidos
		networkOut: (network[0].tx_bytes / 1024 / 1024).toFixed(2), // MB enviados
		timestamp: new Date().toISOString(),
	};
}
// /Users/mauricio/Documents/Github/Personal/dokploy/apps/dokploy/.docker
function logServerMetrics() {
	setInterval(async () => {
		const metrics = await getServerMetrics();

		console.log("Metrics:", metrics);

		const logLine = `${JSON.stringify(metrics)}\n`;

		fs.appendFile(serverLogFile, logLine, (err) => {
			if (err) console.error("Error al escribir en el archivo:", err);
		});

		// ws.send(JSON.stringify({ type: "server", data: metrics }));
	}, 5000);
}

// === 2. Métricas de Contenedores ===
async function logContainerMetrics() {
	setInterval(async () => {
		try {
			const containers = await docker.listContainers({ all: true });
			const timestamp = new Date().toISOString();

			for (const container of containers) {
				const logLine = `${container.Names[0]} - Estado: ${container.State}\n`;

				// Escribir log local
				fs.appendFile(containerLogFile, logLine, (err) => {
					if (err) console.error("Error al escribir log de contenedores:", err);
				});

				// (Opcional) Enviar al WebSocket
				// ws.send(
				// 	JSON.stringify({
				// 		type: "container",
				// 		data: {
				// 			name: container.Names[0],
				// 			state: container.State,
				// 		},
				// 	}),
				// );
			}

			// containers.forEach((container) => {

			// });
		} catch (error) {
			console.error("Error obteniendo contenedores:", error);
		}
	}, 10000); // Cada 10 segundos
}

console.log("Initializing...");
// === Inicializar los procesos en paralelo ===
// ws.on("open", () => {
console.log("Conectado al servidor central");
logServerMetrics();
// logContainerMetrics();
// });

// ws.on("close", () => {
// console.log("Conexión perdida con el servidor central");
// });/
