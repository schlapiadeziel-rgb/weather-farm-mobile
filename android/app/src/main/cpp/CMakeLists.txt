cmake_minimum_required(VERSION 3.31.6)
project(farm_ai LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set_property(GLOBAL PROPERTY JOB_POOLS farm_compile=2 farm_link=1)
set(CMAKE_JOB_POOL_COMPILE farm_compile)
set(CMAKE_JOB_POOL_LINK farm_link)

include(FetchContent)
FetchContent_Declare(neolocal
  URL https://codeload.github.com/schlapiadeziel-rgb/NeoLocalAI-Android/tar.gz/cc1ffc71c6d02c26d144fd79cb5fa77cfddb17b8
  URL_HASH SHA256=db4417c5e4e34489fd3c374710ffb30a2b45b445999302f69b8f59820b68775b
  TLS_VERIFY TRUE
  DOWNLOAD_EXTRACT_TIMESTAMP TRUE)

set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_COMMON ON CACHE BOOL "" FORCE)
set(LLAMA_BUILD_MTMD ON CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TOOLS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_APP OFF CACHE BOOL "" FORCE)
set(LLAMA_OPENSSL OFF CACHE BOOL "" FORCE)
set(LLAMA_SUBPROCESS OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
set(GGML_CPU_KLEIDIAI OFF CACHE BOOL "" FORCE)
set(GGML_BACKEND_DL OFF CACHE BOOL "" FORCE)
set(GGML_LLAMAFILE OFF CACHE BOOL "" FORCE)
set(MTMD_VIDEO OFF CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(neolocal)

file(READ "${CMAKE_CURRENT_SOURCE_DIR}/diagnosis.gbnf" DIAGNOSIS_GRAMMAR)
configure_file(diagnosis_grammar.h.in "${CMAKE_CURRENT_BINARY_DIR}/diagnosis_grammar.h" @ONLY)

add_library(farm_ai SHARED farm_ai.cpp)
target_include_directories(farm_ai PRIVATE ${CMAKE_CURRENT_BINARY_DIR} ${neolocal_SOURCE_DIR}/common ${neolocal_SOURCE_DIR}/tools/mtmd)
target_link_libraries(farm_ai PRIVATE llama llama-common mtmd android log)
target_link_options(farm_ai PRIVATE "-Wl,-z,max-page-size=16384")
