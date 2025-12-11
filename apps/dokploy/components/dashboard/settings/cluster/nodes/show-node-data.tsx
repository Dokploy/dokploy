import { CodeEditor } from "@/components/shared/code-editor";
import { useTranslation } from "next-i18next";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

interface Props {
	data: unknown;
}

export const ShowNodeData = ({ data }: Props) => {
	const { t } = useTranslation("settings");
	return (
		<Dialog>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer"
					onSelect={(e) => e.preventDefault()}
				>
					{t("settings.cluster.nodes.config.menu")}
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className={"sm:max-w-5xl"}>
				<DialogHeader>
					<DialogTitle>
						{t("settings.cluster.nodes.config.title")}
					</DialogTitle>
					<DialogDescription>
						{t("settings.cluster.nodes.config.description")}
					</DialogDescription>
				</DialogHeader>
				<div className="text-wrap rounded-lg border p-4 text-sm sm:max-w-[59rem] bg-card">
					<code>
						<pre className="whitespace-pre-wrap break-words">
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
			</DialogContent>
		</Dialog>
	);
};
