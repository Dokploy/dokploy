import {
	AlertCircle,
	AlertTriangle,
	CheckCircle2,
	Info,
	Loader2,
	RefreshCcw,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";

interface Props {
	children?: React.ReactNode;
	serverId?: string;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const UpdateTraefikVersion = ({ children, serverId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [isWaiting, setIsWaiting] = useState(false);
	const utils = api.useUtils();

	const { data, isPending, isFetching, refetch, error, isError } =
		api.settings.getTraefikOverview.useQuery(
			{ serverId },
			{
				enabled: isOpen,
				retry: false,
				refetchInterval: (query) =>
					query.state.data?.isUpdating ? 3000 : false,
			},
		);

	const { mutateAsync: updateTraefik, isPending: isUpdating } =
		api.settings.updateTraefik.useMutation();

	const isInProgress = isUpdating || isWaiting || !!data?.isUpdating;

	// /api/health can't see a remote server's Traefik, so poll its overview.
	const waitForTraefik = async (): Promise<
		{ ok: true } | { ok: false; error: string | null }
	> => {
		const deadline = Date.now() + 90_000;
		let confirmedStart: string | null = null;
		await wait(8000);
		while (Date.now() < deadline) {
			try {
				const overview = await utils.client.settings.getTraefikOverview.query({
					serverId,
				});
				if (!overview.isUpdating && overview.lastUpdateError) {
					return { ok: false, error: overview.lastUpdateError };
				}
				const isUp =
					!overview.isUpdating &&
					overview.state === "running" &&
					overview.versionStatus === "up-to-date" &&
					!!overview.startedAt;
				// A crash-looping container is briefly running; require the same start twice.
				if (isUp && overview.startedAt === confirmedStart) {
					return { ok: true };
				}
				confirmedStart = isUp ? overview.startedAt : null;
			} catch {
				// Expected while the UI is served through the Traefik being replaced.
			}
			await wait(3000);
		}
		return { ok: false, error: null };
	};

	const handleUpdate = async () => {
		try {
			await updateTraefik({ serverId });
			setIsWaiting(true);
			const result = await waitForTraefik();
			if (result.ok) {
				toast.success("Traefik updated");
			} else if (result.error) {
				toast.error(`Traefik update failed: ${result.error}`);
			} else {
				toast.error(
					`Traefik isn't running v${data?.recommendedVersion} yet. Check View Logs for errors.`,
				);
			}
		} catch (error) {
			const errorMessage =
				(error as Error)?.message ||
				"Failed to update Traefik. Please try again.";
			toast.error(errorMessage);
		} finally {
			setIsWaiting(false);
			refetch();
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Traefik Update</DialogTitle>
					<DialogDescription>
						Compare the running Traefik with the version recommended by this
						Dokploy release.
					</DialogDescription>
				</DialogHeader>

				{isError && !isInProgress && (
					<AlertBlock type="error" icon={<AlertTriangle className="size-4" />}>
						{error?.message}
					</AlertBlock>
				)}

				{isPending && !isError ? (
					<div className="flex items-center justify-center text-muted-foreground py-4">
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						<span>Checking Traefik version</span>
					</div>
				) : (
					data &&
					(!isError || isInProgress) && (
						<div className="space-y-4">
							{data.versionStatus !== "not-found" && (
								<div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg border p-4 text-sm">
									<span className="text-muted-foreground">
										Installed version
									</span>
									<span className="justify-self-end text-right font-medium break-all">
										{data.currentVersion && data.versionStatus !== "custom"
											? `v${data.currentVersion}`
											: data.image}
									</span>
									<span className="text-muted-foreground">
										Recommended version
									</span>
									<span className="justify-self-end font-medium">
										v{data.recommendedVersion}
									</span>
								</div>
							)}

							{data.lastUpdateError && !isInProgress && (
								<AlertBlock
									type="error"
									icon={<AlertTriangle className="size-4" />}
								>
									Last update failed: {data.lastUpdateError}
								</AlertBlock>
							)}
							{data.versionStatus !== "not-found" &&
								data.state !== "running" && (
									<AlertBlock
										type="error"
										icon={<AlertTriangle className="size-4" />}
									>
										{data.state === "restarting"
											? "Traefik keeps restarting, so your applications are unreachable. Check View Logs for the error."
											: `Traefik is not running (${data.state ?? "unknown"}), so your applications are unreachable. Use Reload to start it${data.versionStatus === "outdated" ? ", then update it" : ""}.`}
									</AlertBlock>
								)}
							{data.versionStatus === "outdated" && (
								<AlertBlock
									type="warning"
									icon={<AlertCircle className="size-4" />}
								>
									Dokploy recommends Traefik v{data.recommendedVersion}.
									Updating is optional and recreates the Traefik container, so
									your applications may be unreachable for a few seconds. Env
									variables and port mappings are kept.
								</AlertBlock>
							)}
							{data.versionStatus === "up-to-date" &&
								data.state === "running" && (
									<AlertBlock
										type="success"
										icon={<CheckCircle2 className="size-4" />}
									>
										Traefik is on the version recommended by Dokploy.
									</AlertBlock>
								)}
							{data.versionStatus === "newer" && (
								<AlertBlock type="info" icon={<Info className="size-4" />}>
									Traefik is newer than the version recommended by Dokploy. No
									update needed.
								</AlertBlock>
							)}
							{data.versionStatus === "custom" && (
								<AlertBlock type="info" icon={<Info className="size-4" />}>
									Traefik runs a custom image, so Dokploy won't update it.
									Saving Traefik env or port mappings replaces it with the
									official image.
								</AlertBlock>
							)}
							{data.versionStatus === "unknown" && (
								<AlertBlock
									type="warning"
									icon={<AlertCircle className="size-4" />}
								>
									Couldn't read a version from the Traefik image{" "}
									<span className="font-mono">{data.image}</span>.
								</AlertBlock>
							)}
							{data.versionStatus === "not-found" && (
								<AlertBlock
									type="error"
									icon={<AlertTriangle className="size-4" />}
								>
									The dokploy-traefik container was not found on this server.
								</AlertBlock>
							)}
						</div>
					)
				)}

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => refetch()}
						isLoading={isFetching && !isPending && !isInProgress}
						disabled={isInProgress}
					>
						<RefreshCcw className="h-4 w-4" />
						Check again
					</Button>
					<Button
						onClick={handleUpdate}
						isLoading={isInProgress}
						disabled={
							data?.versionStatus !== "outdated" ||
							data.state !== "running" ||
							isError ||
							isFetching
						}
					>
						{data?.versionStatus === "outdated"
							? `Update to v${data.recommendedVersion}`
							: "Update"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
