import { Button } from "@/components/ui/button";
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

export const AddWorker = () => {
	const { data } = api.cluster.addWorker.useQuery();

	return (
		<Dialog>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="cursor-pointer flex flex-row gap-2 items-center"
					onSelect={(e) => e.preventDefault()}
				>
					Add Worker
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-4xl max-h-screen overflow-y-auto ">
				<DialogHeader>
					<DialogTitle>Add a new worker</DialogTitle>
					<DialogDescription>Add a new worker</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4 text-sm">
					<span>1. Go to your new server and run the following command</span>
					<span className="bg-muted rounded-lg p-2">
						curl https://get.docker.com | sh -s -- --version 24.0
					</span>
				</div>

				<div className="flex flex-col gap-4 text-sm">
					<span>
						2. Run the following command to add the node(server) to your cluster
					</span>
					<span className="bg-muted rounded-lg p-2 ">{data}</span>
				</div>
			</DialogContent>
		</Dialog>
	);
};
