import { formatDistanceToNow } from "date-fns";
import {
	AlertCircle,
	AlertTriangle,
	CheckCircle2,
	Loader2,
	RefreshCcw,
} from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

interface Props {
	children?: React.ReactNode;
	serverId?: string;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const plural = (count: number) =>
	`${count} certificate${count === 1 ? "" : "s"}`;

const expiryLabel = (expiresAt: string | null) => {
	if (!expiresAt) {
		return "Unknown expiry";
	}
	const date = new Date(expiresAt);
	const distance = formatDistanceToNow(date, { addSuffix: true });
	return date.getTime() < Date.now()
		? `Expired ${distance}`
		: `Expires ${distance}`;
};

export const CleanUnusedCertificates = ({ children, serverId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [isWaiting, setIsWaiting] = useState(false);
	const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
	const idPrefix = useId();
	const utils = api.useUtils();

	const { data, isPending, isFetching, refetch, error, isError } =
		api.settings.getUnusedTraefikCertificates.useQuery(
			{ serverId },
			{
				enabled: isOpen,
				retry: false,
				refetchInterval: (query) =>
					query.state.data?.isRemoving ? 3000 : false,
			},
		);

	const { mutateAsync: removeCertificates, isPending: isRemoving } =
		api.settings.removeUnusedTraefikCertificates.useMutation();

	const certificates = data?.certificates ?? [];
	const chosen = certificates.filter((item) => !unchecked.has(item.id));
	const isInProgress = isRemoving || isWaiting || !!data?.isRemoving;

	const toggle = (key: string, checked: boolean) => {
		setUnchecked((current) => {
			const next = new Set(current);
			if (checked) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	};

	const waitForRemoval = async () => {
		const deadline = Date.now() + 120_000;
		await wait(5000);
		while (Date.now() < deadline) {
			try {
				const result =
					await utils.client.settings.getUnusedTraefikCertificates.query({
						serverId,
					});
				if (!result.isRemoving) {
					return result;
				}
			} catch {
				// Traefik is restarting.
			}
			await wait(3000);
		}
		return null;
	};

	const handleRemove = async () => {
		try {
			const { count } = await removeCertificates({
				serverId,
				certificateIds: chosen.map((item) => item.id),
			});
			setIsWaiting(true);
			const result = await waitForRemoval();
			if (!result) {
				toast.error(
					"Traefik is taking longer than expected to restart. Check View Logs.",
				);
			} else if (result.lastRemoveError) {
				toast.error(
					`Couldn't remove the certificates: ${result.lastRemoveError}`,
				);
			} else {
				const removed = result.lastRemovedCount ?? 0;
				const kept = count - removed;
				if (removed === 0) {
					toast.info(
						"Nothing was removed: the selected domains are in use again.",
					);
				} else if (kept > 0) {
					toast.success(
						`Removed ${plural(removed)}. Kept ${plural(kept)} whose domains are in use again.`,
					);
				} else {
					toast.success(`Removed ${plural(removed)}`);
				}
			}
		} catch (error) {
			toast.error(
				(error as Error)?.message || "Failed to remove the certificates.",
			);
		} finally {
			setIsWaiting(false);
			setUnchecked(new Set());
			refetch();
		}
	};

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => {
				setIsOpen(open);
				if (!open) {
					setUnchecked(new Set());
				}
			}}
		>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Unused SSL Certificates</DialogTitle>
					<DialogDescription>
						Let's Encrypt certificates Traefik still keeps for domains that
						aren't used on this server anymore. Traefik keeps trying to renew
						them, which fails and fills its logs.
					</DialogDescription>
				</DialogHeader>

				{isError && (
					<AlertBlock type="error" icon={<AlertTriangle className="size-4" />}>
						{error?.message}
					</AlertBlock>
				)}

				{isPending && !isError ? (
					<div className="flex items-center justify-center text-muted-foreground py-4">
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						<span>Reading certificates</span>
					</div>
				) : (
					data && (
						<div className="space-y-4">
							{!data.routesComplete && (
								<AlertBlock
									type="warning"
									icon={<AlertCircle className="size-4" />}
								>
									Couldn't read all of Traefik's active routes, so certificates
									for domains set up by hand (in Traefik files or compose
									labels) may be listed too. Uncheck any you still use.
								</AlertBlock>
							)}
							{data.isRemoving && !isWaiting && !isRemoving && (
								<AlertBlock
									type="info"
									icon={<Loader2 className="size-4 animate-spin" />}
								>
									Certificates are being removed. Traefik restarts in a moment.
								</AlertBlock>
							)}
							{data.lastRemoveError && !isInProgress && (
								<AlertBlock
									type="error"
									icon={<AlertTriangle className="size-4" />}
								>
									Last removal failed: {data.lastRemoveError}
								</AlertBlock>
							)}
							{certificates.length === 0 ? (
								<AlertBlock
									type="success"
									icon={<CheckCircle2 className="size-4" />}
								>
									No unused certificates on this server.
								</AlertBlock>
							) : (
								<>
									<div className="max-h-72 overflow-y-auto rounded-lg border">
										{certificates.map((item, index) => {
											const key = item.id;
											const checkboxId = `${idPrefix}-${index}`;
											const expired =
												!!item.expiresAt &&
												new Date(item.expiresAt).getTime() < Date.now();
											return (
												<div
													key={key}
													className="flex items-center gap-3 border-b p-3 last:border-b-0"
												>
													<Checkbox
														id={checkboxId}
														checked={!unchecked.has(key)}
														onCheckedChange={(checked) =>
															toggle(key, checked === true)
														}
														disabled={isInProgress}
													/>
													<label
														htmlFor={checkboxId}
														className="min-w-0 flex-1 cursor-pointer"
													>
														<p className="text-sm font-medium break-all">
															{item.main}
														</p>
														{item.sans.length > 0 && (
															<p className="text-xs text-muted-foreground break-all">
																+ {item.sans.join(", ")}
															</p>
														)}
													</label>
													<span
														className={cn(
															"text-xs whitespace-nowrap",
															expired
																? "text-red-500"
																: "text-muted-foreground",
														)}
													>
														{expiryLabel(item.expiresAt)}
													</span>
												</div>
											);
										})}
									</div>
									<div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-600 dark:bg-blue-950 dark:text-blue-400">
										<ul className="list-disc space-y-1 pl-4">
											<li>
												Traefik restarts, so your apps may be offline for a few
												seconds.
											</li>
											<li>
												A backup is saved first. If anything goes wrong, it is
												restored automatically.
											</li>
											<li>
												Untick any domain you may add back later, so its
												certificate can be reused.
											</li>
										</ul>
									</div>
								</>
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
						variant="destructive"
						className="border-destructive/40"
						onClick={handleRemove}
						isLoading={isInProgress}
						disabled={chosen.length === 0 || isFetching || isInProgress}
					>
						Remove {chosen.length} & restart Traefik
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
