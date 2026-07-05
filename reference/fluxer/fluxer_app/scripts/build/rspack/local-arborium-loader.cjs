// SPDX-License-Identifier: AGPL-3.0-or-later

module.exports = function localArboriumLoader(source) {
	return source
		.replaceAll('"jsdelivr"', '"bundled"')
		.replaceAll("'jsdelivr'", "'bundled'")
		.replaceAll('"unpkg"', '"bundled"')
		.replaceAll("'unpkg'", "'bundled'")
		.replaceAll('"https://cdn.jsdelivr.net/npm"', '""')
		.replaceAll("'https://cdn.jsdelivr.net/npm'", "''")
		.replaceAll('"https://unpkg.com"', '""')
		.replaceAll("'https://unpkg.com'", "''");
};
