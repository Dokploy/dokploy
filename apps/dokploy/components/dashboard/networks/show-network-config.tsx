"use client";

import { Eye, Loader2 } from "lucide-react";
import { useState } from "react";
import { AlertBlock } from "@/components/shared/alert-block";
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

interface Props {
	networkId: string;
	networkName: string;
}

export const ShowNetworkConfig = ({ networkId, networkName }: Props) => {
	const [open, setOpen] = useState(false);
	const { data, isLoading, error } = api.network.inspect.useQuery(
		{ networkId },
		{ enabled: open },
	);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost" size="icon-sm" aria-label="View network config">
					<Eye className="size-4" />
				</Button>
			</DialogTrigger>
			<DialogContent className="w-full md:w-[70vw] min-w-[70vw]">
				<DialogHeader>
					<DialogTitle>Network Config</DialogTitle>
					<DialogDescription>
						docker network inspect output for "{networkName}"
					</DialogDescription>
				</DialogHeader>
				{error ? (
					<AlertBlock type="error">{error.message}</AlertBlock>
				) : isLoading ? (
					<div className="flex flex-row gap-2 items-center justify-center py-10 text-sm text-muted-foreground">
						<span>Loading...</span>
						<Loader2 className="animate-spin size-4" />
					</div>
				) : (
					<div className="text-wrap rounded-lg border p-4 overflow-y-auto text-sm bg-card max-h-[80vh]">
						<code>
							<pre className="whitespace-pre-wrap wrap-break-word">
								<CodeEditor
									language="json"
									lineWrapping
									lineNumbers={false}
									readOnly
									value={JSON.stringify(data, null, 2)}
								/>
							</pre>
						</code>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
};
