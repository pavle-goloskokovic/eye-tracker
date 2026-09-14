#include "Camera.h"
#include "Config.h"
#include "EyeRenderer.h"

#include <iostream>

int main()
{
    Config config;

    if (!config.load(
            "config/config.ini"
        ))
    {
        std::cerr
            << "Using default configuration.\n";
    }

    EyeRenderer renderer;

    if (!renderer.start(config))
    {
        std::cerr
            << "Eye renderer failed to start.\n";

        return 1;
    }

    Camera faceCamera;

    if (!faceCamera.start())
    {
        std::cerr
            << "Face camera failed to start.\n";

        return 1;
    }

    bool running = true;

    while (running)
    {
        renderer.handleEvents(
            running
        );

        FacePosition face =
            faceCamera.update();

        faceCamera.showPreview();

        renderer.render(
            face.detected,
            face.x,
            face.y
        );
    }

    faceCamera.stop();
    renderer.stop();

    return 0;
}
