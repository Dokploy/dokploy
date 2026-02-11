
import { generatePatch } from "@dokploy/server/services/patch";
import { describe, expect, it, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsyncLocal = promisify(exec);

describe("Patch System Integration", () => {
	let tempDir: string;

	afterEach(async () => {
		if (tempDir) {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("should generate a patch that can be successfully applied via git", async () => {
		// Setup repo
		tempDir = await mkdtemp(join(tmpdir(), "dokploy-patch-test-"));
		const fileName = "test.txt";
		const filePath = join(tempDir, fileName);
		
		await execAsyncLocal("git init", { cwd: tempDir });
		await execAsyncLocal("git config user.email 'test@test.com'", { cwd: tempDir });
		await execAsyncLocal("git config user.name 'Test'", { cwd: tempDir });
		
		// Original content
		await writeFile(filePath, "line1\nline2\n");
		await execAsyncLocal(`git add ${fileName}`, { cwd: tempDir });
		await execAsyncLocal("git commit -m 'init'", { cwd: tempDir });
		
		// Generate patch (modify content)
		const newContent = "line1\nline2\nline3\n";
		const patchContent = await generatePatch({
			codePath: tempDir,
			filePath: fileName,
			newContent,
			serverId: null,
		});
		
		// Verify patch format
		expect(patchContent.endsWith("\n")).toBe(true);

		// Reset file (generatePatch does reset, but ensure it)
		await execAsyncLocal("git checkout .", { cwd: tempDir });
		const savedContent = await readFile(filePath, "utf-8");
		expect(savedContent).toBe("line1\nline2\n");
		
		// Apply patch verification
		// We simulate what Deployment Service does: write patch to file and run git apply
		const patchFile = join(tempDir, "changes.patch");
		await writeFile(patchFile, patchContent);
		
		try {
			 await execAsyncLocal(`git apply --whitespace=fix ${patchFile}`, { cwd: tempDir });
		} catch (e: any) {
			console.error("Git apply failed:", e.message);
			console.log("Patch content:", JSON.stringify(patchContent));
			throw e;
		}
		
		const appliedContent = await readFile(filePath, "utf-8");
		expect(appliedContent).toBe(newContent);
	});

	it("should handle files created without trailing newline", async () => {
		// Setup repo
		tempDir = await mkdtemp(join(tmpdir(), "dokploy-patch-test-noline-"));
		const fileName = "noline.txt";
		const filePath = join(tempDir, fileName);
		
		await execAsyncLocal("git init", { cwd: tempDir });
		await execAsyncLocal("git config user.email 'test@test.com'", { cwd: tempDir });
		await execAsyncLocal("git config user.name 'Test'", { cwd: tempDir });
		
		// Original content WITHOUT newline
		await writeFile(filePath, "line1");
		await execAsyncLocal(`git add ${fileName}`, { cwd: tempDir });
		await execAsyncLocal("git commit -m 'init'", { cwd: tempDir });
		
		// Generate patch 
		const newContent = "line1\nline2";
		const patchContent = await generatePatch({
			codePath: tempDir,
			filePath: fileName,
			newContent,
			serverId: null,
		});

		// Verify patch format
		expect(patchContent.endsWith("\n")).toBe(true);
		
		// Apply patch
		const patchFile = join(tempDir, "changes.patch");
		await writeFile(patchFile, patchContent);
		
		await execAsyncLocal(`git apply --whitespace=fix ${patchFile}`, { cwd: tempDir });
		
		const appliedContent = await readFile(filePath, "utf-8");
		expect(appliedContent).toBe(newContent);
	});
});
