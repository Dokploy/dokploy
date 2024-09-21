import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { api } from "@/utils/api";
import { toast } from "sonner";

interface Props {
	serverId: string;
}
export const ToggleTraefikDashboard = ({ serverId }: Props) => {
	const { mutateAsync: toggleDashboard, isLoading: toggleDashboardIsLoading } =
		api.settings.toggleDashboard.useMutation();
	const { data: haveTraefikDashboardPortEnabled, refetch: refetchDashboard } =
		api.settings.haveTraefikDashboardPortEnabled.useQuery(
			{
				serverId,
			},
			{
				enabled: !!serverId,
			},
		);
	return (
		<>
			<DropdownMenuItem
				onClick={async () => {
					await toggleDashboard({
						enableDashboard: !haveTraefikDashboardPortEnabled,
						serverId: serverId,
					})
						.then(async () => {
							toast.success(
								`${haveTraefikDashboardPortEnabled ? "Disabled" : "Enabled"} Dashboard`,
							);
							refetchDashboard();
						})
						.catch(() => {
							toast.error(
								`${haveTraefikDashboardPortEnabled ? "Disabled" : "Enabled"} Dashboard`,
							);
						});
				}}
				className="w-full cursor-pointer space-x-3"
			>
				<span>
					{haveTraefikDashboardPortEnabled ? "Disable" : "Enable"} Dashboard
				</span>
			</DropdownMenuItem>
		</>
	);
};
