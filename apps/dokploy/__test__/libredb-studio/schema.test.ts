import { libredbStudio } from "@dokploy/server/db/schema/libredb-studio";
import { decryptValue, isEncrypted } from "@dokploy/server/lib/encryption";
import { describe, expect, it } from "vitest";

describe("libredb_studio secret columns", () => {
	it.each(["launchSecret", "jwtSecret", "adminPassword"] as const)(
		"stores %s encrypted in a text column that every insert must set",
		(name) => {
			const column = libredbStudio[name];
			expect(column.getSQLType()).toBe("text");
			expect(column.notNull).toBe(true);
			expect(column.hasDefault).toBe(false);

			const plaintext = `${name}-plaintext-value`;
			const stored = column.mapToDriverValue(plaintext);
			if (typeof stored !== "string") {
				throw new Error(`expected ${name} to reach the driver as a string`);
			}
			expect(isEncrypted(stored)).toBe(true);
			expect(stored).not.toContain(plaintext);
			expect(decryptValue(stored)).toBe(plaintext);
			expect(column.mapFromDriverValue(stored)).toBe(plaintext);
		},
	);
});
