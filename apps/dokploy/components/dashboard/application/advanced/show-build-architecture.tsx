import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Cpu } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

interface Props {
	applicationId: string;
}

const BUILD_ARCHITECTURES = ["host", "amd64", "arm64", "multi"] as const;

const architectureLabels: Record<(typeof BUILD_ARCHITECTURES)[number], string> =
	{
		host: "Host native (default)",
		amd64: "linux/amd64",
		arm64: "linux/arm64",
		multi: "linux/amd64 and linux/arm64 (multi-arch)",
	};

const formSchema = z.object({
	buildArchitecture: z.enum(BUILD_ARCHITECTURES),
	buildxBuilder: z.string().optional(),
});

type Schema = z.infer<typeof formSchema>;

export const ShowBuildArchitecture = ({ applicationId }: Props) => {
	const { data, refetch } = api.application.one.useQuery(
		{ applicationId },
		{ enabled: !!applicationId },
	);
	const { mutateAsync, isPending } = api.application.update.useMutation();

	const hasRegistry = Boolean(
		data?.registryId || data?.buildRegistryId || data?.rollbackRegistryId,
	);

	const form = useForm<Schema>({
		defaultValues: {
			buildArchitecture: "host",
			buildxBuilder: "",
		},
		resolver: zodResolver(formSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				buildArchitecture: data.buildArchitecture || "host",
				buildxBuilder: data.buildxBuilder || "",
			});
		}
	}, [form, data]);

	const architecture = form.watch("buildArchitecture");

	const onSubmit = async (formData: Schema) => {
		if (formData.buildArchitecture === "multi" && !hasRegistry) {
			form.setError("buildArchitecture", {
				message:
					"Multi-arch builds require a cluster registry or a build registry. Docker cannot load a multi-arch image into the local daemon.",
			});
			return;
		}
		await mutateAsync({
			applicationId,
			buildArchitecture: formData.buildArchitecture,
			buildxBuilder: formData.buildxBuilder?.trim()
				? formData.buildxBuilder.trim()
				: null,
		})
			.then(async () => {
				toast.success("Build architecture updated");
				await refetch();
			})
			.catch(() => {
				toast.error("Error updating build architecture");
			});
	};

	return (
		<Card className="bg-background">
			<CardHeader>
				<div className="flex flex-row items-center gap-2">
					<Cpu className="size-6 text-muted-foreground" />
					<div>
						<CardTitle className="text-xl">Build Architecture</CardTitle>
						<CardDescription>
							Choose which CPU architectures Docker should build for.
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<AlertBlock type="info">
					Host native builds for the CPU of the build server. Pinning amd64 or
					arm64 adds --platform to the build. Multi-arch uses Buildx and pushes
					a manifest list to a registry so each deploy server pulls the matching
					image.
				</AlertBlock>
				{architecture === "multi" && !hasRegistry ? (
					<AlertBlock type="warning">
						Select a registry in Cluster Settings or Build Server before saving
						multi-arch. Buildx cannot load a multi-arch image into the local
						Docker daemon.
					</AlertBlock>
				) : null}
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<FormField
							control={form.control}
							name="buildArchitecture"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Architecture</FormLabel>
									<Select onValueChange={field.onChange} value={field.value}>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Select architecture" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{BUILD_ARCHITECTURES.map((value) => (
												<SelectItem key={value} value={value}>
													{architectureLabels[value]}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FormDescription>
										Cross-compilation uses QEMU unless you point at a native
										buildx builder below.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="buildxBuilder"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Buildx builder name</FormLabel>
									<FormControl>
										<Input
											placeholder="Leave empty for the default builder"
											{...field}
										/>
									</FormControl>
									<FormDescription>
										Optional named builder already created on the build host,
										for example a builder with native ARM and AMD64 nodes.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<div className="flex w-full justify-end">
							<Button isLoading={isPending} type="submit">
								Save
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
