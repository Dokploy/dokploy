import { VALID_COMPOSE_PROFILE_REGEX } from "@dokploy/server/utils/compose/profiles";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { HelpCircle, X } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Badge } from "@/components/ui/badge";
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
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";

interface Props {
	composeId: string;
}

const ProfilesSchema = z.object({
	composeProfiles: z.array(
		z
			.string()
			.regex(
				VALID_COMPOSE_PROFILE_REGEX,
				"Use only letters, digits, '-' and '_' (must start with a letter or digit)",
			),
	),
});

type ProfilesForm = z.infer<typeof ProfilesSchema>;

export const AddProfilesCompose = ({ composeId }: Props) => {
	const utils = api.useUtils();
	const { data, refetch } = api.compose.one.useQuery(
		{ composeId },
		{ enabled: !!composeId },
	);

	const { mutateAsync, isPending } = api.compose.update.useMutation();

	const form = useForm<ProfilesForm>({
		defaultValues: {
			composeProfiles: [],
		},
		resolver: zodResolver(ProfilesSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				composeProfiles: data.composeProfiles ?? [],
			});
		}
	}, [data, form]);

	const isStack = data?.composeType === "stack";

	const addProfile = (raw: string) => {
		const value = raw.trim();
		if (!value) return;
		if (!VALID_COMPOSE_PROFILE_REGEX.test(value)) {
			toast.error(
				"Invalid profile name (allowed: letters, digits, '-', '_')",
			);
			return;
		}
		const current = form.getValues("composeProfiles") ?? [];
		if (current.includes(value)) return;
		form.setValue("composeProfiles", [...current, value], {
			shouldDirty: true,
		});
	};

	const onSubmit = async (values: ProfilesForm) => {
		await mutateAsync({
			composeId,
			composeProfiles: values.composeProfiles,
		})
			.then(async () => {
				toast.success("Compose profiles updated");
				await refetch();
				await utils.compose.one.invalidate({ composeId });
				await utils.compose.getDefaultCommand.invalidate({ composeId });
			})
			.catch(() => {
				toast.error("Error updating compose profiles");
			});
	};

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row justify-between">
				<div>
					<CardTitle className="text-xl">Compose Profiles</CardTitle>
					<CardDescription>
						Activate one or more docker compose profiles. Only services that
						belong to an activated profile (or no profile at all) will be
						deployed.
					</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{isStack && (
					<AlertBlock type="warning">
						Compose profiles are not supported by Docker Swarm{" "}
						<strong>stack deploy</strong>. Switch the compose type to{" "}
						<strong>docker-compose</strong> for profiles to take effect.
					</AlertBlock>
				)}
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<FormField
							control={form.control}
							name="composeProfiles"
							render={({ field }) => (
								<FormItem>
									<div className="flex items-center gap-2">
										<FormLabel>Active Profiles</FormLabel>
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger asChild>
													<HelpCircle className="size-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
												</TooltipTrigger>
												<TooltipContent className="max-w-[320px]">
													<p>
														Each profile name passed here is forwarded to docker
														compose as <code>--profile &lt;name&gt;</code>.
														Services declared with a matching <code>profiles:</code>{" "}
														entry will be started; services with no profile are
														always started. Leave empty to deploy all services.
													</p>
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									</div>
									<div className="flex flex-wrap gap-2 mb-2">
										{field.value?.map((profile, index) => (
											<Badge key={`${profile}-${index}`} variant="secondary">
												{profile}
												<X
													className="ml-1 size-3 cursor-pointer"
													onClick={() => {
														const next = [...(field.value ?? [])];
														next.splice(index, 1);
														form.setValue("composeProfiles", next, {
															shouldDirty: true,
														});
													}}
												/>
											</Badge>
										))}
									</div>
									<FormControl>
										<div className="flex gap-2">
											<Input
												placeholder="e.g. frontend, debug, gpu"
												onKeyDown={(e) => {
													if (e.key === "Enter" || e.key === ",") {
														e.preventDefault();
														const input = e.currentTarget;
														addProfile(input.value);
														input.value = "";
													}
												}}
											/>
											<Button
												type="button"
												variant="secondary"
												onClick={(e) => {
													const input = (
														e.currentTarget.previousSibling as HTMLInputElement | null
													);
													if (!input) return;
													addProfile(input.value);
													input.value = "";
												}}
											>
												Add
											</Button>
										</div>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<div className="flex justify-end">
							<Button isLoading={isPending} type="submit" className="w-fit">
								Save
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
