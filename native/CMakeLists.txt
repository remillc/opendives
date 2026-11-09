# SPDX-License-Identifier: GPL-2.0
# Subsurface core (unmodified) + core/compat + façade + JNI bridge, for the NDK.
# Run by native/build-android.sh. Options taken from poc/build.sh.
cmake_minimum_required(VERSION 3.22)
project(opendives LANGUAGES C CXX)

get_filename_component(ROOT "${CMAKE_CURRENT_SOURCE_DIR}/.." ABSOLUTE)
set(SS "${ROOT}/third_party/subsurface")
set(COMPAT "${ROOT}/core/compat")

# List shared with poc/build.sh.
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
  "${ROOT}/core/libopendives/regions.cpp"
  "${ROOT}/core/libopendives/tools.cpp"
  "${ROOT}/core/libopendives/settings.cpp"
  "${ROOT}/core/libopendives/plan.cpp"
  "${ROOT}/core/libopendives/filter.cpp"
  "${ROOT}/core/libopendives/account.cpp"
  "${ROOT}/core/libopendives/stats.cpp"
  "${ROOT}/core/libopendives/download.cpp"
  "${ROOT}/plugins/opendives-core/android/src/main/cpp/opendives_jni.cpp")

file(WRITE "${CMAKE_BINARY_DIR}/gen/build-defs.h" "#define SUBSURFACE_SOURCE \"\"\n")

add_library(opendives SHARED ${SOURCES})
target_compile_features(opendives PRIVATE cxx_std_20)
# Subsurface's Bluetooth paths in core/libdivecomputer.cpp, with the transport
# of core/compat/bluetooth_compat.cpp.
target_compile_definitions(opendives PRIVATE BT_SUPPORT BLE_SUPPORT)
target_compile_options(opendives PRIVATE
  -w -O2 -fvisibility=hidden
  "SHELL:-iquote ${COMPAT}/shadow"
  "SHELL:-include ${CMAKE_BINARY_DIR}/gen/build-defs.h")
target_include_directories(opendives PRIVATE
  "${COMPAT}/qtshim" "${COMPAT}/gen" "${CMAKE_BINARY_DIR}/gen"
  "${ROOT}" "${SS}" "${SS}/libdivecomputer/include"
  "${DEPS}/include" "${DEPS}/include/libxml2")
target_link_directories(opendives PRIVATE "${DEPS}/lib")
target_link_libraries(opendives PRIVATE divecomputer git2 mbedtls mbedx509 mbedcrypto zip xslt xml2 sqlite3 z m log)
target_link_options(opendives PRIVATE
  -Wl,--gc-sections -Wl,-z,max-page-size=16384 -Wl,--exclude-libs,ALL)
