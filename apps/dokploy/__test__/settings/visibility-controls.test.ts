import { webServerSettings } from "@dokploy/server/db/schema";
import { describe, expect, it } from "vitest";

describe("Visibility Controls - Database schema", () => {
	it.each([
		"hideSocialIcons",
		"hideDocsLink",
		"hideSupportLink",
		"hideSSOButton",
		"hidePasskeyButton",
	] as const)("%s is a non-null boolean defaulting to false", (column) => {
		expect(webServerSettings[column].dataType).toBe("boolean");
		expect(webServerSettings[column].notNull).toBe(true);
		expect(webServerSettings[column].default).toBe(false);
	});
});
