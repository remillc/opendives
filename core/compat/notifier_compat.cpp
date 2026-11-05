// SPDX-License-Identifier: GPL-2.0
//
// OpenDives — the Qt signal hub of Subsurface (DiveListNotifier) has no
// listeners in the core-only build. Signals are no-ops here; the app layer
// observes changes through its own bridge to the web view.

#include "core/subsurface-qt/divelistnotifier.h"

DiveListNotifier diveListNotifier;

void DiveListNotifier::divesSelected(const QVector<dive *> &, dive *, int)
{
}

void DiveListNotifier::tripSelected(dive_trip *, dive *)
{
}
