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
import React from "react";
import { ShowContainers } from "../../docker/show/show-containers";
import { columns } from "./columns";
import { DataTable } from "./data-table";
// import { columns } from "./columns";
// import { DataTable } from "./data-table";

interface Props {
	serverId: string;
}

const ShowNodeContainers = ({ serverId }: Props) => {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer"
					onSelect={(e) => e.preventDefault()}
				>
					Show Container
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className={"sm:max-w-5xl overflow-y-auto max-h-screen"}>
				<DialogHeader>
					<DialogTitle>Node Container</DialogTitle>
					<DialogDescription>
						See all containers running on this node
					</DialogDescription>
				</DialogHeader>
				<div className="text-wrap rounded-lg border p-4 text-sm sm:max-w-[59rem] bg-card max-h-[90vh] overflow-auto ">
					<ShowContainers serverId={serverId} />
				</div>
			</DialogContent>
		</Dialog>
	);
};

export default ShowNodeContainers;
