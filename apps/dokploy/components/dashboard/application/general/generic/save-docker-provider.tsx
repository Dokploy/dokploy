import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
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

const DockerProviderSchema = z.object({
	dockerImage: z.string().min(1, {
		message: "application.docker.imageRequired",
	}),
	username: z.string().optional(),
	password: z.string().optional(),
	registryURL: z.string().optional(),
});

type DockerProvider = z.infer<typeof DockerProviderSchema>;

interface Props {
	applicationId: string;
}

export const SaveDockerProvider = ({ applicationId }: Props) => {
	const { t } = useTranslation();
	const { data, refetch } = api.application.one.useQuery({ applicationId });

	const { mutateAsync } = api.application.saveDockerProvider.useMutation();
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
				toast.success(t("application.docker.saved"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("application.docker.saveError"));
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
									<FormLabel>{t("application.docker.image")}</FormLabel>
									<FormControl>
										<Input placeholder="node:16" {...field} />
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
								<FormLabel>{t("application.docker.registryUrl")}</FormLabel>
								<FormControl>
									<Input
										placeholder={t("application.docker.registryUrl")}
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
									<FormLabel>{t("application.docker.username")}</FormLabel>
									<FormControl>
										<Input
											placeholder={t("application.docker.username")}
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
									<FormLabel>{t("application.docker.password")}</FormLabel>
									<FormControl>
										<Input
											placeholder={t("application.docker.password")}
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
						{t("application.docker.save")}
					</Button>
				</div>
			</form>
		</Form>
	);
};
