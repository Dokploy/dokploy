import { FilePlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
	folderPath: string;
	onCreate: (filename: string, content: string) => void;
	onOpenChange: (open: boolean) => void;
	alwaysVisible?: boolean;
}

export const CreateFileDialog = ({
	folderPath,
	onCreate,
	onOpenChange,
	alwaysVisible = false,
}: Props) => {
	const { t } = useTranslation();
	const [filename, setFilename] = useState("");
	const [content, setContent] = useState("");

	const handleCreate = () => {
		if (!filename.trim()) return;
		onCreate(filename.trim(), content);
		setFilename("");
		setContent("");
		onOpenChange(false);
	};

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					type="button"
					className={`h-6 w-6 ${alwaysVisible ? "" : "opacity-0 group-hover:opacity-100"}`}
					title={t("application.patches.createFile")}
				>
					<FilePlus className="h-3 w-3" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<form
					onSubmit={(e) => {
						e.preventDefault();
						handleCreate();
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("application.patches.createFile")}</DialogTitle>
						<DialogDescription>
							{folderPath
								? t("application.patches.newFileInFolder", {
										folderPath: `${folderPath}/`,
									})
								: t("application.patches.newFileInRoot")}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="filename">
								{t("application.patches.filename")}
							</Label>
							<Input
								id="filename"
								placeholder="e.g. .env.example"
								value={filename}
								onChange={(e) => setFilename(e.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label>{t("application.patches.content")}</Label>
							<div className="h-[200px] rounded-md border">
								<CodeEditor
									value={content}
									onChange={(v) => setContent(v ?? "")}
									className="h-full"
									wrapperClassName="h-[200px]"
									lineWrapping
								/>
							</div>
						</div>
					</div>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="outline" type="button">
								{t("application.patches.cancel")}
							</Button>
						</DialogClose>
						<DialogClose asChild>
							<Button type="submit" disabled={!filename.trim()}>
								{t("application.patches.create")}
							</Button>
						</DialogClose>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
};
