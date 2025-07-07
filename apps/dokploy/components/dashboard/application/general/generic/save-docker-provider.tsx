import { Button } from "@/components/ui/button";
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
import { useTranslation } from "next-i18next";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

interface Props {
	applicationId: string;
}

export const SaveDockerProvider = ({ applicationId }: Props) => {
	const { t } = useTranslation("dashboard");
	const { data, refetch } = api.application.one.useQuery({ applicationId });

	const { mutateAsync } = api.application.saveDockerProvider.useMutation();

	const DockerProviderSchema = z.object({
		dockerImage: z.string().min(1, {
			message: t("dashboard.dockerProvider.dockerImageRequired"),
		}),
		username: z.string().optional(),
		password: z.string().optional(),
		registryURL: z.string().optional(),
	});

	type DockerProvider = z.infer<typeof DockerProviderSchema>;

	const form = useForm<DockerProvider>({
		defaultValues: {
			dockerImage: "",
			password: "",
			username: "",
			registryURL: "",
		},
		resolver: zodResolver(DockerProviderSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				dockerImage: data.dockerImage || "",
				password: data.password || "",
				username: data.username || "",
				registryURL: data.registryUrl || "",
			});
		}
	}, [form.reset, data?.applicationId, form]);

	const onSubmit = async (values: DockerProvider) => {
		await mutateAsync({
			dockerImage: values.dockerImage,
			password: values.password || null,
			applicationId,
			username: values.username || null,
			registryUrl: values.registryURL || null,
		})
			.then(async () => {
				toast.success(t("dashboard.dockerProvider.dockerProviderSaved"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("dashboard.dockerProvider.errorSavingDockerProvider"));
			});
	};

	return (
		<Form {...form}>
			<form
				onSubmit={form.handleSubmit(onSubmit)}
				className="flex flex-col gap-4"
			>
				<div className="grid md:grid-cols-2 gap-4 ">
					<div className="space-y-4">
						<FormField
							control={form.control}
							name="dockerImage"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										{t("dashboard.dockerProvider.dockerImage")}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={t(
												"dashboard.dockerProvider.dockerImagePlaceholder",
											)}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>
					<FormField
						control={form.control}
						name="registryURL"
						render={({ field }) => (
							<FormItem>
								<FormLabel>
									{t("dashboard.dockerProvider.registryUrl")}
								</FormLabel>
								<FormControl>
									<Input
										placeholder={t(
											"dashboard.dockerProvider.registryUrlPlaceholder",
										)}
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<div className="space-y-4">
						<FormField
							control={form.control}
							name="username"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										{t("dashboard.dockerProvider.username")}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={t(
												"dashboard.dockerProvider.usernamePlaceholder",
											)}
											autoComplete="username"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>
					<div className="space-y-4">
						<FormField
							control={form.control}
							name="password"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										{t("dashboard.dockerProvider.password")}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={t(
												"dashboard.dockerProvider.passwordPlaceholder",
											)}
											autoComplete="one-time-code"
											{...field}
											type="password"
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>
				</div>

				<div className="flex flex-row justify-end">
					<Button
						type="submit"
						className="w-fit"
						isLoading={form.formState.isSubmitting}
					>
						{t("dashboard.dockerProvider.save")}
					</Button>
				</div>
			</form>
		</Form>
	);
};
