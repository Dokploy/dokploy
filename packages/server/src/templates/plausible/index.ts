import {
	type DomainSchema,
	type Schema,
	type Template,
	generateBase64,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const secretBase = generateBase64(64);
	const toptKeyBase = generateBase64(32);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 8000,
			serviceName: "plausible",
		},
	];

	const envs = [
		`BASE_URL=http://${mainDomain}`,
		`SECRET_KEY_BASE=${secretBase}`,
		`TOTP_VAULT_KEY=${toptKeyBase}`,
	];

	const mounts: Template["mounts"] = [
		{
			filePath: "/clickhouse/clickhouse-config.xml",
			content: `
            <clickhouse>
            <logger>
                <level>warning</level>
                <console>true</console>
            </logger>
        
            <!-- Stop all the unnecessary logging -->
            <query_thread_log remove="remove"/>
            <query_log remove="remove"/>
            <text_log remove="remove"/>
            <trace_log remove="remove"/>
            <metric_log remove="remove"/>
            <asynchronous_metric_log remove="remove"/>
            <session_log remove="remove"/>
            <part_log remove="remove"/>
        </clickhouse>
            
            `,
		},
		{
			filePath: "/clickhouse/clickhouse-user-config.xml",
			content: `
            <clickhouse>
                <profiles>
                    <default>
                        <log_queries>0</log_queries>
                        <log_query_threads>0</log_query_threads>
                    </default>
                </profiles>
            </clickhouse>
            `,
		},
	];

	return {
		envs,
		mounts,
		domains,
	};
}
