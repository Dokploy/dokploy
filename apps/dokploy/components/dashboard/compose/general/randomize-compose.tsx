import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";

interface Props {
	composeId: string;
}

const schema = z.object({
	suffix: z.string(),
	randomize: z.boolean().optional(),
});

type Schema = z.infer<typeof schema>;

export const RandomizeCompose = ({ composeId }: Props) => {
	const { t } = useTranslation("common");
	const utils = api.useUtils();
	const [compose, setCompose] = useState<string>("");
	const [_isOpen, _setIsOpen] = useState(false);
	const { mutateAsync, error, isError } =
		api.compose.randomizeCompose.useMutation();

	const { mutateAsync: updateCompose } = api.compose.update.useMutation();

	const { data, refetch } = api.compose.one.useQuery(
		{ composeId },
		{ enabled: !!composeId },
	);

	const form = useForm<Schema>({
		defaultValues: {
			suffix: "",
			randomize: false,
		},
		resolver: zodResolver(schema),
	});

	const suffix = form.watch("suffix");

	useEffect(() => {
		randomizeCompose();
		if (data) {
			form.reset({
				suffix: data?.suffix || "",
				randomize: data?.randomize || false,
			});
		}
	}, [form, form.reset, form.formState.isSubmitSuccessful, data]);

	const onSubmit = async (formData: Schema) => {
		await updateCompose({
			composeId,
			suffix: formData?.suffix || "",
			randomize: formData?.randomize || false,
		})
			.then(async (_data) => {
				await randomizeCompose();
				await refetch();
				toast.success(t("compose.randomize.update.success"));
			})
			.catch(() => {
				toast.error(t("compose.randomize.update.error"));
			});
	};

	const randomizeCompose = async () => {
		await mutateAsync({
			composeId,
			suffix,
		}).then(async (data) => {
			await utils.project.all.invalidate();
			setCompose(data);
		});
	};

	return (
		<div className="w-full">
			<DialogHeader>
				<DialogTitle>{t("compose.randomize.dialogTitle")}</DialogTitle>
				<DialogDescription>
					{t("compose.randomize.dialogDescription")}
				</DialogDescription>
			</DialogHeader>
			<div className="text-sm text-muted-foreground flex flex-col gap-2">
				<span>
					{t("compose.randomize.description")}
				</span>
				<ul className="list-disc list-inside">
					<li>{t("compose.randomize.volumes")}</li>
					<li>{t("compose.randomize.networks")}</li>
					<li>{t("compose.randomize.services")}</li>
					<li>{t("compose.randomize.configs")}</li>
					<li>{t("compose.randomize.secrets")}</li>
				</ul>
				<AlertBlock type="info">
					{t("compose.randomize.envInfo")}
				</AlertBlock>
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
								name="suffix"
								render={({ field }) => (
									<FormItem className="flex flex-col justify-center max-sm:items-center w-full mt-4">
										<FormLabel>{t("compose.randomize.suffixLabel")}</FormLabel>
										<FormControl>
											<Input
												placeholder={t("compose.randomize.suffixPlaceholder")}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="randomize"
								render={({ field }) => (
									<FormItem className="mt-4 flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
										<div className="space-y-0.5">
											<FormLabel>{t("compose.randomize.applyLabel")}</FormLabel>
											<FormDescription>
												{t("compose.randomize.applyDescription")}
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
								{t("button.save")}
							</Button>
							<Button
								type="button"
								variant="secondary"
								onClick={async () => {
									await randomizeCompose();
								}}
								className="lg:w-fit"
							>
								{t("compose.randomize.randomButton")}
							</Button>
						</div>
					</div>
					<pre>
						<CodeEditor
							value={compose || ""}
							language="yaml"
							readOnly
							height="50rem"
						/>
					</pre>
				</form>
			</Form>
		</div>
	);
};
