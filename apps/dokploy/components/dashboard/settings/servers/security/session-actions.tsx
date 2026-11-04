import { toast } from "sonner";
import { z } from "zod";
import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";

const ipSchema = z.union([z.ipv4(), z.ipv6()]);

interface Props {
	serverId: string;
	terminal: string;
	user: string;
	from: string | null;
	isPanelSession: boolean;
	canEdit: boolean;
	onDisconnected: () => Promise<unknown>;
}

export const SessionActions = ({
	serverId,
	terminal,
	user,
	from,
	isPanelSession,
	canEdit,
	onDisconnected,
}: Props) => {
	const disconnect = api.serverSecurity.disconnectSession.useMutation();
	const canBan = !!from && ipSchema.safeParse(from).success && !isPanelSession;

	const run = async (banIp?: string) => {
		try {
			await disconnect.mutateAsync({ serverId, terminal, banIp });
			toast.success(
				banIp
					? `Session disconnected and ${banIp} banned`
					: "Session disconnected",
			);
			await onDisconnected();
		} catch (err) {
			toast.error((err as Error).message);
		}
	};

	const target = `${user} on ${terminal}${from ? ` (${from})` : ""}`;

	return (
		<div className="flex justify-end gap-2">
			<DialogAction
				title="Disconnect session"
				description={
					isPanelSession
						? `This session comes from the Dokploy panel, probably a teammate using the Dokploy terminal. Disconnect ${target}?`
						: `${target} will be disconnected immediately. They can log in again unless you also ban their IP.`
				}
				type="default"
				onClick={() => run()}
			>
				<Button
					variant="outline"
					size="sm"
					disabled={!canEdit || disconnect.isPending}
				>
					Disconnect
				</Button>
			</DialogAction>
			<DialogAction
				title="Disconnect and ban IP"
				description={`${target} will be disconnected and ${from} banned on every port until you unban it from the Fail2ban tab.`}
				onClick={() => run(from ?? undefined)}
			>
				<Button
					variant="destructive"
					size="sm"
					disabled={!canEdit || !canBan || disconnect.isPending}
				>
					Disconnect & ban
				</Button>
			</DialogAction>
		</div>
	);
};
