import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { api } from "@/utils/api";
import dynamic from "next/dynamic";
import type React from "react";

const Terminal = dynamic(() => import("./terminal").then((e) => e.Terminal), {
	ssr: false,
});

interface Props {
	children?: React.ReactNode;
	serverId: string;
}

export const TerminalModal = ({ children, serverId }: Props) => {
	const { data } = api.server.one.useQuery(
		{
			serverId,
		},
		{ enabled: !!serverId },
	);

	return (
		<Dialog>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer space-x-3"
					onSelect={(e) => e.preventDefault()}
				>
					{children}
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-7xl">
				<DialogHeader className="flex flex-col gap-1">
					<DialogTitle>Terminal ({data?.name})</DialogTitle>
					<DialogDescription>Easy way to access the server</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<Terminal id="terminal" serverId={serverId} />
				</div>
			</DialogContent>
		</Dialog>
	);
};
