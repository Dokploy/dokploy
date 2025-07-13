import { api } from "@/utils/api";
import { validateRequest } from "@dokploy/server";
import type { GetServerSidePropsContext, NextPage } from "next";
import dynamic from "next/dynamic";
import "swagger-ui-react/swagger-ui.css";
import { useEffect, useState } from "react";
import { PERMISSIONS } from "@dokploy/server/lib/permissions";

const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

const Home: NextPage = () => {
	const { data } = api.settings.getOpenApiDocument.useQuery();
	const [spec, setSpec] = useState({});

	useEffect(() => {
		if (data) {
			const protocolAndHost = `${window.location.protocol}//${window.location.host}/api`;
			const newSpec = {
				...data,
				servers: [{ url: protocolAndHost }],
				externalDocs: {
					url: `${protocolAndHost}/settings.getOpenApiDocument`,
				},
			};
			setSpec(newSpec);
		}
	}, [data]);

	return (
		<div className="h-screen bg-white">
			<SwaggerUI
				spec={spec}
				persistAuthorization={true}
				plugins={[
					{
						statePlugins: {
							auth: {
								wrapActions: {
									authorize: (ori: any) => (args: any) => {
										const result = ori(args);
										const apiKey = args?.apiKey?.value;
										if (apiKey) {
											localStorage.setItem("swagger_api_key", apiKey);
										}
										return result;
									},
									logout: (ori: any) => (args: any) => {
										const result = ori(args);
										localStorage.removeItem("swagger_api_key");
										return result;
									},
								},
							},
						},
					},
				]}
				requestInterceptor={(request: any) => {
					const apiKey = localStorage.getItem("swagger_api_key");
					if (apiKey) {
						request.headers = request.headers || {};
						request.headers["x-api-key"] = apiKey;
					}
					return request;
				}}
			/>
		</div>
	);
};

export default Home;
export async function getServerSideProps(context: GetServerSidePropsContext) {
	const { user } = await validateRequest(context.req);
	if (!user) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}

	if (user.role?.name === "member" || !user?.role?.isSystem) {
		if (!user?.role?.permissions?.includes(PERMISSIONS.API.ACCESS.name)) {
			return {
				redirect: {
					permanent: true,
					destination: "/",
				},
			};
		}
	}

	return {
		props: {},
	};
}
