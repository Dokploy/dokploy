import { Asterisk } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const WildcardIndicator = () => {
	return (
		<Badge variant="outline" className="text-xs">
			<Asterisk className="size-3 mr-1" />
			Wildcard
		</Badge>
	);
};

