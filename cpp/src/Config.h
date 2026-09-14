#pragma once

#include <string>

struct Config
{
    float cameraOffsetX = 0.0f;
    float cameraOffsetY = 0.0f;

    float maxYaw = 30.0f;
    float maxPitch = 22.0f;

    int windowWidth = 300;
    int windowHeight = 300;

    float backgroundR = 0.04f;
    float backgroundG = 0.04f;
    float backgroundB = 0.04f;

    bool load(
        const std::string& path
    );
};
