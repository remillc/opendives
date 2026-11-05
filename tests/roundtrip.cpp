// OpenDives proof of concept: load a dive log with Subsurface's own core code
// (built without Qt) and save it again, as XML or as a Subsurface git repository.
// Usage: roundtrip <input> <output>
//   input/output: a .xml/.ssrf file, or a git repository written as "path[branch]".
#include "core/divelog.h"
#include "core/dive.h"
#include "core/file.h"
#include "core/errorhelper.h"
#include "core/libopendives/opendives.h"
#include <git2.h>
#include <cstdio>

int main(int argc, char **argv)
{
	if (argc != 3) {
		fprintf(stderr, "usage: %s <input> <output>\n", argv[0]);
		return 2;
	}
	git_libgit2_init();
	int ret = parse_file(argv[1], &divelog);
	if (ret) {
		fprintf(stderr, "load failed (%d): %s\n", ret, argv[1]);
		return 1;
	}
	// As the app does after every load: keep the log's own settings (units...).
	opendives::apply_log_prefs();
	fprintf(stderr, "loaded %zu dives, %zu sites, %zu trips\n", divelog.dives.size(), divelog.sites.size(), divelog.trips.size());
	ret = save_dives(argv[2], true);
	if (ret) {
		fprintf(stderr, "save failed (%d): %s\n", ret, argv[2]);
		return 1;
	}
	git_libgit2_shutdown();
	return 0;
}
