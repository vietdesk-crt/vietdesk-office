cmake_minimum_required(VERSION 3.20)
project(vietdesk_core VERSION 0.2.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

option(VIETDESK_BUILD_TESTS "Build core tests" ON)

add_library(vietdesk_core STATIC
  src/common/utf8.cpp
  src/formula/formula.cpp
  src/vietnamese/vietnamese.cpp
  src/ffi/abi.cpp
)

target_include_directories(vietdesk_core
  PUBLIC  ${CMAKE_CURRENT_SOURCE_DIR}/include
  PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src
)

target_compile_options(vietdesk_core PRIVATE
  $<$<CXX_COMPILER_ID:GNU,Clang>:-Wall -Wextra -Wpedantic>
  $<$<CXX_COMPILER_ID:MSVC>:/W4>
)

# Bí danh để nhúng bằng add_subdirectory() từ app khác.
add_library(vietdesk::core ALIAS vietdesk_core)

if(VIETDESK_BUILD_TESTS)
  enable_testing()
  add_executable(vietdesk_core_tests tests/test_vietnamese.cpp)
  target_link_libraries(vietdesk_core_tests PRIVATE vietdesk_core)
  add_test(NAME core_tests COMMAND vietdesk_core_tests)

  add_executable(vietdesk_formula_tests tests/test_formula.cpp)
  target_link_libraries(vietdesk_formula_tests PRIVATE vietdesk_core)
  add_test(NAME formula_tests COMMAND vietdesk_formula_tests)
endif()
