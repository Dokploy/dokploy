import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ShowResources } from "../../application/advanced/show-resources";
import { ShowVolumes } from "../../application/advanced/volumes/show-volumes";
import { ShowCustomCommand } from "./show-custom-command";

interface Props {
	postgresId: string;
}

export const ShowAdvancedPostgres = ({ postgresId }: Props) => {
	return (
		<>
			<div className="flex w-full flex-col gap-5 ">
				<ShowCustomCommand id={postgresId} type="postgres" />
				<ShowVolumes postgresId={postgresId} />
				<ShowResources id={postgresId} type="postgres" />
			</div>
		</>
	);
};
