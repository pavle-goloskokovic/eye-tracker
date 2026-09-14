cmake_minimum_required(VERSION 3.16)

project(EyeTracker)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_SOURCE_DIR})

# ------------------------------------------------------------
# Packages
# ------------------------------------------------------------

find_package(PkgConfig REQUIRED)
find_package(SDL2_ttf REQUIRED)
find_package(OpenCV REQUIRED)

pkg_check_modules(
    SDL2
    REQUIRED
    sdl2
)

pkg_check_modules(
    SDL2_IMAGE
    REQUIRED
    SDL2_image
)

pkg_check_modules(
    LIBCAMERA
    REQUIRED
    libcamera
)

find_package(assimp REQUIRED)

# ------------------------------------------------------------
# Executable
# ------------------------------------------------------------

add_executable(
    eye_project
    
    src/TextOverlay.cpp
    src/main.cpp
    src/Camera.cpp
    src/Mesh.cpp
    src/Model.cpp
    src/Shader.cpp
    src/EyeRenderer.cpp
    src/Config.cpp
    src/BackgroundVideo.cpp

    # We will add these later when we refactor:
    # src/Shader.cpp
    # src/Mesh.cpp
    # src/Model.cpp
)

# ------------------------------------------------------------
# Include directories
# ------------------------------------------------------------

target_include_directories(
    eye_project
    PRIVATE

    src

    ${OpenCV_INCLUDE_DIRS}

    ${SDL2_INCLUDE_DIRS}
    ${SDL2_IMAGE_INCLUDE_DIRS}
    ${LIBCAMERA_INCLUDE_DIRS}
)

# ------------------------------------------------------------
# Library directories
# ------------------------------------------------------------

target_link_directories(
    eye_project
    PRIVATE
    ${SDL2_LIBRARY_DIRS}
    ${SDL2_IMAGE_LIBRARY_DIRS}
    ${LIBCAMERA_LIBRARY_DIRS}
)

# ------------------------------------------------------------
# Compiler flags from pkg-config
# ------------------------------------------------------------

target_compile_options(
    eye_project
    PRIVATE

    ${SDL2_CFLAGS_OTHER}
    ${SDL2_IMAGE_CFLAGS_OTHER}
    ${LIBCAMERA_CFLAGS_OTHER}
)

# ------------------------------------------------------------
# Libraries
# ------------------------------------------------------------

target_link_libraries(
    eye_project
    PRIVATE

    ${OpenCV_LIBS}

    ${SDL2_LIBRARIES}
    ${SDL2_IMAGE_LIBRARIES}
    ${LIBCAMERA_LIBRARIES}
    SDL2_ttf::SDL2_ttf
    assimp::assimp

    GLESv2
)
