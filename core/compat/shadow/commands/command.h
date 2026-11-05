// OpenDives compat: replaces Subsurface's Qt undo stack header for the core build.
// Only the call used by save-git.cpp (commit message text) is provided here.
#pragma once
#include <string>
namespace Command {
std::string changesMade();
}
