# SPDX-License-Identifier: GPL-2.0
# The planner tests (tests/plan_test.cpp, tests/plan_oracle.cpp) as Android
# executables, built from the same sources, the same flags and the same
# dependencies as libopendives.so (native/CMakeLists.txt), to be pushed to a
# device with tests/android/run.sh. Nothing here ships in the app.
# Run by tests/android/build.sh.
cmake_minimum_required(VERSION 3.22)
project(opendives_plan_tests LANGUAGES C CXX)

get_filename_component(ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
set(SS "${ROOT}/third_party/subsurface")
set(COMPAT "${ROOT}/core/compat")

file(STRINGS "${COMPAT}/core-files.txt" CORE_FILES)
set(SOURCES "")
foreach(f ${CORE_FILES})
  list(APPEND SOURCES "${SS}/core/${f}.cpp")
endforeach()
list(APPEND SOURCES
  "${COMPAT}/qthelper_compat.cpp"
  "${COMPAT}/notifier_compat.cpp"
  "${COMPAT}/cloud_compat.cpp"
  "${COMPAT}/https_openssl.cpp"
  "${COMPAT}/bluetooth_compat.cpp"
  "${ROOT}/core/libopendives/opendives.cpp"
  "${ROOT}/core/libopendives/edit.cpp"
  "${ROOT}/core/libopendives/regions.cpp"
  "${ROOT}/core/libopendives/tools.cpp"
  "${ROOT}/core/libopendives/settings.cpp"
  "${ROOT}/core/libopendives/plan.cpp"
  "${ROOT}/core/libopendives/filter.cpp"
  "${ROOT}/core/libopendives/account.cpp"
  "${ROOT}/core/libopendives/stats.cpp"
  "${ROOT}/core/libopendives/download.cpp")

file(WRITE "${CMAKE_BINARY_DIR}/gen/build-defs.h" "#define SUBSURFACE_SOURCE \"\"\n")

# The core and the façade once, the two tests on top.
add_library(core_objs OBJECT ${SOURCES})
set(COMMON_COMPILE_OPTIONS -w -O2 "SHELL:-iquote ${COMPAT}/shadow" "SHELL:-include ${CMAKE_BINARY_DIR}/gen/build-defs.h")
set(COMMON_INCLUDES "${COMPAT}/qtshim" "${COMPAT}/gen" "${CMAKE_BINARY_DIR}/gen" "${ROOT}" "${SS}" "${SS}/libdivecomputer/include"
  "${DEPS}/include" "${DEPS}/include/libxml2")
foreach(target core_objs)
  target_compile_features(${target} PRIVATE cxx_std_20)
  target_compile_definitions(${target} PRIVATE BT_SUPPORT BLE_SUPPORT)
  target_compile_options(${target} PRIVATE ${COMMON_COMPILE_OPTIONS})
  target_include_directories(${target} PRIVATE ${COMMON_INCLUDES})
endforeach()

foreach(test plan_test plan_oracle)
  add_executable(${test} "${ROOT}/tests/${test}.cpp" $<TARGET_OBJECTS:core_objs>)
  target_compile_features(${test} PRIVATE cxx_std_20)
  target_compile_definitions(${test} PRIVATE BT_SUPPORT BLE_SUPPORT)
  target_compile_options(${test} PRIVATE ${COMMON_COMPILE_OPTIONS})
  target_include_directories(${test} PRIVATE ${COMMON_INCLUDES})
  target_link_directories(${test} PRIVATE "${DEPS}/lib")
  target_link_libraries(${test} PRIVATE divecomputer git2 ssl crypto zip xslt xml2 sqlite3 z m log)
endforeach()
