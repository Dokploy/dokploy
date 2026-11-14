import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Plus, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
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
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";

const domainRestrictionSchema = z.object({
	enabled: z.boolean(),
	allowedWildcards: z.array(z.string().min(1)),
});

type DomainRestrictionForm = z.infer<typeof domainRestrictionSchema>;

export const DomainRestriction = () => {
	const [newPattern, setNewPattern] = useState("");
	const { data, refetch } = api.settings.getDomainRestrictionConfig.useQuery();
	const { mutateAsync, isPending } =
		api.settings.updateDomainRestriction.useMutation();

	const form = useForm<DomainRestrictionForm>({
		defaultValues: {
			enabled: false,
			allowedWildcards: [],
		},
		resolver: zodResolver(domainRestrictionSchema),
	});

	const enabled = form.watch("enabled");
	const allowedWildcards = form.watch("allowedWildcards");

	useEffect(() => {
		if (data) {
			form.reset({
				enabled: data.enabled,
				allowedWildcards: data.allowedWildcards,
			});
		}
	}, [form, data]);

	const onSubmit = async (formData: DomainRestrictionForm) => {
		await mutateAsync({
			domainRestrictionConfig: formData,
		})
			.then(async () => {
				await refetch();
				toast.success("Domain restriction settings saved");
			})
			.catch(() => {
				toast.error("Error saving domain restriction settings");
			});
	};

	const addPattern = () => {
		const pattern = newPattern.trim().toLowerCase();
		if (!pattern) return;

		const current = form.getValues("allowedWildcards");
		if (current.includes(pattern)) {
			toast.error("Pattern already exists");
			return;
		}

		form.setValue("allowedWildcards", [...current, pattern]);
		setNewPattern("");
	};

	const removePattern = (pattern: string) => {
		const current = form.getValues("allowedWildcards");
		form.setValue(
			"allowedWildcards",
			current.filter((p) => p !== pattern),
		);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			addPattern();
		}
	};

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader className="flex flex-row gap-2 flex-wrap justify-between items-center">
						<div className="flex flex-col gap-1">
							<CardTitle className="text-xl flex flex-row gap-2">
								<ShieldCheck className="size-6 text-muted-foreground self-center" />
								Domain Restriction
							</CardTitle>
							<CardDescription>
								Restrict which domains can be used for applications.
							</CardDescription>
						</div>
					</CardHeader>
					<CardContent className="space-y-4 py-6 border-t">
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								className="space-y-4"
							>
								<FormField
									control={form.control}
									name="enabled"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between p-3 border rounded-lg shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>Enable Domain Restriction</FormLabel>
												<FormDescription>
													When enabled, only domains matching the allowed
													wildcard patterns can be created.
												</FormDescription>
												<FormMessage />
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>

								{enabled && (
									<>
										<AlertBlock type="info">
											<div className="space-y-1">
												<p className="font-medium">
													Wildcard Pattern Examples:
												</p>
												<ul className="list-disc list-inside text-sm">
													<li>
														<code>*.example.com</code> - matches{" "}
														<code>app.example.com</code> (single level)
													</li>
													<li>
														<code>**.example.com</code> - matches{" "}
														<code>deep.sub.example.com</code> (multi-level)
													</li>
												</ul>
											</div>
										</AlertBlock>

										<FormField
											control={form.control}
											name="allowedWildcards"
											render={() => (
												<FormItem>
													<FormLabel>Allowed Wildcard Domains</FormLabel>
													<div className="flex gap-2">
														<Input
															placeholder="*.example.com"
															value={newPattern}
															onChange={(e) => setNewPattern(e.target.value)}
															onKeyDown={handleKeyDown}
														/>
														<Button
															type="button"
															variant="secondary"
															onClick={addPattern}
														>
															<Plus className="size-4" />
															Add
														</Button>
													</div>
													<FormMessage />
												</FormItem>
											)}
										/>

										{allowedWildcards.length > 0 && (
											<div className="flex flex-wrap gap-2 pt-2">
												{allowedWildcards.map((pattern) => (
													<Badge
														key={pattern}
														variant="secondary"
														className="text-sm py-1 px-3 gap-1"
													>
														{pattern}
														<button
															type="button"
															onClick={() => removePattern(pattern)}
															className="ml-1 hover:text-destructive"
														>
															<X className="size-3" />
														</button>
													</Badge>
												))}
											</div>
										)}

										{allowedWildcards.length === 0 && (
											<p className="text-sm text-muted-foreground">
												No wildcard patterns configured. Add at least one
												pattern to enable restriction.
											</p>
										)}
									</>
								)}

								<div className="flex w-full justify-end pt-4">
									<Button isLoading={isPending} type="submit">
										Save
									</Button>
								</div>
							</form>
						</Form>
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
