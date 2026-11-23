import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useHealthCheckAfterMutation } from "@/hooks/use-health-check-after-mutation";
import { api } from "@/utils/api";

export const showCertificateConflictsHint = (hosts?: string[]) => {
	if (!hosts?.length) return;
	toast.warning(
		`An old Let's Encrypt certificate is still served for ${hosts.join(", ")}`,
		{
			description:
				"Use Fix Certificate Conflicts in this server's Traefik actions to remove it.",
			duration: 10000,
		},
	);
};

const ConflictList = ({ serverId }: { serverId?: string }) => {
	const { data, isPending } = api.settings.certificateConflicts.useQuery({
		serverId,
	});
	if (isPending) return <span>Checking for conflicts...</span>;
	if (!data?.length) {
		return <span>No certificate conflicts found on this server.</span>;
	}
	return (
		<span className="block space-y-2">
			<span className="block">
				These hosts still get an old Let's Encrypt certificate instead of the
				one you chose. It will be removed:
			</span>
			<span className="block font-mono text-sm">
				{data.map((host) => (
					<span key={host} className="block">
						{host}
					</span>
				))}
			</span>
		</span>
	);
};

export const FixCertificateConflicts = ({
	serverId,
}: {
	serverId?: string;
}) => {
	const { mutateAsync, isPending } =
		api.settings.fixCertificateConflicts.useMutation();
	const { execute, isExecuting } = useHealthCheckAfterMutation({
		initialDelay: 5000,
		pollInterval: 4000,
		successMessage: "Certificate conflicts fixed",
	});

	return (
		<DialogAction
			title="Fix Certificate Conflicts"
			description={
				<span className="block space-y-4">
					<AlertBlock type="warning">
						Traefik will restart. Sites on this server will be down until it is
						back up.
					</AlertBlock>
					<ConflictList serverId={serverId} />
				</span>
			}
			type="default"
			disabled={isPending || isExecuting}
			onClick={async () => {
				try {
					const removed = await mutateAsync({ serverId });
					if (removed.length === 0) {
						toast.info("No certificate conflicts found");
						return;
					}
					await execute(async () => removed);
				} catch (error) {
					toast.error(
						(error as Error)?.message || "Failed to fix certificate conflicts",
					);
				}
			}}
		>
			<DropdownMenuItem
				onSelect={(e) => e.preventDefault()}
				className="cursor-pointer"
			>
				<span>Fix Certificate Conflicts</span>
			</DropdownMenuItem>
		</DialogAction>
	);
};
