import {
	AlertCircle,
	AlertTriangle,
	CheckCircle2,
	Info,
	Loader2,
	RefreshCcw,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
	const { t } = useTranslation();
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
				toast.success(t("settings.webServer.traefikVersion.updated"));
			} else if (result.error) {
				toast.error(
					t("settings.webServer.traefikVersion.updateFailed", {
						error: result.error,
					}),
				);
			} else {
				toast.error(
					t("settings.webServer.traefikVersion.notRunningYet", {
						version: data?.recommendedVersion,
					}),
				);
			}
		} catch (error) {
			const errorMessage =
				(error as Error)?.message ||
				t("settings.webServer.traefikVersion.updateError");
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
					<DialogTitle>{t("settings.webServer.traefikVersion.title")}</DialogTitle>
					<DialogDescription>
						{t("settings.webServer.traefikVersion.description")}
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
						<span>{t("settings.webServer.traefikVersion.checking")}</span>
					</div>
				) : (
					data &&
					(!isError || isInProgress) && (
						<div className="space-y-4">
							{data.versionStatus !== "not-found" && (
								<div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg border p-4 text-sm">
									<span className="text-muted-foreground">
										{t("settings.webServer.traefikVersion.installed")}
									</span>
									<span className="justify-self-end text-right font-medium break-all">
										{data.currentVersion && data.versionStatus !== "custom"
											? `v${data.currentVersion}`
											: data.image}
									</span>
									<span className="text-muted-foreground">
										{t("settings.webServer.traefikVersion.recommended")}
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
									{t("settings.webServer.traefikVersion.lastUpdateFailed", {
										error: data.lastUpdateError,
									})}
								</AlertBlock>
							)}
							{data.versionStatus !== "not-found" &&
								data.state !== "running" && (
									<AlertBlock
										type="error"
										icon={<AlertTriangle className="size-4" />}
									>
										{data.state === "restarting"
											? t(
													"settings.webServer.traefikVersion.restartingWarning",
												)
											: t("settings.webServer.traefikVersion.notRunningWarning", {
													state: data.state ?? "unknown",
													updateHint:
														data.versionStatus === "outdated"
															? t(
																	"settings.webServer.traefikVersion.thenUpdateHint",
																)
															: "",
												})}
									</AlertBlock>
								)}
							{data.versionStatus === "outdated" && (
								<AlertBlock
									type="warning"
									icon={<AlertCircle className="size-4" />}
								>
									{t("settings.webServer.traefikVersion.outdatedWarning", {
										version: data.recommendedVersion,
									})}
								</AlertBlock>
							)}
							{data.versionStatus === "up-to-date" &&
								data.state === "running" && (
									<AlertBlock
										type="success"
										icon={<CheckCircle2 className="size-4" />}
									>
										{t("settings.webServer.traefikVersion.upToDate")}
									</AlertBlock>
								)}
							{data.versionStatus === "newer" && (
								<AlertBlock type="info" icon={<Info className="size-4" />}>
									{t("settings.webServer.traefikVersion.newerInfo")}
								</AlertBlock>
							)}
							{data.versionStatus === "custom" && (
								<AlertBlock type="info" icon={<Info className="size-4" />}>
									{t("settings.webServer.traefikVersion.customImageInfo")}
								</AlertBlock>
							)}
							{data.versionStatus === "unknown" && (
								<AlertBlock
									type="warning"
									icon={<AlertCircle className="size-4" />}
								>
									{t("settings.webServer.traefikVersion.unknownVersion")}{" "}
									<span className="font-mono">{data.image}</span>.
								</AlertBlock>
							)}
							{data.versionStatus === "not-found" && (
								<AlertBlock
									type="error"
									icon={<AlertTriangle className="size-4" />}
								>
									{t("settings.webServer.traefikVersion.containerNotFound")}
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
						{t("settings.webServer.traefikVersion.checkAgain")}
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
							? t("settings.webServer.traefikVersion.updateTo", {
									version: data.recommendedVersion,
								})
							: t("settings.servers.handle.update")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
