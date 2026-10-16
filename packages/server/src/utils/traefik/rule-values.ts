import { URL_PATH_MESSAGE } from "../../db/validations/domain";
import { INVALID_HOSTNAME_MESSAGE } from "../hostname-validation";

// Template deploys, preview deployments, project duplicates and AI suggestions
// reach the rule builders without the domain schema. Inside a backtick-quoted
// rule string only a backtick ends the string and adds a rule for another
// host, so only that and control characters are refused here: stored hosts
// with underscores or Unicode must still deploy, while the API schema keeps
// the stricter hostname and path rules for new writes.
const breaksRule = (value: string) =>
	[...value].some((character) => {
		const code = character.charCodeAt(0);
		return character === "`" || code < 0x20 || code === 0x7f;
	});

export const assertTraefikRuleValues = ({
	host,
	path,
	internalPath,
}: {
	host: string;
	path?: string | null;
	internalPath?: string | null;
}) => {
	if (breaksRule(host)) {
		throw new Error(`Invalid domain host. ${INVALID_HOSTNAME_MESSAGE}`);
	}
	if (path && breaksRule(path)) {
		throw new Error(`Invalid domain path. ${URL_PATH_MESSAGE}`);
	}
	if (internalPath && breaksRule(internalPath)) {
		throw new Error(`Invalid domain internal path. ${URL_PATH_MESSAGE}`);
	}
};
