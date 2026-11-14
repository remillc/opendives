# SPDX-License-Identifier: GPL-2.0
# Subsurface core (unmodified) + core/compat + facade, as a static library for
# iOS. Same sources and flags as OpenDives' native/CMakeLists.txt, without the
# JNI bridge. Run by native/ios/build-ios.sh.
cmake_minimum_required(VERSION 3.22)
project(opendives_ios LANGUAGES C CXX)

option(OPENDIVES_TESTS "Also build the test programs" OFF)

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
  "${COMPAT}/https_mbedtls.cpp"
  "${COMPAT}/bluetooth_compat.cpp"
  "${ROOT}/core/libopendives/opendives.cpp"
  "${ROOT}/core/libopendives/edit.cpp"
  "${ROOT}/core/libopendives/tools.cpp"
  "${ROOT}/core/libopendives/settings.cpp"
  "${ROOT}/core/libopendives/plan.cpp"
  "${ROOT}/core/libopendives/filter.cpp"
  "${ROOT}/core/libopendives/account.cpp"
  "${ROOT}/core/libopendives/stats.cpp"
  "${ROOT}/core/libopendives/download.cpp")

# Written once: a new time stamp at each configuration would rebuild the whole core.
if(NOT EXISTS "${CMAKE_BINARY_DIR}/gen/build-defs.h")
  file(WRITE "${CMAKE_BINARY_DIR}/gen/build-defs.h" "#define SUBSURFACE_SOURCE \"\"\n")
endif()

set(COMMON_OPTIONS -w -O2 -fvisibility=hidden
  "SHELL:-iquote ${COMPAT}/shadow"
  "SHELL:-include ${CMAKE_BINARY_DIR}/gen/build-defs.h")
set(COMMON_INCLUDES
  "${COMPAT}/qtshim" "${COMPAT}/gen" "${CMAKE_BINARY_DIR}/gen"
  "${ROOT}" "${SS}" "${SS}/libdivecomputer/include"
  "${DEPS}/include" "${DEPS}/include/libxml2")

function(opendives_setup target)
  target_compile_features(${target} PRIVATE cxx_std_20)
  target_compile_definitions(${target} PRIVATE BT_SUPPORT BLE_SUPPORT)
  target_compile_options(${target} PRIVATE ${COMMON_OPTIONS})
  target_include_directories(${target} PRIVATE ${COMMON_INCLUDES})
endfunction()

add_library(core_objs OBJECT ${SOURCES})
opendives_setup(core_objs)

add_library(opendives STATIC $<TARGET_OBJECTS:core_objs>)

# The programs of OpenDives' tests, unchanged, to be run in the simulator.
if(OPENDIVES_TESTS)
  foreach(test roundtrip plan_test plan_oracle)
    add_executable(${test} "${ROOT}/tests/${test}.cpp" $<TARGET_OBJECTS:core_objs>)
    opendives_setup(${test})
    # A plain executable: on iOS, CMake would otherwise make an .app of it.
    set_target_properties(${test} PROPERTIES MACOSX_BUNDLE OFF)
    target_link_directories(${test} PRIVATE "${DEPS}/lib")
    target_link_libraries(${test} PRIVATE divecomputer git2 mbedtls mbedx509 mbedcrypto zip xslt xml2 sqlite3 z iconv m)
  endforeach()
endif()
