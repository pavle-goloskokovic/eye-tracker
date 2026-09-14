#pragma once

#include <memory>

struct FacePosition
{
    bool detected = false;

    // Normalized position:
    //
    // x = -1 left
    // x =  0 center
    // x = +1 right
    //
    // y = -1 top
    // y =  0 center
    // y = +1 bottom

    float x = 0.0f;
    float y = 0.0f;

    // Useful later for distance estimation.
    float size = 0.0f;

    int boxX = 0;
    int boxY = 0;
    int boxW = 0;
    int boxH = 0;
};


class Camera
{
public:
    Camera();
    ~Camera();

    bool start();

    FacePosition update();
    
    void showPreview();
    void stop();

private:
    struct Impl;

    std::unique_ptr<Impl> impl;
};
