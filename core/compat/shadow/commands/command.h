// OpenDives compat: replaces Subsurface's Qt undo stack header for the core build.
// Only the call used by save-git.cpp (commit message text) is provided here.
#pragma once
#include <string>
namespace Command {
std::string changesMade();
}

// The undo stack lives in the OpenDives façade (core/libopendives/edit.cpp),
// which sets this hook; without it, changesMade() returns an empty string and
// save-git writes its default commit message.
namespace opendives_compat {
extern std::string (*changes_made_hook)();
}
