import { BitbucketIcon } from "@/components/icons/data-tools-icons";
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
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { PenBoxIcon } from "lucide-react";
import { type TFunction, useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const Schema = (t: TFunction) =>
	z.object({
		name: z.string().min(1, {
			message: t("settings.gitProviders.bitbucket.update.nameRequired"),
		}),
		username: z.string().min(1, {
			message: t("settings.gitProviders.bitbucket.update.usernameRequired"),
		}),
		workspaceName: z.string().optional(),
	});

type Schema = ReturnType<typeof Schema>["_type"];

interface Props {
	bitbucketId: string;
}

export const EditBitbucketProvider = ({ bitbucketId }: Props) => {
	const { t } = useTranslation("settings");
	const { data: bitbucket } = api.bitbucket.one.useQuery(
		{
			bitbucketId,
		},
		{
			enabled: !!bitbucketId,
		},
	);

	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const { mutateAsync, error, isError } = api.bitbucket.update.useMutation();
	const { mutateAsync: testConnection, isLoading } =
		api.bitbucket.testConnection.useMutation();
	const form = useForm<Schema>({
		defaultValues: {
			username: "",
			workspaceName: "",
		},
		resolver: zodResolver(Schema(t)),
	});

	const username = form.watch("username");
	const workspaceName = form.watch("workspaceName");

	useEffect(() => {
		form.reset({
			username: bitbucket?.bitbucketUsername || "",
			workspaceName: bitbucket?.bitbucketWorkspaceName || "",
			name: bitbucket?.gitProvider.name || "",
		});
	}, [form, isOpen, bitbucket]);

	const onSubmit = async (data: Schema) => {
		await mutateAsync({
			bitbucketId,
			gitProviderId: bitbucket?.gitProviderId || "",
			bitbucketUsername: data.username,
			bitbucketWorkspaceName: data.workspaceName || "",
			name: data.name || "",
		})
			.then(async () => {
				await utils.gitProvider.getAll.invalidate();
				toast.success(t("settings.gitProviders.bitbucket.update.success"));
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(t("settings.gitProviders.bitbucket.update.error"));
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
						{t("settings.gitProviders.bitbucket.update.title")}{" "}
						<BitbucketIcon className="size-5" />
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
											<FormLabel>
												{t("settings.gitProviders.bitbucket.update.name")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.gitProviders.bitbucket.update.namePlaceholder",
													)}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="username"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.gitProviders.bitbucket.update.username")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.gitProviders.bitbucket.update.usernamePlaceholder",
													)}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="workspaceName"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t(
													"settings.gitProviders.bitbucket.update.workspaceName",
												)}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.gitProviders.bitbucket.update.workspaceNamePlaceholder",
													)}
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
										isLoading={isLoading}
										onClick={async () => {
											await testConnection({
												bitbucketId,
												bitbucketUsername: username,
												workspaceName: workspaceName,
											})
												.then(async (message) => {
													toast.info(`Message: ${message}`);
												})
												.catch((error) => {
													toast.error(`Error: ${error.message}`);
												});
										}}
									>
										{t("settings.gitProviders.bitbucket.update.testConnection")}
									</Button>
									<Button type="submit" isLoading={form.formState.isSubmitting}>
										{t("settings.gitProviders.bitbucket.update.update")}
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
