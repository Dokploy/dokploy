import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBoxIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { GitlabIcon } from "@/components/icons/data-tools-icons";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
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
import { api } from "@/utils/api";

const Schema = z.object({
	name: z.string().min(1, {
		message: "settings.git.nameRequired",
	}),
	gitlabUrl: z.string().url({
		message: "settings.git.gitlabUrlInvalid",
	}),
	gitlabInternalUrl: z
		.union([z.string().url(), z.literal("")])
		.optional()
		.transform((v) => (v === "" ? undefined : v)),
	groupName: z.string().optional(),
});

type Schema = z.infer<typeof Schema>;

interface Props {
	gitlabId: string;
}

export const EditGitlabProvider = ({ gitlabId }: Props) => {
	const { t } = useTranslation();
	const { data: gitlab, refetch } = api.gitlab.one.useQuery(
		{
			gitlabId,
		},
		{
			enabled: !!gitlabId,
		},
	);
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const { mutateAsync, error, isError } = api.gitlab.update.useMutation();
	const { mutateAsync: testConnection, isPending } =
		api.gitlab.testConnection.useMutation();
	const form = useForm({
		defaultValues: {
			groupName: "",
			name: "",
			gitlabUrl: "https://gitlab.com",
			gitlabInternalUrl: "",
		},
		resolver: zodResolver(Schema),
	});

	const groupName = form.watch("groupName");

	useEffect(() => {
		form.reset({
			groupName: gitlab?.groupName || "",
			name: gitlab?.gitProvider.name || "",
			gitlabUrl: gitlab?.gitlabUrl || "",
			gitlabInternalUrl: gitlab?.gitlabInternalUrl || "",
		});
	}, [form, isOpen]);

	const onSubmit = async (data: Schema) => {
		await mutateAsync({
			gitlabId,
			gitProviderId: gitlab?.gitProviderId || "",
			groupName: data.groupName || "",
			name: data.name || "",
			gitlabUrl: data.gitlabUrl || "",
			gitlabInternalUrl: data.gitlabInternalUrl ?? null,
		})
			.then(async () => {
				await utils.gitProvider.getAll.invalidate();
				toast.success(t("settings.git.gitlabUpdated"));
				setIsOpen(false);
				refetch();
			})
			.catch(() => {
				toast.error(t("settings.git.gitlabUpdateError"));
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="group hover:bg-blue-500/10 "
				>
					<PenBoxIcon className="size-3.5  text-primary group-hover:text-blue-500" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl ">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{t("settings.git.updateGitlab")} <GitlabIcon className="size-5" />
					</DialogTitle>
				</DialogHeader>

				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<Form {...form}>
					<form
						id="hook-form-add-bitbucket"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-1"
					>
						<CardContent className="p-0">
							<div className="flex flex-col gap-4">
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("settings.git.name")}</FormLabel>
											<FormControl>
												<Input
													placeholder={t("settings.git.namePlaceholder")}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="gitlabUrl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("settings.git.gitlabUrlLabel")}</FormLabel>
											<FormControl>
												<Input placeholder="https://gitlab.com" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="gitlabInternalUrl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("settings.git.internalUrl")}</FormLabel>
											<FormControl>
												<Input
													placeholder="http://gitlab:80"
													{...field}
													value={field.value ?? ""}
												/>
											</FormControl>
											<FormDescription>
												{t("settings.git.internalUrlDescription")}
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="groupName"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("settings.git.groupName")}</FormLabel>
											<FormControl>
												<Input
													placeholder={t("settings.git.groupNamePlaceholder")}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<div className="flex w-full justify-between gap-4 mt-4">
									<Button
										type="button"
										variant={"secondary"}
										isLoading={isPending}
										onClick={async () => {
											await testConnection({
												gitlabId,
												groupName: groupName || "",
											})
												.then(async (message) => {
													toast.info(
														t("settings.git.testConnectionMessage", {
															message,
														}),
													);
												})
												.catch((error) => {
													toast.error(
														t("settings.git.testConnectionError", {
															message: error.message,
														}),
													);
												});
										}}
									>
										{t("settings.git.testConnection")}
									</Button>
									<Button type="submit" isLoading={form.formState.isSubmitting}>
										{t("settings.git.update")}
									</Button>
								</div>
							</div>
						</CardContent>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
