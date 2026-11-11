import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { DrawerLogs } from "@/components/shared/drawer-logs";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import "@/styles/globals.css";

const scenario = new URLSearchParams(location.search).get("scenario");

function RestoreLogStackingFixture() {
	const initiallyOpen =
		scenario === "simultaneous" || scenario === "late-overlay";
	const [open, setOpen] = useState(initiallyOpen);
	const [logsOpen, setLogsOpen] = useState(initiallyOpen);
	const [closedLogs, setClosedLogs] = useState(0);

	useEffect(() => {
		if (scenario !== "late-overlay" || !logsOpen) return;
		// Match the portal order observed in the failing restoration UI.
		const moveOverlay = () => {
			const overlay = document.querySelector("[data-slot=sheet-overlay]");
			const content = document.querySelector("[data-slot=sheet-content]");
			if (!overlay || !content) return false;
			document.body.appendChild(overlay);
			return true;
		};
		if (moveOverlay()) return;
		const observer = new MutationObserver(() => {
			if (moveOverlay()) observer.disconnect();
		});
		observer.observe(document.body, { childList: true });
		return () => observer.disconnect();
	}, [logsOpen]);

	return (
		<main className="p-8">
			<h1>Restoration log stacking regression</h1>
			<p>Real Dialog and DrawerLogs components; no restoration backend.</p>
			<button type="button" onClick={() => setOpen(true)}>
				Open restore dialog
			</button>
			<p data-testid="closed-logs">Logs closed: {closedLogs}</p>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogTitle>Restore Backup</DialogTitle>
					<DialogDescription>Local UI regression fixture.</DialogDescription>
					<button type="button" onClick={() => setLogsOpen(true)}>
						Show restoration logs
					</button>
					<DrawerLogs
						isOpen={logsOpen}
						onClose={() => {
							setLogsOpen(false);
							setClosedLogs((count) => count + 1);
						}}
						filteredLogs={[
							{
								timestamp: null,
								rawTimestamp: null,
								message: "Starting restore...",
							},
							{
								timestamp: null,
								rawTimestamp: null,
								message: "Restore completed successfully!",
							},
						]}
					/>
				</DialogContent>
			</Dialog>
		</main>
	);
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<RestoreLogStackingFixture />);
