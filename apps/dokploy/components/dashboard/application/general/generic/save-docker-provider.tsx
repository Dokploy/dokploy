import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "next-i18next";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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

const createDockerProviderSchema = (t: (key: string) => string) =>
	z.object({
		dockerImage: z.string().min(1, {
			message: t("application.git.docker.validation.dockerImageRequired"),
		}),
		username: z.string().optional(),
		password: z.string().optional(),
		registryURL: z.string().optional(),
	});

type DockerProvider = z.infer<ReturnType<typeof createDockerProviderSchema>>;

interface Props {
	applicationId: string;
}

export const SaveDockerProvider = ({ applicationId }: Props) => {
	const { t } = useTranslation("common");
	const { data, refetch } = api.application.one.useQuery({ applicationId });

	const { mutateAsync } = api.application.saveDockerProvider.useMutation();
	const schema = createDockerProviderSchema(t);
	const form = useForm<DockerProvider>({
		defaultValues: {
			dockerImage: "",
			password: "",
			username: "",
			registryURL: "",
		},
		resolver: zodResolver(schema),
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
				toast.success(t("application.git.docker.toast.saveSuccess"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("application.git.docker.toast.saveError"));
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
										{t("application.git.docker.form.dockerImageLabel")}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={t(
												"application.git.docker.form.dockerImagePlaceholder",
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
									{t("application.git.docker.form.registryUrlLabel")}
								</FormLabel>
								<FormControl>
									<Input
										placeholder={t(
											"application.git.docker.form.registryUrlPlaceholder",
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
										{t("application.git.docker.form.usernameLabel")}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={t(
												"application.git.docker.form.usernamePlaceholder",
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
										{t("application.git.docker.form.passwordLabel")}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={t(
												"application.git.docker.form.passwordPlaceholder",
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
						{t("button.save")}
					</Button>
				</div>
			</form>
		</Form>
	);
};
