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
import { Puzzle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface Props {
	composeId: string;
}

export const ShowConvertedCompose = ({ composeId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const {
		data: compose,
		error,
		isError,
		refetch,
	} = api.compose.getConvertedCompose.useQuery(
		{ composeId },
		{
			retry: false,
		},
	);

	const { mutateAsync, isLoading } = api.compose.fetchSourceType.useMutation();

	useEffect(() => {
		if (isOpen) {
			mutateAsync({ composeId })
				.then(() => {
					refetch();
				})
				.catch((err) => {});
		}
	}, [isOpen]);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button className="max-lg:w-full" variant="outline">
					<Puzzle className="h-4 w-4" />
					Preview Compose
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-6xl max-h-[50rem] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Converted Compose</DialogTitle>
					<DialogDescription>
						Preview your docker-compose file with added domains. Note: At least
						one domain must be specified for this conversion to take effect.
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<div className="flex flex-row gap-2 justify-end">
					<Button
						variant="secondary"
						isLoading={isLoading}
						onClick={() => {
							mutateAsync({ composeId })
								.then(() => {
									refetch();
									toast.success("Fetched source type");
								})
								.catch((err) => {
									toast.error("Error fetching source type", {
										description: err.message,
									});
								});
						}}
					>
						Refresh <RefreshCw className="ml-2 h-4 w-4" />
					</Button>
				</div>

				<pre>
					<CodeEditor
						value={compose || ""}
						language="yaml"
						readOnly
						height="50rem"
					/>
				</pre>
			</DialogContent>
		</Dialog>
	);
};
