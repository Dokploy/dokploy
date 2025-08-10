import { zodResolver } from "@hookform/resolvers/zod";
import { Cog } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { api } from "@/utils/api";

export enum BuildType {
	dockerfile = "dockerfile",
	heroku_buildpacks = "heroku_buildpacks",
	paketo_buildpacks = "paketo_buildpacks",
	nixpacks = "nixpacks",
	static = "static",
	railpack = "railpack",
}

const buildTypeDisplayMap: Record<BuildType, string> = {
	[BuildType.dockerfile]: "Dockerfile",
	[BuildType.railpack]: "Railpack",
	[BuildType.nixpacks]: "Nixpacks",
	[BuildType.heroku_buildpacks]: "Heroku Buildpacks",
	[BuildType.paketo_buildpacks]: "Paketo Buildpacks",
	[BuildType.static]: "Static",
};

const mySchema = z.discriminatedUnion("buildType", [
	z.object({
		buildType: z.literal(BuildType.dockerfile),
		dockerfile: z
			.string({
				required_error: "Dockerfile path is required",
				invalid_type_error: "Dockerfile path is required",
			})
			.min(1, "Dockerfile required"),
		dockerContextPath: z.string().nullable().default(""),
		dockerBuildStage: z.string().nullable().default(""),
	}),
	z.object({
		buildType: z.literal(BuildType.heroku_buildpacks),
		herokuVersion: z.string().nullable().default(""),
	}),
	z.object({
		buildType: z.literal(BuildType.paketo_buildpacks),
	}),
	z.object({
		buildType: z.literal(BuildType.nixpacks),
		publishDirectory: z.string().optional(),
	}),
	z.object({
		buildType: z.literal(BuildType.railpack),
		railpackVersion: z.string().nullable().default("0.2.2"),
	}),
	z.object({
		buildType: z.literal(BuildType.static),
		isStaticSpa: z.boolean().default(false),
	}),
]);

type AddTemplate = z.infer<typeof mySchema>;

interface Props {
	applicationId: string;
}

interface ApplicationData {
	buildType: BuildType;
	dockerfile?: string | null;
	dockerContextPath?: string | null;
	dockerBuildStage?: string | null;
	herokuVersion?: string | null;
	publishDirectory?: string | null;
	isStaticSpa?: boolean | null;
	railpackVersion?: string | null | undefined;
}

function isValidBuildType(value: string): value is BuildType {
	return Object.values(BuildType).includes(value as BuildType);
}

const resetData = (data: ApplicationData): AddTemplate => {
	switch (data.buildType) {
		case BuildType.dockerfile:
			return {
				buildType: BuildType.dockerfile,
				dockerfile: data.dockerfile || "",
				dockerContextPath: data.dockerContextPath || "",
				dockerBuildStage: data.dockerBuildStage || "",
			};
		case BuildType.heroku_buildpacks:
			return {
				buildType: BuildType.heroku_buildpacks,
				herokuVersion: data.herokuVersion || "",
			};
		case BuildType.nixpacks:
			return {
				buildType: BuildType.nixpacks,
				publishDirectory: data.publishDirectory || undefined,
			};
		case BuildType.paketo_buildpacks:
			return {
				buildType: BuildType.paketo_buildpacks,
			};
		case BuildType.static:
			return {
				buildType: BuildType.static,
				isStaticSpa: data.isStaticSpa ?? false,
			};
		case BuildType.railpack:
			return {
				buildType: BuildType.railpack,
				railpackVersion: data.railpackVersion || null,
			};
		default: {
			const buildType = data.buildType as BuildType;
			return {
				buildType,
			} as AddTemplate;
		}
	}
};

