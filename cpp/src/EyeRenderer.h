#pragma once

#include "TextOverlay.h"
#include <chrono>
#include "BackgroundVideo.h"
#include "Config.h"
#include "Mesh.h"

#include <GLES3/gl3.h>
#include <glm/glm.hpp>

#include <vector>

class EyeRenderer
{
public:
    EyeRenderer();
    ~EyeRenderer();

    bool start(
        const Config& config
    );

    void handleEvents(
        bool& running
    );

    void render(
        bool faceDetected,
        float faceX,
        float faceY
    );

    void stop();

private:

    TextOverlay textOverlay;
    float idleTargetX = 0.0f;
    float idleTargetY = 0.0f;

    float idleX = 0.0f;
    float idleY = 0.0f;

    std::chrono::steady_clock::time_point lastIdleChange;

    float idleChangeInterval = 2.5f;


    // --------------------------------------------------------
    // Texture loading
    // --------------------------------------------------------

    GLuint loadTexture(
        const char* path
    );

    // --------------------------------------------------------
    // Main renderer setup
    // --------------------------------------------------------

    void createWindows();

    void createResources();

    void cleanupResources();

    // --------------------------------------------------------
    // Background video
    // --------------------------------------------------------

    bool createBackgroundResources();

    void drawBackground();

    BackgroundVideo backgroundVideo;

    GLuint backgroundVAO = 0;
    GLuint backgroundVBO = 0;
    GLuint backgroundShader = 0;

    // --------------------------------------------------------
    // Eye windows / meshes
    // --------------------------------------------------------

    std::vector<EyeWindow> eyes;

    std::vector<Mesh> meshes;

    // --------------------------------------------------------
    // Eye rendering resources
    // --------------------------------------------------------

    GLuint shaderProgram = 0;

    GLuint baseColorTexture = 0;
    GLuint normalTexture = 0;

    // --------------------------------------------------------
    // OpenGL view camera
    // --------------------------------------------------------

    glm::vec3 renderCameraPosition;

    glm::mat4 view =
        glm::mat4(1.0f);

    // --------------------------------------------------------
    // Desktop / physical camera position
    // --------------------------------------------------------

    int desktopWidth = 0;
    int desktopHeight = 0;

    float cameraX = 0.0f;
    float cameraY = 0.0f;

    // --------------------------------------------------------
    // Smoothed face tracking
    // --------------------------------------------------------

    float smoothFaceX = 0.0f;
    float smoothFaceY = 0.0f;

    // --------------------------------------------------------
    // Configuration
    // --------------------------------------------------------

    Config config;

    // --------------------------------------------------------
    // State
    // --------------------------------------------------------

    bool started = false;
};
