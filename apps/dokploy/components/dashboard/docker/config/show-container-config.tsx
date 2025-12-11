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
import { api } from "@/utils/api";

interface Props {
	containerId: string;
	serverId?: string;
}

export const ShowContainerConfig = ({ containerId, serverId }: Props) => {
	const { t } = useTranslation("common");
	const { data } = api.docker.getConfig.useQuery(
		{
			containerId,
			serverId,
		},
		{
			enabled: !!containerId,
		},
	);
	return (
		<Dialog>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer"
					onSelect={(e) => e.preventDefault()}
				>
					{t("docker.config.menu")}
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className={"w-full md:w-[70vw] min-w-[70vw]"}>
				<DialogHeader>
					<DialogTitle>{t("docker.config.title")}</DialogTitle>
					<DialogDescription>
						{t("docker.config.description")}
					</DialogDescription>
				</DialogHeader>
				<div className="text-wrap rounded-lg border p-4 overflow-y-auto text-sm bg-card max-h-[80vh]">
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