export const ShowBuildChooseForm = ({ applicationId }: Props) => {
	const { mutateAsync, isLoading } =
		api.application.saveBuildType.useMutation();
	const { data, refetch } = api.application.one.useQuery(
		{ applicationId },
		{ enabled: !!applicationId },
	);

	const form = useForm<AddTemplate>({
		defaultValues: {
			buildType: BuildType.nixpacks,
		},
		resolver: zodResolver(mySchema),
	});

	const buildType = form.watch("buildType");

	useEffect(() => {
		if (data) {
			const typedData: ApplicationData = {
				...data,
				buildType: isValidBuildType(data.buildType)
					? (data.buildType as BuildType)
					: BuildType.nixpacks, // fallback
			};

			form.reset(resetData(typedData));
		}
	}, [data, form]);

	const onSubmit = async (data: AddTemplate) => {
		await mutateAsync({
			applicationId,
			buildType: data.buildType,
			publishDirectory:
				data.buildType === BuildType.nixpacks ? data.publishDirectory : null,
			dockerfile:
				data.buildType === BuildType.dockerfile ? data.dockerfile : null,
			dockerContextPath:
				data.buildType === BuildType.dockerfile ? data.dockerContextPath : null,
			dockerBuildStage:
				data.buildType === BuildType.dockerfile ? data.dockerBuildStage : null,
			herokuVersion:
				data.buildType === BuildType.heroku_buildpacks
					? data.herokuVersion
					: null,
			isStaticSpa:
				data.buildType === BuildType.static ? data.isStaticSpa : null,
			railpackVersion:
				data.buildType === BuildType.railpack
					? data.railpackVersion || "0.2.2"
					: null,
		})
			.then(async () => {
				toast.success("Build type saved");
				await refetch();
			})
			.catch(() => {
				toast.error("Error saving the build type");
			});
	};

	return (
		<Card className="group relative w-full bg-transparent">
			<CardHeader>
				<CardTitle className="flex items-start justify-between">
					<div className="flex flex-col gap-2">
						<span className="flex flex-col space-y-0.5">Build Type</span>
						<p className="flex items-center text-sm font-normal text-muted-foreground">
							Select the way of building your code
						</p>
					</div>
					<div className="hidden space-y-1 text-sm font-normal md:block">
						<Cog className="size-6 text-muted-foreground" />
					</div>
				</CardTitle>
			</CardHeader>
			<CardContent>
				<Form {...form}>
					<AlertBlock>
						Builders can consume significant memory and CPU resources
						(recommended: 4+ GB RAM and 2+ CPU cores). For production
						environments, please review our{" "}
						<a
							href="https://docs.dokploy.com/docs/core/applications/going-production"
							target="_blank"
							rel="noreferrer"
							className="font-medium underline underline-offset-4"
						>
							Production Guide
						</a>{" "}
						for best practices and optimization recommendations. Builders are
						suitable for development and prototyping purposes when you have
						sufficient resources available.
					</AlertBlock>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4 p-2"
					>
						<FormField
							control={form.control}
							name="buildType"
							defaultValue={form.control._defaultValues.buildType}
							render={({ field }) => (
								<FormItem className="space-y-3">
									<FormLabel>Build Type</FormLabel>
									<FormControl>
										<RadioGroup
											onValueChange={field.onChange}
											value={field.value}
											className="flex flex-col space-y-1"
										>
											{Object.entries(buildTypeDisplayMap).map(
												([value, label]) => (
													<FormItem
														key={value}
														className="flex items-center space-x-3 space-y-0"
													>
														<FormControl>
															<RadioGroupItem value={value} />
														</FormControl>
														<FormLabel className="font-normal">
															{label}
															{value === BuildType.railpack && (
																<Badge className="ml-2 px-1 text-xs">New</Badge>
															)}
														</FormLabel>
													</FormItem>
												),
											)}
										</RadioGroup>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						{buildType === BuildType.heroku_buildpacks && (
							<FormField
								control={form.control}
								name="herokuVersion"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Heroku Version (Optional)</FormLabel>
										<FormControl>
											<Input
												placeholder="Heroku Version (Default: 24)"
												{...field}
												value={field.value ?? ""}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
						{buildType === BuildType.dockerfile && (
							<>
								<FormField
									control={form.control}
									name="dockerfile"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Docker File</FormLabel>
											<FormControl>
												<Input
													placeholder="Path of your docker file"
													{...field}
													value={field.value ?? ""}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="dockerContextPath"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Docker Context Path</FormLabel>
											<FormControl>
												<Input
													placeholder="Path of your docker context (default: .)"
													{...field}
													value={field.value ?? ""}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="dockerBuildStage"
									render={({ field }) => (
										<FormItem>
											<div className="space-y-0.5">
												<FormLabel>Docker Build Stage</FormLabel>
												<FormDescription>
													Allows you to target a specific stage in a Multi-stage
													Dockerfile. If empty, Docker defaults to build the
													last defined stage.
												</FormDescription>
											</div>
											<FormControl>
												<Input
													placeholder="E.g. production"
													{...field}
													value={field.value ?? ""}
												/>
											</FormControl>
										</FormItem>
									)}
								/>
							</>
						)}
						{buildType === BuildType.nixpacks && (
							<FormField
								control={form.control}
								name="publishDirectory"
								render={({ field }) => (
									<FormItem>
										<div className="space-y-0.5">
											<FormLabel>Publish Directory</FormLabel>
											<FormDescription>
												Allows you to serve a single directory via NGINX after
												the build phase. Useful if the final build assets should
												be served as a static site.
											</FormDescription>
										</div>
										<FormControl>
											<Input
												placeholder="Publish Directory"
												{...field}
												value={field.value ?? ""}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
						{buildType === BuildType.static && (
							<FormField
								control={form.control}
								name="isStaticSpa"
								render={({ field }) => (
									<FormItem>
										<FormControl>
											<div className="flex items-center gap-x-2 p-2">
												<Checkbox
													id="checkboxIsStaticSpa"
													value={String(field.value)}
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
												<FormLabel htmlFor="checkboxIsStaticSpa">
													Single Page Application (SPA)
												</FormLabel>
											</div>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
						{buildType === BuildType.railpack && (
							<FormField
								control={form.control}
								name="railpackVersion"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Railpack Version</FormLabel>
										<FormControl>
											<Input
												placeholder="Railpack Version"
												{...field}
												value={field.value ?? ""}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
						<div className="flex w-full justify-end">
							<Button isLoading={isLoading} type="submit">
								Save
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
