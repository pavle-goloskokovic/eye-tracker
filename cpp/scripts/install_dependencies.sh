#!/usr/bin/env bash

set -e

echo "================================="
echo " EyeTracker dependency installer"
echo "================================="
echo

if [ ! -f /etc/os-release ]; then
    echo "ERROR: Cannot determine Linux distribution."
    exit 1
fi

# shellcheck disable=SC1091
source /etc/os-release

echo "Detected:"
echo "  ID:      ${ID:-unknown}"
echo "  ID_LIKE: ${ID_LIKE:-unknown}"
echo

is_debian()
{
    [[ "$ID" == "debian" ]] ||
    [[ "$ID" == "ubuntu" ]] ||
    [[ "$ID" == "raspbian" ]] ||
    [[ "${ID_LIKE:-}" == *"debian"* ]]
}

is_fedora()
{
    [[ "$ID" == "fedora" ]] ||
    [[ "$ID" == "rhel" ]] ||
    [[ "$ID" == "centos" ]] ||
    [[ "${ID_LIKE:-}" == *"fedora"* ]] ||
    [[ "${ID_LIKE:-}" == *"rhel"* ]]
}

is_arch()
{
    [[ "$ID" == "arch" ]] ||
    [[ "$ID" == "manjaro" ]] ||
    [[ "$ID" == "endeavouros" ]] ||
    [[ "${ID_LIKE:-}" == *"arch"* ]]
}


# --------------------------------------------------
# Debian / Ubuntu / Raspberry Pi OS
# --------------------------------------------------

if is_debian; then

    echo "Using Debian/Ubuntu package system..."
    echo

    sudo apt update

    sudo apt install -y \
        build-essential \
        cmake \
        pkg-config \
        git \
        libsdl2-dev \
        libsdl2-image-dev \
        libsdl2-ttf-dev \
        libglm-dev \
        libassimp-dev \
        libopencv-dev \
        libcamera-dev

    # Raspberry Pi OS provides the Raspberry Pi-specific
    # camera applications as rpicam-apps.
    if apt-cache show rpicam-apps >/dev/null 2>&1; then
        echo
        echo "Installing Raspberry Pi camera applications..."
        sudo apt install -y rpicam-apps
    fi


# --------------------------------------------------
# Fedora / RHEL family
# --------------------------------------------------

elif is_fedora; then

    echo "Using Fedora/RHEL package system..."
    echo

    sudo dnf install -y \
        gcc \
        gcc-c++ \
        make \
        cmake \
        pkgconf-pkg-config \
        git \
        SDL2-devel \
        SDL2_image-devel \
        SDL2_ttf-devel \
        glm-devel \
        assimp-devel \
        opencv-devel \
        libcamera-devel


# --------------------------------------------------
# Arch / Manjaro / EndeavourOS
# --------------------------------------------------

elif is_arch; then

    echo "Using Arch package system..."
    echo

    sudo pacman -Syu --needed \
        base-devel \
        cmake \
        pkgconf \
        git \
        sdl2 \
        sdl2_image \
        sdl2_ttf \
        glm \
        assimp \
        opencv \
        libcamera \
        libcamera-tools


# --------------------------------------------------
# Unsupported
# --------------------------------------------------

else

    echo "ERROR: Unsupported Linux distribution."
    echo
    echo "Detected:"
    echo "  ID=${ID:-unknown}"
    echo "  ID_LIKE=${ID_LIKE:-unknown}"
    echo
    echo "Currently supported:"
    echo "  Debian / Ubuntu / Raspberry Pi OS"
    echo "  Fedora / RHEL family"
    echo "  Arch / Manjaro / EndeavourOS"

    exit 1
fi


echo
echo "================================="
echo " Dependencies installed."
echo "================================="
