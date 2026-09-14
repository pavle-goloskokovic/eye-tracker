#pragma once

#include <SDL2/SDL.h>
#include <GLES3/gl3.h>

#include <glm/glm.hpp>

#include <string>
#include <vector>

// ----------------------------------------------------
// One eye window + its OpenGL context
// ----------------------------------------------------

struct EyeWindow
{
    SDL_Window* window = nullptr;
    SDL_GLContext context = nullptr;

    int width = 300;
    int height = 300;
};

// ----------------------------------------------------
// Vertex stored in the eye mesh
// ----------------------------------------------------

struct Vertex
{
    glm::vec3 position;
    glm::vec3 normal;
    glm::vec2 uv;
    glm::vec3 tangent;
};

// ----------------------------------------------------
// One mesh from the GLB model
// ----------------------------------------------------

struct Mesh
{
    // VAOs are NOT shared between OpenGL contexts,
    // so we keep one VAO per eye window.
    std::vector<GLuint> VAOs;

    // VBO / EBO are shared between contexts.
    GLuint VBO = 0;
    GLuint EBO = 0;

    unsigned int indexCount = 0;

    glm::mat4 nodeTransform =
        glm::mat4(1.0f);

    bool outerShell = false;

    std::string name;
};

// ----------------------------------------------------
// Creates the VAO for one mesh in one OpenGL context
// ----------------------------------------------------

void createVAOForContext(
    Mesh& mesh,
    EyeWindow& eye
);
