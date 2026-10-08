import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const appDir = fileURLToPath(new URL("../../", import.meta.url));
const result = await build({
	stdin: {
		resolveDir: appDir,
		loader: "tsx",
		contents: `
import { act } from "react";
import { createRoot } from "react-dom/client";
import { UpdateConfigForm } from "./components/dashboard/application/advanced/cluster/swarm-forms/update-config-form";
import { RollbackConfigForm } from "./components/dashboard/application/advanced/cluster/swarm-forms/rollback-config-form";
import { fixture } from "@/utils/api";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const root = createRoot(document.getElementById("root"));
const output = document.getElementById("result");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const selectedLabels = () => [...document.querySelectorAll('button[role="combobox"]')].map(el => el.textContent);

try {
  for (const [Form, key] of [[UpdateConfigForm, "updateConfigSwarm"], [RollbackConfigForm, "rollbackConfigSwarm"]]) {
    for (const cached of [true, false]) {
      fixture.cached = cached;
      fixture.saved = undefined;
      await act(async () => root.render(<Form id="test" type="application" />));
      assert(JSON.stringify(selectedLabels()) === JSON.stringify(["Continue", "Start First"]), key + ": saved selections disappeared (cached=" + cached + ")");
      await act(async () => document.querySelector("form").requestSubmit());
      assert(fixture.saved[key].FailureAction === "continue", key + ": failure action lost on submit");
      assert(fixture.saved[key].Order === "start-first", key + ": order lost on submit");
      await act(async () => [...document.querySelectorAll("button")].find(el => el.textContent === "Clear").click());
      assert(JSON.stringify(selectedLabels()) === JSON.stringify(["Select failure action", "Select order"]), key + ": clear left stale selections");
      await act(async () => root.render(null));
    }
  }
  output.textContent = "PASS: Update and Rollback preserve cached and asynchronously loaded selections on submit; Clear resets both selects.";
  document.title = "PASS: Swarm selects";
} catch (error) {
  output.textContent = "FAIL: " + error.message;
  document.title = "FAIL: Swarm selects";
  console.error(error);
}
`,
	},
	bundle: true,
	write: false,
	format: "esm",
	jsx: "automatic",
	tsconfig: `${appDir}/tsconfig.json`,
	define: { "process.env.NODE_ENV": '"development"' },
	plugins: [
		{
			name: "fixture-api",
			setup(builder) {
				builder.onResolve({ filter: /^@\/utils\/api$/ }, () => ({
					path: "fixture-api",
					namespace: "fixture",
				}));
				builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
					resolveDir: appDir,
					contents: `
import { useEffect, useState } from "react";
export const fixture = { cached: true, saved: undefined };
const config = { Parallelism: 1, Delay: 0, FailureAction: "continue", Monitor: 0, MaxFailureRatio: 0, Order: "start-first" };
const data = { updateConfigSwarm: config, rollbackConfigSwarm: config };
const service = {
  one: { useQuery() {
    const [value, setValue] = useState(fixture.cached ? data : undefined);
    useEffect(() => { if (!fixture.cached) Promise.resolve().then(() => setValue(data)); }, []);
    return { data: value, refetch: async () => setValue({ ...data }) };
  } },
  update: { useMutation: () => ({ mutateAsync: async input => { fixture.saved = input; } }) }
};
export const api = { application: service };
`,
				}));
			},
		},
	],
});

const server = createServer((request, response) => {
	if (request.url === "/test.js") {
		response.setHeader("Content-Type", "text/javascript");
		response.end(result.outputFiles[0].text);
		return;
	}
	response.setHeader("Content-Type", "text/html");
	response.end(
		'<!doctype html><title>Swarm selects</title><pre id="result">Running...</pre><div id="root"></div><script type="module" src="/test.js"></script>',
	);
});
server.listen(0, "127.0.0.1", () => {
	console.log(
		`Open http://127.0.0.1:${server.address().port} to run the browser regression check.`,
	);
});
