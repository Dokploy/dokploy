import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";
import { Settings } from "lucide-react";

interface Props {
	nodeId: string;
	serverId?: string;
}

export const ShowNodeConfig = ({ nodeId, serverId }: Props) => {
	const { data, isLoading } = api.swarm.getNodeInfo.useQuery({
		nodeId,
		serverId,
	});
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm" className="w-full">
					<Settings className="mr-2 h-4 w-4" />
					Config
				</Button>
			</DialogTrigger>
			<DialogContent className={"max-h-screen overflow-y-auto sm:max-w-5xl"}>
				<DialogHeader>
					<DialogTitle>Node Config</DialogTitle>
					<DialogDescription>
						See in detail the metadata of this node
					</DialogDescription>
				</DialogHeader>
				<div className="max-h-[70vh] overflow-auto text-wrap rounded-lg border bg-card p-4 text-sm sm:max-w-[59rem] ">
					<code>
						<pre className="items-center justify-center whitespace-pre-wrap break-words">
							{/* {JSON.stringify(data, null, 2)} */}
							<CodeEditor
								language="json"
								lineWrapping={false}
								lineNumbers={false}
								readOnly
								value={JSON.stringify(data, null, 2)}
							/>
						</pre>
					</code>
				</div>
			</DialogContent>
		</Dialog>
	);
};
