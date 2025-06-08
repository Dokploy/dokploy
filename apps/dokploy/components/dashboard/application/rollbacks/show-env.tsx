import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import { CodeEditor } from "@/components/shared/code-editor";

interface Props {
	env: string | null;
}

export const ShowEnv = ({ env }: Props) => {
	if (!env) return null;

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="ghost" size="sm" className="text-xs">
					<Eye className="size-3.5 mr-1" />
					View Env
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Environment Variables</DialogTitle>
					<DialogDescription>
						Environment variables for this rollback version
					</DialogDescription>
				</DialogHeader>

				<div className="mt-4">
					<CodeEditor
						language="shell"
						value={env}
						className="h-[12rem] font-mono"
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
};
