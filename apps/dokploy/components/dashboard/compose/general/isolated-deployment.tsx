import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import {
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

interface Props {
	composeId: string;
}

const schema = z.object({
	isolatedDeployment: z.boolean().optional(),
});

type Schema = z.infer<typeof schema>;

export const IsolatedDeployment = ({ composeId }: Props) => {
	const { t } = useTranslation("dashboard");
	const utils = api.useUtils();
	const [compose, setCompose] = useState<string>("");
	const { mutateAsync, error, isError } =
		api.compose.isolatedDeployment.useMutation();

	const { mutateAsync: updateCompose } = api.compose.update.useMutation();

	const { data, refetch } = api.compose.one.useQuery(
		{ composeId },
		{ enabled: !!composeId },
	);

	console.log(data);

	const form = useForm<Schema>({
		defaultValues: {
			isolatedDeployment: false,
		},
		resolver: zodResolver(schema),
	});

	useEffect(() => {
		randomizeCompose();
		if (data) {
			form.reset({
				isolatedDeployment: data?.isolatedDeployment || false,
			});
		}
	}, [form, form.reset, form.formState.isSubmitSuccessful, data]);

	const onSubmit = async (formData: Schema) => {
		await updateCompose({
			composeId,
			isolatedDeployment: formData?.isolatedDeployment || false,
		})
			.then(async (_data) => {
				await randomizeCompose();
				await refetch();
				toast.success(t("dashboard.compose.composeUpdated"));
			})
			.catch(() => {
				toast.error(t("dashboard.compose.errorUpdatingCompose"));
			});
	};

	const randomizeCompose = async () => {
		await mutateAsync({
			composeId,
			suffix: data?.appName || "",
		}).then(async (data) => {
			await utils.project.all.invalidate();
			setCompose(data);
		});
	};

	return (
		<>
			<DialogHeader>
				<DialogTitle>{t("dashboard.compose.isolatedDeployment")}</DialogTitle>
				<DialogDescription>
					{t("dashboard.compose.isolatedDeploymentDescription")}
				</DialogDescription>
			</DialogHeader>
			<div className="text-sm text-muted-foreground flex flex-col gap-2">
				<span>{t("dashboard.compose.isolatedDeploymentExplanation")}</span>
				<div className="space-y-4">
					<div>
						<h4 className="font-medium mb-2">
							{t("dashboard.compose.resourcesThatWillBeIsolated")}
						</h4>
						<ul className="list-disc list-inside">
							<li>{t("dashboard.compose.dockerVolumes")}</li>
							<li>{t("dashboard.compose.dockerNetworks")}</li>
						</ul>
					</div>
				</div>
			</div>
			{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					id="hook-form-add-project"
					className="grid w-full gap-4"
				>
					{isError && (
						<div className="flex flex-row gap-4 rounded-lg items-center bg-red-50 p-2 dark:bg-red-950">
							<AlertTriangle className="text-red-600 dark:text-red-400" />
							<span className="text-sm text-red-600 dark:text-red-400">
								{error?.message}
							</span>
						</div>
					)}

					<div className="flex flex-col lg:flex-col  gap-4 w-full ">
						<div>
							<FormField
								control={form.control}
								name="isolatedDeployment"
								render={({ field }) => (
									<FormItem className="mt-4 flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
										<div className="space-y-0.5">
											<FormLabel>
												{t("dashboard.compose.enableIsolatedDeployment", {
													appName: data?.appName,
												})}
											</FormLabel>
											<FormDescription>
												{t(
													"dashboard.compose.enableIsolatedDeploymentDescription",
												)}
											</FormDescription>
										</div>
										<FormControl>
											<Switch
												checked={field.value}
												onCheckedChange={field.onChange}
											/>
										</FormControl>
									</FormItem>
								)}
							/>
						</div>

						<div className="flex flex-col lg:flex-row  gap-4 w-full items-end justify-end">
							<Button
								form="hook-form-add-project"
								type="submit"
								className="lg:w-fit"
							>
								{t("dashboard.compose.save")}
							</Button>
						</div>
					</div>
					<div className="flex flex-col gap-4">
						<Label>{t("dashboard.compose.preview")}</Label>
						<pre>
							<CodeEditor
								value={compose || ""}
								language="yaml"
								readOnly
								height="50rem"
							/>
						</pre>
					</div>
				</form>
			</Form>
		</>
	);
};
