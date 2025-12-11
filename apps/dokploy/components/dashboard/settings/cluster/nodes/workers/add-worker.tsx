import copy from "copy-to-clipboard";
import { CopyIcon, Loader2 } from "lucide-react";
import { useTranslation } from "next-i18next";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { CardContent } from "@/components/ui/card";
import {
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";

interface Props {
	serverId?: string;
}

export const AddWorker = ({ serverId }: Props) => {
	const { t } = useTranslation("settings");
	const { data, isLoading, error, isError } = api.cluster.addWorker.useQuery({
		serverId,
	});

	return (
		<CardContent className="sm:max-w-4xl   flex flex-col gap-4 px-0">
			<DialogHeader>
				<DialogTitle>
					{t("settings.cluster.nodes.worker.dialog.title")}
				</DialogTitle>
				<DialogDescription>
					{t("settings.cluster.nodes.worker.dialog.description")}
				</DialogDescription>
			</DialogHeader>
			{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
			{isLoading ? (
				<Loader2 className="w-full animate-spin text-muted-foreground" />
			) : (
				<>
					<div className="flex flex-col gap-2.5 text-sm">
						<span>{t("settings.cluster.nodes.worker.step1")}</span>
						<span className="bg-muted rounded-lg p-2 flex justify-between">
							curl https://get.docker.com | sh -s -- --version {data?.version}
							<button
								type="button"
								className="self-center"
								onClick={() => {
									copy(
										`curl https://get.docker.com | sh -s -- --version ${data?.version}`,
									);
									toast.success(t("settings.cluster.nodes.toast.copied"));
								}}
							>
								<CopyIcon className="h-4 w-4 cursor-pointer" />
							</button>
						</span>
					</div>

					<div className="flex flex-col gap-2.5 text-sm">
						<span>{t("settings.cluster.nodes.worker.step2")}</span>

						<span className="bg-muted rounded-lg p-2  flex">
							{data?.command}
							<button
								type="button"
								className="self-start"
								onClick={() => {
									copy(data?.command || "");
									toast.success(t("settings.cluster.nodes.toast.copied"));
								}}
							>
								<CopyIcon className="h-4 w-4 cursor-pointer" />
							</button>
						</span>
					</div>
				</>
			)}
		</CardContent>
	);
};
