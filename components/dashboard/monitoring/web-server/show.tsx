import React from "react";
import { DockerMonitoring } from "../docker/show";

export const ShowMonitoring = () => {
	return (
		<div className="my-6 w-full ">
			<DockerMonitoring appName="dokploy" />
		</div>
	);
};
