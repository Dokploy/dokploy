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
import { Puzzle } from "lucide-react";
import { useState } from "react";

interface Props {
	composeId: string;
}

export const ShowConvertedCompose = ({ composeId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const {
		data: compose,
		isLoading,
		error,
		isError,
	} = api.compose.getConvertedCompose.useQuery({ composeId });

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button className="max-lg:w-full" variant="outline">
					<Puzzle className="h-4 w-4" />
					View Converted Compose
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-6xl max-h-[50rem] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Converted Compose</DialogTitle>
					<DialogDescription>
						See how the docker compose file will look like after adding the
						domains
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<pre>
					<CodeEditor value={compose} language="yaml" readOnly height="50rem" />
				</pre>
			</DialogContent>
		</Dialog>
	);
};
