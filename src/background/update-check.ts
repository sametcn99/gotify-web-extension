const GITHUB_REPO = "sametcn99/gotify-web-extension";
const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

export interface UpdateInfo {
	currentVersion: string;
	latestVersion: string;
	releaseUrl: string;
}

const normalizeVersion = (value: string): string =>
	value.trim().replace(/^v/i, "");

// Compares dotted numeric versions (e.g. "1.2.10" vs "1.3.0"); returns >0 when
// `a` is newer than `b`. Non-numeric parts compare as 0, which is good enough
// for the plain semver-ish tags this repo publishes.
const compareVersions = (a: string, b: string): number => {
	const partsA = normalizeVersion(a).split(".");
	const partsB = normalizeVersion(b).split(".");
	const length = Math.max(partsA.length, partsB.length);
	for (let i = 0; i < length; i++) {
		const diff = (Number(partsA[i]) || 0) - (Number(partsB[i]) || 0);
		if (diff !== 0) return diff;
	}
	return 0;
};

export const checkForUpdate = async (): Promise<UpdateInfo | undefined> => {
	const currentVersion = browser.runtime.getManifest().version;
	const response = await fetch(LATEST_RELEASE_API_URL, {
		headers: { Accept: "application/vnd.github+json" },
	});
	if (!response.ok) {
		throw new Error(`GitHub release check failed: ${response.status}`);
	}
	const release = (await response.json()) as {
		tag_name?: string;
		html_url?: string;
	};
	if (!release.tag_name || !release.html_url) return undefined;

	const latestVersion = normalizeVersion(release.tag_name);
	if (compareVersions(latestVersion, currentVersion) <= 0) return undefined;

	return {
		currentVersion,
		latestVersion,
		releaseUrl: release.html_url,
	};
};
