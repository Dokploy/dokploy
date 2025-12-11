import { zodResolver } from "@hookform/resolvers/zod";
import { Cog } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useEffect, useMemo } from "react";
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
	[BuildType.dockerfile]: "application.build.type.dockerfile",
	[BuildType.railpack]: "application.build.type.railpack",
	[BuildType.nixpacks]: "application.build.type.nixpacks",
	[BuildType.heroku_buildpacks]: "application.build.type.heroku",
	[BuildType.paketo_buildpacks]: "application.build.type.paketo",
	[BuildType.static]: "application.build.type.static",
};

const createSchema = (t: (key: string) => string) =>
	z.discriminatedUnion("buildType", [
	z.object({
		buildType: z.literal(BuildType.dockerfile),
		dockerfile: z
			.string({
				required_error: t("application.build.validation.dockerfilePathRequired"),
				invalid_type_error: t(
					"application.build.validation.dockerfilePathRequired",
				),
			})
			.min(1, {
				message: t("application.build.validation.dockerfileRequired"),
			}),
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

type AddTemplate = z.infer<ReturnType<typeof createSchema>>;

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
	const { t } = useTranslation("common");
	const schema = useMemo(() => createSchema(t), [t]);

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
		resolver: zodResolver(schema),
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
				toast.success(t("application.build.toast.save.success"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("application.build.toast.save.error"));
			});
	};

	return (
		<Card className="group relative w-full bg-transparent">
			<CardHeader>
				<CardTitle className="flex items-start justify-between">
					<div className="flex flex-col gap-2">
						<span className="flex flex-col space-y-0.5">
							{t("application.build.card.title")}
						</span>
						<p className="flex items-center text-sm font-normal text-muted-foreground">
							{t("application.build.card.description")}
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
						{t("application.build.warning.builders")}{" "}
						<a
							href="https://docs.dokploy.com/docs/core/applications/going-production"
							target="_blank"
							rel="noreferrer"
							className="font-medium underline underline-offset-4"
						>
							{t("application.build.warning.linkLabel")}
						</a>
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
									<FormLabel>
										{t("application.build.form.buildType.label")}
									</FormLabel>
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
															{t(label)}
															{value === BuildType.railpack && (
																<Badge className="ml-2 px-1 text-xs">
																	{t("application.build.badge.new")}
																</Badge>
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
										<FormLabel>
											{t("application.build.herokuVersion.label")}
										</FormLabel>
										<FormControl>
											<Input
												placeholder={t(
													"application.build.herokuVersion.placeholder",
												)}
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
											<FormLabel>
												{t("application.build.dockerfile.label")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"application.build.dockerfile.placeholder",
													)}
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
											<FormLabel>
												{t("application.build.dockerContext.label")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"application.build.dockerContext.placeholder",
													)}
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
												<FormLabel>
													{t("application.build.dockerBuildStage.label")}
												</FormLabel>
												<FormDescription>
													{t("application.build.dockerBuildStage.description")}
												</FormDescription>
											</div>
											<FormControl>
												<Input
													placeholder={t(
														"application.build.dockerBuildStage.placeholder",
													)}
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
											<FormLabel>
												{t("application.build.publishDirectory.label")}
											</FormLabel>
											<FormDescription>
												{t("application.build.publishDirectory.description")}
											</FormDescription>
										</div>
										<FormControl>
											<Input
												placeholder={t(
													"application.build.publishDirectory.placeholder",
												)}
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
													{t("application.build.staticSpa.label")}
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
										<FormLabel>
											{t("application.build.railpackVersion.label")}
										</FormLabel>
										<FormControl>
											<Input
												placeholder={t(
													"application.build.railpackVersion.placeholder",
												)}
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
								{t("button.save")}
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
