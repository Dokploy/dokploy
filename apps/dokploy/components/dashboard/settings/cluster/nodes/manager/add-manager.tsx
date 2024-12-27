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

export const AddManager = () => {
	const { data } = api.cluster.addManager.useQuery();

	return (
		<>
			<div>
				<CardContent className="flex max-h-screen flex-col gap-4 overflow-y-auto px-0 sm:max-w-4xl">
					<DialogHeader>
						<DialogTitle>Add a new manager</DialogTitle>
						<DialogDescription>Add a new manager</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-2.5 text-sm">
						<span>1. Go to your new server and run the following command</span>
						<span className="flex justify-between rounded-lg bg-muted p-2">
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
							2. Run the following command to add the node(manager) to your
							cluster
						</span>
						<span className="flex rounded-lg bg-muted p-2">
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
		</>
	);
};
