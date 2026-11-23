import copy from "copy-to-clipboard";
import { CopyIcon, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { CardContent } from "@/components/ui/card";
import {
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";
import { JoinAddressField, withJoinAddress } from "../join-address-field";

interface Props {
	serverId?: string;
}

export const AddManager = ({ serverId }: Props) => {
	const { data, isPending, error, isError } = api.cluster.addManager.useQuery({
		serverId,
	});
	const [address, setAddress] = useState("");
	const command = withJoinAddress(data?.command, address);

	return (
		<>
			<CardContent className="sm:max-w-4xl  flex flex-col gap-4 px-0">
				<DialogHeader>
					<DialogTitle>Add a new manager</DialogTitle>
					<DialogDescription>Add a new manager</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				{isPending ? (
					<Loader2 className="w-full animate-spin text-muted-foreground" />
				) : (
					<>
						<div className="flex flex-col gap-2.5 text-sm">
							<span>
								1. Go to your new server and run the following command
							</span>
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

						<JoinAddressField value={address} onChange={setAddress} />
						<div className="flex flex-col gap-2.5 text-sm">
							<span>
								2. Run the following command to add the node(manager) to your
								cluster
							</span>

							<span className="bg-muted rounded-lg p-2  flex">
								{command}
								<button
									type="button"
									className="self-start"
									onClick={() => {
										copy(command);
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
		</>
	);
};
