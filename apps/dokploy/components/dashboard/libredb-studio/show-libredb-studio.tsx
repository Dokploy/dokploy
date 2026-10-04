import { ExternalLink, Loader2, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useLibreDBStudioLaunch } from "@/components/dashboard/libredb-studio/open-in-libredb-studio";
import {
	COOKIE_SETTING_WARNING,
	CUSTOM_CONNECTIONS_WARNING,
	getDatabaseHref,
	getStudioImageTag,
	getStudioOpenBlocker,
	getStudioStatusLabel,
	getSyncResultMessage,
	HTTP_ADDRESS_WARNING,
	STUDIO_ACCESS_WARNING,
	STUDIO_NO_DOMAIN_REASON,
	STUDIO_REVOCATION_WARNING,
} from "@/components/dashboard/libredb-studio/utils";
import {
	DB_ENGINE_ICONS,
	LibreDBStudioIcon,
} from "@/components/icons/data-tools-icons";
import { AlertBlock } from "@/components/shared/alert-block";
import { DateTooltip } from "@/components/shared/date-tooltip";
import { DialogAction } from "@/components/shared/dialog-action";
import { StatusTooltip } from "@/components/shared/status-tooltip";
import { ToggleVisibilityInput } from "@/components/shared/toggle-visibility-input";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";

interface Props {
	applicationId: string;
}

