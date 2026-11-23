import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
import { ViewAllDialog } from "@/components/shared/view-all-dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useHealthCheckAfterMutation } from "@/hooks/use-health-check-after-mutation";
import { api } from "@/utils/api";

const INLINE_LIMIT = 3;

const describeHosts = (hosts: string[]) =>
	hosts.length <= INLINE_LIMIT ? hosts.join(", ") : `${hosts.length} hosts`;

export const showCertificateConflictsHint = (hosts?: string[]) => {
	if (!hosts?.length) return;
	toast.warning(
		`An old Let's Encrypt certificate is still served for ${describeHosts(hosts)}`,
		{
			description:
				"Use Fix Certificate Conflicts in this server's Traefik actions to remove it.",
			duration: 10000,
		},
	);
};

// Rendered inside the Traefik menu, so the check only runs while the menu is open
export const FixCertificateConflicts = ({
	serverId,
}: {
	serverId?: string;
}) => {
	const utils = api.useUtils();
	const { data: hosts } = api.settings.certificateConflicts.useQuery({
		serverId,
	});
	const { mutateAsync, isPending } =
		api.settings.fixCertificateConflicts.useMutation();
	const { execute, isExecuting } = useHealthCheckAfterMutation({
		initialDelay: 5000,
		pollInterval: 4000,
		successMessage: "Certificate conflicts fixed",
		onSuccess: () => utils.settings.certificateConflicts.invalidate(),
	});

	if (!hosts?.length) return null;

	return (
		<DialogAction
			title="Fix Certificate Conflicts"
			description={
				<span className="block space-y-4">
					<AlertBlock type="warning">
						Traefik will restart. Sites on this server will be down until it is
						back up.
					</AlertBlock>
					<span className="block">
						An old Let's Encrypt certificate is served instead of the one you
						chose.{" "}
						{hosts.length > INLINE_LIMIT ? (
							<>
								It will be removed for {hosts.length} hosts.{" "}
								<ViewAllDialog
									items={hosts.map((host) => ({ id: host, label: host }))}
									title="Hosts to fix"
									noun={{ one: "host", other: "hosts" }}
								/>
							</>
						) : (
							"It will be removed for:"
						)}
					</span>
					{hosts.length <= INLINE_LIMIT && (
						<span className="block font-mono text-sm">
							{hosts.map((host) => (
								<span key={host} className="block">
									{host}
								</span>
							))}
						</span>
					)}
				</span>
			}
			type="default"
			disabled={isPending || isExecuting}
			onClick={async () => {
				try {
					const removed = await mutateAsync({ serverId });
					if (removed.length === 0) {
						toast.info("No certificate conflicts found");
						await utils.settings.certificateConflicts.invalidate();
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
