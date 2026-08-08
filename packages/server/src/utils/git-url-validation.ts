// Valid git URL patterns for HTTPS and SSH clone URLs.
// Rejects shell metacharacters that would enable command injection.
//
// HTTPS examples accepted:
//   https://github.com/owner/repo.git
//   http://gitlab.example.com/group/subgroup/repo.git
//
// SSH examples accepted:
//   git@github.com:owner/repo.git
//   ssh://git@gitlab.com:22/owner/repo.git
//   git@gitea.example.com:owner/repo.git
//
// Rejected: $(...), `...`, ;, |, &, <, >, newlines, spaces outside of SSH scheme
const HTTPS_GIT_URL_REGEX = /^https?:\/\/[^\s;|&$`(){}[\]<>'"\\]+$/;
const SSH_GIT_URL_REGEX =
	/^(?:ssh:\/\/)?[a-zA-Z_][a-zA-Z0-9_-]*@[a-zA-Z0-9.-]+(?::\d{1,5})?:[^\s;|&$`(){}[\]<>'"\\]+$/;

export const VALID_GIT_URL_REGEX = (url: string): boolean => {
	return HTTPS_GIT_URL_REGEX.test(url) || SSH_GIT_URL_REGEX.test(url);
};
