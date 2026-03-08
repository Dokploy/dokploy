import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";

interface Props {
	userId: string;
}

export function ServerPermissionsSection({ userId }: Props) {
	const { data: allServers, isLoading: loadingServers } =
		api.server.all.useQuery();

	const { data: member, isLoading: loadingMember } = api.user.one.useQuery(
		{ userId },
		{ enabled: !!userId },
	);

	const [selected, setSelected] = useState<Set<string>>(new Set());

	useEffect(() => {
		if (member?.accessedServers) {
			setSelected(new Set(member.accessedServers));
		}
	}, [member]);

	const updateMutation = api.user.updateMemberServers.useMutation({
		onSuccess: () => toast.success("Server permissions updated"),
		onError: (e) => toast.error(e.message),
	});

	const toggle = (serverId: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(serverId)) {
				next.delete(serverId);
			} else {
				next.add(serverId);
			}
			return next;
		});
	};

	const handleSave = () => {
		updateMutation.mutate({
			userId,
			accessedServers: Array.from(selected),
		});
	};

	if (loadingServers || loadingMember) {
		return (
			<p className="text-sm text-muted-foreground">Loading servers...</p>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<div>
				<p className="text-base font-medium">Servers</p>
				<p className="text-sm text-muted-foreground">
					Select the Servers that the user can access
				</p>
			</div>

			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-2">
					<Checkbox
						id="server-local"
						checked={selected.has("local")}
						onCheckedChange={() => toggle("local")}
					/>
					<Label
						htmlFor="server-local"
						className="cursor-pointer text-sm font-normal"
					>
						Dokploy
						<span className="ml-2 text-xs text-muted-foreground">(Default)</span>
					</Label>
				</div>
				{allServers?.map((server) => {
					const id = `server-${server.serverId}`;
					const isChecked = selected.has(server.serverId);
					return (
						<div key={server.serverId} className="flex items-center gap-2">
							<Checkbox
								id={id}
								checked={isChecked}
								onCheckedChange={() => toggle(server.serverId)}
							/>
							<Label
								htmlFor={id}
								className="cursor-pointer text-sm font-normal"
							>
								{server.name}
								<span className="ml-2 text-xs text-muted-foreground">
									({server.ipAddress})
								</span>
							</Label>
						</div>
					);
				})}
			</div>

			<Button
				size="sm"
				className="w-fit"
				onClick={handleSave}
				isLoading={updateMutation.isPending}
			>
				Save server permissions
			</Button>
		</div>
	);
}
