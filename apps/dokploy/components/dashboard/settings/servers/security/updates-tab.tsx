import { AlertBlock } from "@/components/shared/alert-block";
import { Badge } from "@/components/ui/badge";
import { api } from "@/utils/api";
import { ErrorState, LoadingState, SectionHeader } from "./section-header";

interface Props {
	serverId: string;
}

export const UpdatesTab = ({ serverId }: Props) => {
	const { data, isPending, isError, error, refetch, isRefetching } =
		api.serverSecurity.pendingUpdates.useQuery({ serverId }, { retry: false });

	if (isPending) return <LoadingState label="Checking pending updates..." />;
	if (isError)
		return (
			<ErrorState
				message={error.message}
				onRetry={() => refetch()}
				isRetrying={isRefetching}
			/>
		);

	const pending = data.pendingSecurityUpdates ?? [];
	const rebootRequiredBy = data.rebootRequiredBy ?? [];

	return (
		<div className="flex flex-col gap-4">
			<SectionHeader
				title="Updates"
				description="Operating system security patches available for this server."
				onRefresh={() => refetch()}
				isRefreshing={isRefetching}
			/>

			{!data.supported ? (
				<AlertBlock type="info">
					Update checks are only supported on Debian and Ubuntu servers.
				</AlertBlock>
			) : (
				<div className="grid gap-4 md:grid-cols-2">
					<div className="rounded-lg border p-4">
						<div className="flex items-center justify-between">
							<h4 className="text-sm font-semibold">
								Pending security updates
							</h4>
							<Badge variant={pending.length > 0 ? "yellow" : "green"}>
								{pending.length}
							</Badge>
						</div>
						{pending.length > 0 ? (
							<div className="mt-3 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
								{pending.map((pkg) => (
									<Badge key={pkg} variant="blank" className="font-mono">
										{pkg}
									</Badge>
								))}
							</div>
						) : (
							<p className="mt-2 text-sm text-muted-foreground">
								The server is up to date.
							</p>
						)}
					</div>
					<div className="rounded-lg border p-4">
						<div className="flex items-center justify-between">
							<h4 className="text-sm font-semibold">Reboot required</h4>
							<Badge variant={data.rebootRequired ? "orange" : "green"}>
								{data.rebootRequired ? "Yes" : "No"}
							</Badge>
						</div>
						<p className="mt-2 text-sm text-muted-foreground">
							{data.rebootRequired
								? `Updates to ${rebootRequiredBy.join(", ") || "system packages"} take effect after a reboot.`
								: "No reboot is needed."}
						</p>
					</div>
				</div>
			)}
		</div>
	);
};
