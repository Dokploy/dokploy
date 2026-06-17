import { Info, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";

const MIN = 1;
const MAX = 10;

interface Props {
	serverId: string;
}

/**
 * Inline editor for a remote server's deployment concurrency. Rendered inside
 * the "Deployments" tab of the Setup Server dialog — groups with other
 * deployment-related server configuration.
 */
export const DeploymentConcurrencySection = ({ serverId }: Props) => {
	const serverQuery = api.server.one.useQuery(
		{ serverId },
		{ enabled: !!serverId },
	);
	const update = api.server.updateDeploymentConcurrency.useMutation();

	const currentConcurrency = serverQuery.data?.deploymentConcurrency;
	// Only poll while the section is actually mounted; stops the moment a parent unmounts the tab.
	const [isMounted, setIsMounted] = useState(false);
	useEffect(() => {
		setIsMounted(true);
		return () => setIsMounted(false);
	}, []);
	const queueQuery = api.deployment.queueList.useQuery(undefined, {
		enabled: isMounted,
		refetchInterval: isMounted ? 3000 : false,
	});
	const liveCounts = useMemo(() => {
		const snapshots = queueQuery.data ?? [];
		let active = 0;
		let pending = 0;
		for (const s of snapshots) {
			const target = s.data.serverId ?? null;
			if (target !== serverId) continue;
			if (s.state === "active") active++;
			else pending++;
		}
		return { active, pending };
	}, [queueQuery.data, serverId]);

	const [value, setValue] = useState<number>(currentConcurrency ?? 1);

	useEffect(() => {
		if (typeof currentConcurrency === "number") {
			setValue(currentConcurrency);
		}
	}, [currentConcurrency]);

	const isDirty =
		typeof currentConcurrency === "number" && value !== currentConcurrency;
	const isValid = Number.isInteger(value) && value >= MIN && value <= MAX;

	const save = async () => {
		if (!isValid) {
			toast.error(`Concurrency must be an integer between ${MIN} and ${MAX}`);
			return;
		}
		try {
			await update.mutateAsync({
				serverId,
				deploymentConcurrency: value,
			});
			await serverQuery.refetch();
			toast.success("Deployment concurrency updated");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update concurrency",
			);
		}
	};

	return (
		<Card className="bg-background">
			<CardHeader>
				<CardTitle className="text-xl">Deployment Concurrency</CardTitle>
				<CardDescription>
					Number of deployments this server may run in parallel. Other servers
					are unaffected.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<div className="flex items-center justify-between">
					<Label htmlFor="deployment-concurrency">Concurrent deployments</Label>
					<span className="text-xs text-muted-foreground">
						Live: {liveCounts.active} active · {liveCounts.pending} queued
					</span>
				</div>
				<Input
					id="deployment-concurrency"
					type="number"
					min={MIN}
					max={MAX}
					step={1}
					value={value}
					onChange={(event) => setValue(Number(event.target.value))}
					className="max-w-xs"
				/>
				<p className="text-xs text-muted-foreground">
					<span className="font-medium">1</span> = one deploy at a time
					(safest). <span className="font-medium">2–{MAX}</span> = run that many
					side-by-side; only raise if the host has spare CPU/RAM.
				</p>
				<Alert>
					<Info className="h-4 w-4" />
					<AlertDescription>
						Each concurrent build uses roughly one CPU core and 2&nbsp;GB of RAM
						while active. Saved value applies immediately; in-flight deployments
						are not interrupted.
					</AlertDescription>
				</Alert>
				<div>
					<Button
						onClick={save}
						disabled={update.isPending || !isDirty || !isValid}
					>
						{update.isPending ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Saving…
							</>
						) : (
							"Save"
						)}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
};
