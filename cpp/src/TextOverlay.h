#pragma once

#include <GLES3/gl3.h>
#include <SDL2/SDL_ttf.h>

#include <chrono>
#include <string>

class TextOverlay
{
public:
    TextOverlay();
    ~TextOverlay();

    bool start(
        const std::string& fontPath,
        int fontSize
    );

    void setVisible(
        bool visible
    );

    void update(
        const std::string& fullText
    );

    void render(
        int screenWidth,
        int screenHeight
    );

    void stop();

private:
    void rebuildTexture();

    TTF_Font* font = nullptr;

    GLuint texture = 0;
    GLuint vao = 0;
    GLuint vbo = 0;
    GLuint shaderProgram = 0;

    std::string targetText;
    std::string visibleText;

    std::chrono::steady_clock::time_point
        lastCharacterTime;

    float characterDelay = 0.08f;

    bool visible = false;
    bool dirty = false;

    int textureWidth = 0;
    int textureHeight = 0;
};
