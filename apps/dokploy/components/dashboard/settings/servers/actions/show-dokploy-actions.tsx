import { Button } from "@/components/ui/button";
import React from "react";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/utils/api";
import { toast } from "sonner";
import { ShowModalLogs } from "../../web-server/show-modal-logs";

export const ShowDokployActions = () => {
	const { mutateAsync: reloadServer, isLoading } =
		api.settings.reloadServer.useMutation();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={isLoading}>
				<Button isLoading={isLoading} variant="outline">
					Server
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-56" align="start">
				<DropdownMenuLabel>Actions</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						onClick={async () => {
							await reloadServer()
								.then(async () => {
									toast.success("Server Reloaded");
								})
								.catch(() => {
									toast.success("Server Reloaded");
								});
						}}
					>
						<span>Reload</span>
					</DropdownMenuItem>
					<ShowModalLogs appName="dokploy">
						<span>Watch logs</span>
					</ShowModalLogs>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
