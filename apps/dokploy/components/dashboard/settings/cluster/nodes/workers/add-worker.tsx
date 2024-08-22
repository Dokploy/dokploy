import { CardContent } from "@/components/ui/card";
import {
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";
import copy from "copy-to-clipboard";
import { CopyIcon } from "lucide-react";
import { toast } from "sonner";

export const AddWorker = () => {
	const { data } = api.cluster.addWorker.useQuery();

	return (
		<div>
			<CardContent className="sm:max-w-4xl max-h-screen overflow-y-auto flex flex-col gap-4 px-0">
				<DialogHeader>
					<DialogTitle>Add a new worker</DialogTitle>
					<DialogDescription>Add a new worker</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-2.5 text-sm">
					<span>1. Go to your new server and run the following command</span>
					<span className="bg-muted rounded-lg p-2 flex justify-between">
						curl https://get.docker.com | sh -s -- --version {data?.version}
						<button
							type="button"
							className="self-center"
							onClick={() => {
								copy(
									`curl https://get.docker.com | sh -s -- --version ${data?.version}`,
								);
								toast.success("Copied to clipboard");
							}}
						>
							<CopyIcon className="h-4 w-4 cursor-pointer" />
						</button>
					</span>
				</div>

				<div className="flex flex-col gap-2.5 text-sm">
					<span>
						2. Run the following command to add the node(worker) to your cluster
					</span>

					<span className="bg-muted rounded-lg p-2  flex">
						{data?.command}
						<button
							type="button"
							className="self-start"
							onClick={() => {
								copy(data?.command || "");
								toast.success("Copied to clipboard");
							}}
						>
							<CopyIcon className="h-4 w-4 cursor-pointer" />
						</button>
					</span>
				</div>
			</CardContent>
		</div>
	);
};
