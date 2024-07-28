import { SquareAsterisk } from "lucide-react";
import React from "react";
import { toast } from "sonner";
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
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { api } from "~/utils/api";

interface Props {
	applicationId: string;
}
export const GenerateWildCard = ({ applicationId }: Props) => {
	const { mutateAsync, isLoading } = api.domain.generateWildcard.useMutation();
	const utils = api.useUtils();
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="secondary" isLoading={isLoading}>
					Generate Wildcard Domain
					<SquareAsterisk className="size-4  text-muted-foreground " />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						Are you sure to generate a new wildcard domain?
					</AlertDialogTitle>
					<AlertDialogDescription>
						This will generate a new domain and will be used to access to the
						application
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							await mutateAsync({
								applicationId,
							})
								.then((data) => {
									utils.domain.byApplicationId.invalidate({
										applicationId: applicationId,
									});
									utils.application.readTraefikConfig.invalidate({
										applicationId: applicationId,
									});
									toast.success("Generated Domain succesfully");
								})
								.catch((e) => {
									toast.error(`Error to generate Domain: ${e.message}`);
								});
						}}
					>
						Confirm
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};
