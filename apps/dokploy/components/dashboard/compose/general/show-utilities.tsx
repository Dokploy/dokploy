import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { IsolatedDeployment } from "./isolated-deployment";
import { RandomizeCompose } from "./randomize-compose";

interface Props {
	composeId: string;
}

export const ShowUtilities = ({ composeId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost">Show Utilities</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen overflow-y-auto sm:max-w-5xl">
				<DialogHeader>
					<DialogTitle>Utilities </DialogTitle>
					<DialogDescription>Modify the application data</DialogDescription>
				</DialogHeader>
				<Tabs defaultValue="isolated">
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="isolated">Isolated Deployment</TabsTrigger>
						<TabsTrigger value="randomize">Randomize Compose</TabsTrigger>
					</TabsList>
					<TabsContent value="randomize" className="pt-5">
						<RandomizeCompose composeId={composeId} />
					</TabsContent>
					<TabsContent value="isolated" className="pt-5">
						<IsolatedDeployment composeId={composeId} />
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
};
