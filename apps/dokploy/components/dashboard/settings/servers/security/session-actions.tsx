import { useTranslation } from "react-i18next";
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
	const { t } = useTranslation();
	const disconnect = api.serverSecurity.disconnectSession.useMutation();
	const canBan = !!from && ipSchema.safeParse(from).success && !isPanelSession;

	const run = async (banIp?: string) => {
		try {
			await disconnect.mutateAsync({ serverId, terminal, banIp });
			toast.success(
				banIp
					? t("settings.servers.security.sessions.disconnectedAndBanned", {
							ip: banIp,
						})
					: t("settings.servers.security.sessions.disconnected"),
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
				title={t("settings.servers.security.sessions.disconnectTitle")}
				description={
					isPanelSession
						? t("settings.servers.security.sessions.panelDescription", {
								target,
							})
						: t("settings.servers.security.sessions.description", { target })
				}
				type="default"
				onClick={() => run()}
			>
				<Button
					variant="outline"
					size="sm"
					disabled={!canEdit || disconnect.isPending}
				>
					{t("settings.servers.security.sessions.disconnect")}
				</Button>
			</DialogAction>
			<DialogAction
				title={t("settings.servers.security.sessions.disconnectAndBanTitle")}
				description={t("settings.servers.security.sessions.banDescription", {
					target,
					ip: from,
				})}
				onClick={() => run(from ?? undefined)}
			>
				<Button
					variant="destructive"
					size="sm"
					disabled={!canEdit || !canBan || disconnect.isPending}
				>
					{t("settings.servers.security.sessions.disconnectAndBan")}
				</Button>
			</DialogAction>
		</div>
	);
};
