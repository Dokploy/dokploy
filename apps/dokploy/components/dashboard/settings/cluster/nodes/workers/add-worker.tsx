import copy from "copy-to-clipboard";
import { CopyIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { CardContent } from "@/components/ui/card";
import {
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";

interface Props {
	serverId?: string;
}

export const AddWorker = ({ serverId }: Props) => {
	const { data, isLoading, error, isError } = api.cluster.addWorker.useQuery({
		serverId,
	});

	return (
		<CardContent className="sm:max-w-4xl   flex flex-col gap-4 px-0">
			<DialogHeader>
				<DialogTitle>Add a new worker</DialogTitle>
				<DialogDescription>Add a new worker</DialogDescription>
			</DialogHeader>
			{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
			{isLoading ? (
				<Loader2 className="w-full animate-spin text-muted-foreground" />
			) : (
				<>
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
							2. Run the following command to add the node(worker) to your
							cluster
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
				</>
			)}
		</CardContent>
	);
};
