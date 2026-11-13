// SPDX-License-Identifier: GPL-2.0
// The published ZH-L16C constants and the Schreiner equation, written from the
// published formulas WITHOUT reading Subsurface's core/deco.cpp. Shared by the
// independent checkers (plan_oracle.cpp: planner; tools_test.cpp: desaturation).
#pragma once
#include <cmath>

namespace zhl16c {

constexpr int N = 16;
// ZH-L16C half-times (min), nitrogen then helium.
const double HT_N2[N] = { 5.0, 8.0, 12.5, 18.5, 27.0, 38.3, 54.3, 77.0, 109.0, 146.0, 187.0, 239.0, 305.0, 390.0, 498.0, 635.0 };
const double HT_HE[N] = { 1.88, 3.02, 4.72, 6.99, 10.21, 14.48, 20.53, 29.11, 41.20, 55.19, 70.69, 90.34, 115.29, 147.42, 188.24, 240.03 };
// ZH-L16C a (bar) and b.
const double A_N2[N] = { 1.1696, 1.0, 0.8618, 0.7562, 0.62, 0.5043, 0.441, 0.4, 0.375, 0.35, 0.3295, 0.3065, 0.2835, 0.261, 0.248, 0.2327 };
const double B_N2[N] = { 0.5578, 0.6514, 0.7222, 0.7825, 0.8126, 0.8434, 0.8693, 0.8910, 0.9092, 0.9222, 0.9319, 0.9403, 0.9477, 0.9544, 0.9602, 0.9653 };
const double A_HE[N] = { 1.6189, 1.383, 1.1919, 1.0458, 0.922, 0.8205, 0.7305, 0.6502, 0.595, 0.5545, 0.5333, 0.5189, 0.5181, 0.5176, 0.5172, 0.5119 };
const double B_HE[N] = { 0.4770, 0.5747, 0.6527, 0.7223, 0.7582, 0.7957, 0.8279, 0.8553, 0.8757, 0.8903, 0.8997, 0.9073, 0.9122, 0.9171, 0.9217, 0.9267 };

constexpr double WATER_VAPOUR_BAR = 0.0627; // Bühlmann: 47 mmHg
constexpr double AIR_N2 = 0.7902;           // nitrogen of the air breathed at the surface before the dive
constexpr double GRAVITY = 9.80665;

// Schreiner equation: the inert gas load (bar) after `minutes` of a linear change
// of ambient pressure from `pa` at `rate_bar_min`, breathing `fraction` of the gas.
inline double schreiner(double load, double half_time, double pa, double rate_bar_min, double minutes, double fraction)
{
	double k = log(2.0) / half_time;
	double pi0 = (pa - WATER_VAPOUR_BAR) * fraction, r = rate_bar_min * fraction;
	return pi0 + r * (minutes - 1.0 / k) - (pi0 - load - r / k) * exp(-k * minutes);
}

} // namespace zhl16c
