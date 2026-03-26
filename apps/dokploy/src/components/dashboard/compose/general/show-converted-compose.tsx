import { Loader2, Puzzle, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
	composeId: string;
}

export const ShowConvertedCompose = ({ composeId }: Props) => {
	const t = useTranslations("composeGeneral");
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

	const { mutateAsync, isPending } = api.compose.fetchSourceType.useMutation();

	useEffect(() => {
		if (isOpen) {
			mutateAsync({ composeId })
				.then(() => {
					refetch();
				})
				.catch(() => {});
		}
	}, [isOpen]);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button className="max-lg:w-full" variant="outline">
					<Puzzle className="h-4 w-4" />
					{t("showConverted.trigger")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-6xl max-h-[50rem]">
				<DialogHeader>
					<DialogTitle>{t("showConverted.dialogTitle")}</DialogTitle>
					<DialogDescription>
						{t("showConverted.dialogDescription")}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<AlertBlock type="info" className="mb-4">
					{t("showConverted.alertInfo")}
				</AlertBlock>
				{isPending ? (
					<div className="flex flex-row items-center justify-center min-h-[25rem] border p-4 rounded-md">
						<Loader2 className="h-8 w-8 text-muted-foreground mb-2 animate-spin" />
					</div>
				) : compose?.length === 5 ? (
					<div className="border p-4 rounded-md flex flex-col items-center justify-center min-h-[25rem]">
						<Puzzle className="h-8 w-8 text-muted-foreground mb-2" />
						<span className="text-muted-foreground">
							No converted compose data available.
						</span>
					</div>
				) : (
					<>
						<div className="flex flex-row gap-2 justify-end my-4">
							<Button
								variant="secondary"
								isLoading={isPending}
								onClick={() => {
									mutateAsync({ composeId })
										.then(() => {
											refetch();
											toast.success(t("showConverted.toastFetchSuccess"));
										})
										.catch((err: Error) => {
											toast.error(t("showConverted.toastFetchError"), {
												description: err.message,
											});
										});
								}}
							>
								{t("showConverted.refresh")}{" "}
								<RefreshCw className="ml-2 h-4 w-4" />
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
					</>
				)}
			</DialogContent>
		</Dialog>
	);
};
