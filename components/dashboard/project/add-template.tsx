import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AlertBlock } from "@/components/shared/alert-block";
import { api } from "@/utils/api";
import { Code, Github, Globe, PuzzleIcon } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
interface Props {
	projectId: string;
}

export const AddTemplate = ({ projectId }: Props) => {
	const [query, setQuery] = useState("");
	const { data } = api.compose.templates.useQuery();

	const { mutateAsync, isLoading, error, isError } =
		api.compose.deployTemplate.useMutation();

	const templates = data?.filter((t) =>
		t.name.toLowerCase().includes(query.toLowerCase()),
	);

	return (
		<Dialog>
			<DialogTrigger className="w-full">
				<DropdownMenuItem
					className="w-full cursor-pointer space-x-3"
					onSelect={(e) => e.preventDefault()}
				>
					<PuzzleIcon className="size-4 text-muted-foreground" />
					<span>Templates</span>
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-7xl p-0">
				<div className="sticky top-0 z-10 flex flex-col gap-4 bg-black p-6 border-b">
					<DialogHeader>
						<DialogTitle>Create Template</DialogTitle>
						<DialogDescription>
							Deploy a open source template to your project
						</DialogDescription>
					</DialogHeader>
					{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
					<Input
						placeholder="Search Template"
						onChange={(e) => setQuery(e.target.value)}
						value={query}
					/>
				</div>
				<div className="p-6">
					<div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 w-full gap-4">
						{templates?.map((template, index) => (
							<div key={`template-${index}`}>
								<div
									key={template.name}
									className="flex flex-col gap-4 border p-6 rounded-lg h-full"
								>
									<div className="flex flex-col gap-4">
										<div className="flex flex-col items-center gap-2">
											<img
												src={`/templates/${template.logo}`}
												className="size-28 object-contain"
												alt=""
											/>
										</div>

										<div className="flex flex-col gap-2">
											<div className="flex flex-col gap-2 justify-center items-center">
												<div className="flex flex-col gap-2 items-center justify-center">
													<span className="text-sm font-medium">
														{template.name}
													</span>
													<div className="flex flex-row gap-0">
														<Link
															href={template.links.github}
															target="_blank"
															className={
																"text-sm text-muted-foreground p-3 rounded-full hover:bg-border items-center flex transition-colors"
															}
														>
															<Github className="size-4 text-muted-foreground" />
														</Link>
														{template.links.website && (
															<Link
																href={template.links.website}
																target="_blank"
																className={
																	"text-sm text-muted-foreground p-3 rounded-full hover:bg-border items-center flex transition-colors"
																}
															>
																<Globe className="size-4 text-muted-foreground" />
															</Link>
														)}
														{template.links.docs && (
															<Link
																href={template.links.docs}
																target="_blank"
																className={
																	"text-sm text-muted-foreground p-3 rounded-full hover:bg-border items-center flex transition-colors"
																}
															>
																<Globe className="size-4 text-muted-foreground" />
															</Link>
														)}
														<Link
															href={`https://github.com/dokploy/dokploy/tree/canary/templates/${template.id}`}
															target="_blank"
															className={
																"text-sm text-muted-foreground p-3 rounded-full hover:bg-border items-center flex transition-colors"
															}
														>
															<Code className="size-4 text-muted-foreground" />
														</Link>
													</div>
													<div className="flex flex-row gap-2 flex-wrap justify-center">
														{template.tags.map((tag) => (
															<Badge variant="secondary" key={tag}>
																{tag}
															</Badge>
														))}
													</div>
												</div>

												<AlertDialog>
													<AlertDialogTrigger asChild>
														<Button onSelect={(e) => e.preventDefault()}>
															Deploy
														</Button>
													</AlertDialogTrigger>
													<AlertDialogContent>
														<AlertDialogHeader>
															<AlertDialogTitle>
																Are you absolutely sure?
															</AlertDialogTitle>
															<AlertDialogDescription>
																This will deploy {template.name} template to
																your project.
															</AlertDialogDescription>
														</AlertDialogHeader>
														<AlertDialogFooter>
															<AlertDialogCancel>Cancel</AlertDialogCancel>
															<AlertDialogAction
																onClick={async () => {
																	await mutateAsync({
																		projectId,
																		id: template.id,
																	})
																		.then(async () => {
																			toast.success(
																				`${template.name} template deleted succesfully`,
																			);
																		})
																		.catch(() => {
																			toast.error(
																				`Error to delete ${template.name} template`,
																			);
																		});
																}}
															>
																Confirm
															</AlertDialogAction>
														</AlertDialogFooter>
													</AlertDialogContent>
												</AlertDialog>
											</div>

											<p className="text-sm text-muted-foreground">
												{template.description}
											</p>
										</div>
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
