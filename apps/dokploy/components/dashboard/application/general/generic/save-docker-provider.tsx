import { zodResolver } from "@hookform/resolvers/zod";
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

const DockerProviderSchema = z.object({
	dockerImage: z.string().min(1, {
		message: "Docker image is required",
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
				toast.success("Docker Provider Saved");
				await refetch();
			})
			.catch(() => {
				toast.error("Error saving the Docker provider");
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
									<FormLabel>Docker Image</FormLabel>
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
								<FormLabel>Registry URL</FormLabel>
								<FormControl>
									<Input placeholder="Registry URL" {...field} />
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
									<FormLabel>Username</FormLabel>
									<FormControl>
										<Input
											placeholder="Username"
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
									<FormLabel>Password</FormLabel>
									<FormControl>
										<Input
											placeholder="Password"
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
						Save{" "}
					</Button>
				</div>
			</form>
		</Form>
	);
};
