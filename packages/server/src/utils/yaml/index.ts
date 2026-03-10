import * as yaml from "yaml";

export { stringify, YAMLParseError } from "yaml";

export const parse = (
	src: string,
	options?: yaml.ParseOptions &
		yaml.DocumentOptions &
		yaml.SchemaOptions &
		yaml.ToJSOptions,
): any => yaml.parse(src, { maxAliasCount: 10000, ...options });