export const ShowLibreDBStudio = ({ applicationId }: Props) => {
	const id = useId();
	const [showCredentials, setShowCredentials] = useState(false);
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: auth } = api.user.get.useQuery();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const isOwnerOrAdmin = auth?.role === "owner" || auth?.role === "admin";
	const canDeploy = permissions?.deployment.create ?? false;
	const {
		data: studio,
		error,
		refetch,
	} = api.libredbStudio.byApplication.useQuery(
		{ applicationId },
		{
			enabled: isCloud === false,
			refetchInterval: (query) => (query.state.data ? 5000 : false),
		},
	);
	const credentials = api.libredbStudio.credentials.useQuery(
		{ libredbStudioId: studio?.libredbStudioId ?? "" },
		{
			enabled: showCredentials && isOwnerOrAdmin && !!studio,
			refetchOnWindowFocus: false,
			staleTime: Number.POSITIVE_INFINITY,
		},
	);
	const { launch, isLaunching } = useLibreDBStudioLaunch();
	const { mutateAsync: sync, isPending: isSyncing } =
		api.libredbStudio.sync.useMutation();
	const { mutateAsync: update, isPending: isUpdating } =
		api.libredbStudio.update.useMutation();

	if (isCloud !== false) {
		return null;
	}
	if (error) {
		return (
			<AlertBlock type="error">
				LibreDB Studio status could not be loaded: {error.message}
			</AlertBlock>
		);
	}
	if (!studio) {
		return null;
	}

	const openBlocker = getStudioOpenBlocker(studio);
	const recommendedTag = getStudioImageTag(studio.recommendedImage);
	const coversLibsql = studio.covered.some(
		(database) => database.kind === "libsql",
	);

	const runUpdate = async (
		input: {
			allowCustomConnections?: boolean;
			applyCookieSetting?: boolean;
			updateImage?: boolean;
		},
		successMessage: string,
	) => {
		await update({ libredbStudioId: studio.libredbStudioId, ...input })
			.then(() => {
				toast.success(successMessage);
			})
			.catch((updateError: Error) => {
				toast.error(updateError.message);
			});
		await refetch();
	};

	const runSync = async () => {
		await sync({ libredbStudioId: studio.libredbStudioId })
			.then((result) => {
				toast.success(getSyncResultMessage(result));
			})
			.catch((syncError: Error) => {
				toast.error(`Sync failed: ${syncError.message}`);
			});
		await refetch();
	};

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
				<div className="flex flex-col gap-1">
					<CardTitle className="text-xl flex flex-row items-center gap-2">
						<LibreDBStudioIcon className="size-6" />
						LibreDB Studio
					</CardTitle>
					<CardDescription className="flex flex-col gap-1">
						<span>{STUDIO_ACCESS_WARNING}</span>
						<span>{STUDIO_REVOCATION_WARNING}</span>
					</CardDescription>
				</div>
				<div className="flex flex-row flex-wrap gap-2">
					{openBlocker ? (
						<TooltipProvider delayDuration={0}>
							<Tooltip>
								<TooltipTrigger asChild>
									<span className="inline-flex">
										<Button disabled>
											<ExternalLink className="size-4" />
											Open
										</Button>
									</span>
								</TooltipTrigger>
								<TooltipContent sideOffset={5} className="z-60">
									<p>{openBlocker}</p>
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					) : (
						<Button
							isLoading={isLaunching}
							onClick={() =>
								launch({ libredbStudioId: studio.libredbStudioId })
							}
						>
							<ExternalLink className="size-4" />
							Open
						</Button>
					)}
					{canDeploy && (
						<Button variant="secondary" isLoading={isSyncing} onClick={runSync}>
							<RefreshCcw className="size-4" />
							Sync now
						</Button>
					)}
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				<div className="grid gap-4 md:grid-cols-2">
					<div className="flex flex-col gap-2">
						<Label>Deploy status</Label>
						<div className="flex flex-row items-center gap-2 text-sm">
							<StatusTooltip status={studio.applicationStatus} />
							{getStudioStatusLabel(studio.applicationStatus)}
						</div>
					</div>
					<div className="flex flex-col gap-2">
						<Label>Address</Label>
						{studio.url ? (
							<div className="flex flex-row flex-wrap items-center gap-2">
								<Link
									href={studio.url}
									target="_blank"
									rel="noopener noreferrer"
									className="flex items-center gap-2 text-sm font-medium break-all hover:underline"
								>
									{studio.url}
									<ExternalLink className="size-4 min-w-4" />
								</Link>
								<Badge variant={studio.https ? "outline" : "secondary"}>
									{studio.https ? "HTTPS" : "HTTP"}
								</Badge>
							</div>
						) : (
							<span className="text-sm text-muted-foreground">
								{STUDIO_NO_DOMAIN_REASON}
							</span>
						)}
					</div>
				</div>
				{studio.url && !studio.https && (
					<AlertBlock type="warning">{HTTP_ADDRESS_WARNING}</AlertBlock>
				)}
				{studio.cookieSettingMismatch && (
					<div className="flex flex-col gap-2">
						<AlertBlock type="warning">{COOKIE_SETTING_WARNING}</AlertBlock>
						{isOwnerOrAdmin && (
							<DialogAction
								title="Apply the cookie setting"
								description="This rewrites AUTH_COOKIE_SECURE in the Studio environment for the scheme of its domain and redeploys the Studio."
								type="default"
								onClick={() =>
									runUpdate(
										{ applyCookieSetting: true },
										"Cookie setting applied. The Studio is redeploying.",
									)
								}
							>
								<Button
									variant="secondary"
									size="sm"
									className="w-fit"
									isLoading={isUpdating}
								>
									Apply cookie setting
								</Button>
							</DialogAction>
						)}
					</div>
				)}
				<div className="flex flex-col gap-2">
					<Label>Seed sync</Label>
					{studio.lastSyncedAt ? (
						<DateTooltip date={studio.lastSyncedAt} className="text-sm">
							Last synced
						</DateTooltip>
					) : (
						<span className="text-sm text-muted-foreground">
							Not synced yet
						</span>
					)}
					{studio.lastSyncError && (
						<AlertBlock type="error">
							Last sync failed: {studio.lastSyncError}
						</AlertBlock>
					)}
				</div>
				<div className="flex flex-col gap-2">
					<Label>Databases in this Studio ({studio.covered.length})</Label>
					{studio.covered.length === 0 ? (
						<span className="text-sm text-muted-foreground">
							No database of this environment runs on this server yet.
						</span>
					) : (
						<ul className="flex flex-col gap-2">
							{studio.covered.map((database) => {
								const Icon = DB_ENGINE_ICONS[database.kind];
								return (
									<li
										key={database.id}
										className="flex flex-row items-center gap-2 text-sm"
									>
										<Icon className="size-4" />
										<Link
											href={getDatabaseHref(studio, database)}
											className="hover:underline"
										>
											{database.name}
										</Link>
										{database.applicationStatus === "idle" && (
											<span className="text-muted-foreground">
												not deployed
											</span>
										)}
									</li>
								);
							})}
						</ul>
					)}
					{coversLibsql && (
						<span className="text-sm text-muted-foreground">
							Studio reaches only the default namespace of a libSQL database,
							and writes through a libSQL replica were not tested.
						</span>
					)}
				</div>
				{studio.excluded.length > 0 && (
					<div className="flex flex-col gap-2">
						<Label>
							Databases this Studio cannot reach ({studio.excluded.length})
						</Label>
						<ul className="flex flex-col gap-3">
							{studio.excluded.map((database) => {
								const Icon = DB_ENGINE_ICONS[database.kind];
								return (
									<li key={database.id} className="flex flex-col gap-1 text-sm">
										<span className="flex flex-row items-center gap-2">
											<Icon className="size-4" />
											<Link
												href={getDatabaseHref(studio, database)}
												className="hover:underline"
											>
												{database.name}
											</Link>
										</span>
										<span className="text-muted-foreground">
											{database.message}
										</span>
									</li>
								);
							})}
						</ul>
					</div>
				)}
				<div className="flex flex-col gap-2">
					<Label>Image</Label>
					<div className="flex flex-row flex-wrap items-center gap-2">
						<Badge variant="secondary">{studio.image ?? "No image set"}</Badge>
						{studio.updateAvailable &&
							(isOwnerOrAdmin ? (
								<DialogAction
									title={`Update LibreDB Studio to ${recommendedTag}`}
									description={`This sets the image to ${studio.recommendedImage} and redeploys the Studio.`}
									type="default"
									onClick={() =>
										runUpdate(
											{ updateImage: true },
											`LibreDB Studio is updating to ${recommendedTag}.`,
										)
									}
								>
									<Button variant="secondary" size="sm" isLoading={isUpdating}>
										Update to {recommendedTag}
									</Button>
								</DialogAction>
							) : (
								<span className="text-sm text-muted-foreground">
									Version {recommendedTag} is available.
								</span>
							))}
					</div>
					{studio.belowMinimumVersion && (
						<AlertBlock type="warning">
							This Studio image is older than the minimum version the
							integration supports, so some features need a newer Studio.
						</AlertBlock>
					)}
				</div>
				<div className="flex flex-row items-start justify-between gap-4 rounded-lg border p-3">
					<div className="flex flex-col gap-1">
						<Label htmlFor={`${id}-custom-connections`}>
							Allow custom connections
						</Label>
						<span className="text-sm text-muted-foreground">
							{CUSTOM_CONNECTIONS_WARNING}
						</span>
					</div>
					<DialogAction
						title={
							studio.allowCustomConnections
								? "Disable custom connections"
								: "Allow custom connections"
						}
						description={
							studio.allowCustomConnections
								? "This disables custom connections and redeploys the Studio."
								: `${CUSTOM_CONNECTIONS_WARNING} This allows them and redeploys the Studio.`
						}
						type="default"
						onClick={() =>
							runUpdate(
								{ allowCustomConnections: !studio.allowCustomConnections },
								studio.allowCustomConnections
									? "Custom connections disabled. The Studio is redeploying."
									: "Custom connections allowed. The Studio is redeploying.",
							)
						}
					>
						<Switch
							id={`${id}-custom-connections`}
							checked={studio.allowCustomConnections}
							disabled={!isOwnerOrAdmin || isUpdating}
						/>
					</DialogAction>
				</div>
				{isOwnerOrAdmin && (
					<div className="flex flex-col gap-2">
						<Label>Initial admin credentials</Label>
						<span className="text-sm text-muted-foreground">
							For recovery: these sign in to Studio with a password. Open signs
							you in with your own account.
						</span>
						{!showCredentials ? (
							<Button
								variant="outline"
								size="sm"
								className="w-fit"
								onClick={() => setShowCredentials(true)}
							>
								Show initial admin credentials
							</Button>
						) : credentials.error ? (
							<AlertBlock type="error">{credentials.error.message}</AlertBlock>
						) : credentials.data ? (
							<div className="grid gap-4 md:grid-cols-2">
								<div className="flex flex-col gap-2">
									<span className="text-sm text-muted-foreground">
										Admin email
									</span>
									<Input
										enableCopyButton
										disabled
										value={credentials.data.email}
									/>
								</div>
								<div className="flex flex-col gap-2">
									<span className="text-sm text-muted-foreground">
										Initial admin password
									</span>
									<ToggleVisibilityInput
										disabled
										value={credentials.data.password}
									/>
								</div>
							</div>
						) : (
							<Loader2 className="size-4 animate-spin text-muted-foreground" />
						)}
						<span className="text-sm text-muted-foreground">
							Studio applies a changed ADMIN_PASSWORD only when
							ADMIN_PASSWORD_RESET=true is set for one deploy.
						</span>
					</div>
				)}
				<span className="text-sm text-muted-foreground">
					Studio caps its V8 heap at 384 MB, so give it at least 512 MB if you
					set a memory limit.
				</span>
			</CardContent>
		</Card>
	);
};
