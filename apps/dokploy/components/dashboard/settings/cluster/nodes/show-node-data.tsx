import { CodeEditor } from "@/components/shared/code-editor";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";

interface Props {
	data: unknown;
}

export const ShowNodeData = ({ data }: Props) => {
	const { t } = useTranslation();
	return (
		<Dialog>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer"
					onSelect={(e) => e.preventDefault()}
				>
					{t("settings.cluster.showNodeData.viewConfig")}
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className={"sm:max-w-5xl"}>
				<DialogHeader>
					<DialogTitle>{t("settings.cluster.showNodeData.title")}</DialogTitle>
					<DialogDescription>
						{t("settings.cluster.showNodeData.description")}
					</DialogDescription>
				</DialogHeader>
				<div className="text-wrap rounded-lg border p-4 text-sm sm:max-w-236 bg-card">
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
			</DialogContent>
		</Dialog>
	);
};
