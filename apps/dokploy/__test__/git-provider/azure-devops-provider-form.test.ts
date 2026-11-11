import { describe, expect, it } from "vitest";
import {
	initialAzureDevopsProviderForm as initial,
	azureDevopsProviderFormReducer as reduce,
} from "@/components/dashboard/settings/git/azure-devops-provider-form";

describe("Azure DevOps provider form refreshes", () => {
	it("preserves edits and a replacement PAT when fresh provider data arrives", () => {
		let state = reduce(initial, {
			type: "hydrate",
			name: "Cached name",
			baseUrl: "https://ado.test/Collection",
		});
		state = reduce(state, { type: "change", field: "name", value: "New name" });
		state = reduce(state, {
			type: "change",
			field: "token",
			value: "synthetic-replacement-pat",
		});
		state = reduce(state, {
			type: "hydrate",
			name: "Server name",
			baseUrl: "https://ado.test/UpdatedCollection",
		});
		expect(state.name).toBe("New name");
		expect(state.token).toBe("synthetic-replacement-pat");
		expect(state.baseUrl).toBe("https://ado.test/UpdatedCollection");
	});
	it("keeps a URL entered before the first query finishes", () => {
		const edited = reduce(initial, {
			type: "change",
			field: "baseUrl",
			value: "https://ado.test/NewCollection",
		});
		const loaded = reduce(edited, {
			type: "hydrate",
			name: "Provider",
			baseUrl: "https://ado.test/OldCollection",
		});
		expect(loaded.baseUrl).toBe("https://ado.test/NewCollection");
		expect(loaded.name).toBe("Provider");
	});
	it("clears the PAT and old edits when the dialog is reopened", () => {
		const edited = reduce(initial, {
			type: "change",
			field: "token",
			value: "synthetic-replacement-pat",
		});
		const reopened = reduce(reduce(edited, { type: "reset" }), {
			type: "hydrate",
			name: "Saved name",
			baseUrl: "https://ado.test/Collection",
		});
		expect(reopened.name).toBe("Saved name");
		expect(reopened.token).toBe("");
	});
});
