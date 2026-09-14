#include "Shader.h"

#include <iostream>

// ----------------------------------------------------
// Vertex shader
// ----------------------------------------------------

static const char* vertexShaderSource = R"(

#version 300 es

precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aTexCoord;
layout(location = 3) in vec3 aTangent;

uniform mat4 model;
uniform mat4 view;
uniform mat4 projection;

out vec2 TexCoord;
out vec3 FragPosition;
out vec3 Normal;
out vec3 Tangent;

void main()
{
    vec4 worldPosition =
        model * vec4(aPosition, 1.0);

    FragPosition =
        worldPosition.xyz;

    mat3 normalMatrix =
        transpose(
            inverse(
                mat3(model)
            )
        );

    Normal =
        normalize(
            normalMatrix * aNormal
        );

    Tangent =
        normalize(
            normalMatrix * aTangent
        );

    TexCoord =
        aTexCoord;

    gl_Position =
        projection *
        view *
        worldPosition;
}

)";

// ----------------------------------------------------
// Fragment shader
// ----------------------------------------------------

static const char* fragmentShaderSource = R"(

#version 300 es

precision highp float;

in vec2 TexCoord;
in vec3 FragPosition;
in vec3 Normal;
in vec3 Tangent;

uniform sampler2D baseColorTexture;
uniform sampler2D normalTexture;

uniform bool outerShell;

uniform vec3 cameraPosition;

out vec4 FragColor;

void main()
{
    vec3 V =
        normalize(
            cameraPosition -
            FragPosition
        );

    vec3 lightPosition =
        vec3(
            1.5,
            2.0,
            3.5
        );

    vec3 L =
        normalize(
            lightPosition -
            FragPosition
        );

    vec3 N =
        normalize(Normal);

    // ========================================================
    // MAIN EYEBALL
    // ========================================================

    if (!outerShell)
    {
        vec3 baseColor =
            texture(
                baseColorTexture,
                TexCoord
            ).rgb;

        float diffuse =
            max(
                dot(N, L),
                0.0
            );

        vec3 H =
            normalize(
                L + V
            );

        float specular =
            pow(
                max(
                    dot(N, H),
                    0.0
                ),
                128.0
            );

        vec3 ambient =
            baseColor * 0.30;

        vec3 diffuseColor =
            baseColor *
            diffuse *
            0.75;

        vec3 specularColor =
            vec3(1.0) *
            specular *
            0.45;

        vec3 finalColor =
            ambient +
            diffuseColor +
            specularColor;

        FragColor =
            vec4(
                finalColor,
                1.0
            );

        return;
    }

    // ========================================================
    // OUTER SHELL
    // ========================================================

    float facing =
        max(
            dot(N, V),
            0.0
        );

    float fresnel =
        pow(
            1.0 - facing,
            2.5
        );

    vec3 H =
        normalize(
            L + V
        );

    float specular =
        pow(
            max(
                dot(N, H),
                0.0
            ),
            96.0
        );

    vec3 glassColor =
        vec3(
            0.85,
            0.92,
            1.0
        );

    float alpha =
        0.08 +
        fresnel * 0.32 +
        specular * 0.45;

    alpha =
        clamp(
            alpha,
            0.08,
            0.55
        );

    vec3 finalShellColor =
        glassColor *
        (
            0.35 +
            fresnel * 0.65 +
            specular * 0.8
        );

    FragColor =
        vec4(
            finalShellColor,
            alpha
        );
}

)";

// ----------------------------------------------------
// Compile one shader
// ----------------------------------------------------

static GLuint compileShader(
    GLenum type,
    const char* source
)
{
    GLuint shader =
        glCreateShader(type);

    glShaderSource(
        shader,
        1,
        &source,
        nullptr
    );

    glCompileShader(shader);

    GLint success = 0;

    glGetShaderiv(
        shader,
        GL_COMPILE_STATUS,
        &success
    );

    if (!success)
    {
        char log[2048];

        glGetShaderInfoLog(
            shader,
            sizeof(log),
            nullptr,
            log
        );

        std::cerr
            << "Shader compilation failed:\n"
            << log
            << '\n';
    }

    return shader;
}

// ----------------------------------------------------
// Create full shader program
// ----------------------------------------------------

GLuint createShaderProgram()
{
    GLuint vertexShader =
        compileShader(
            GL_VERTEX_SHADER,
            vertexShaderSource
        );

    GLuint fragmentShader =
        compileShader(
            GL_FRAGMENT_SHADER,
            fragmentShaderSource
        );

    GLuint program =
        glCreateProgram();

    glAttachShader(
        program,
        vertexShader
    );

    glAttachShader(
        program,
        fragmentShader
    );

    glLinkProgram(program);

    GLint success = 0;

    glGetProgramiv(
        program,
        GL_LINK_STATUS,
        &success
    );

    if (!success)
    {
        char log[2048];

        glGetProgramInfoLog(
            program,
            sizeof(log),
            nullptr,
            log
        );

        std::cerr
            << "Shader linking failed:\n"
            << log
            << '\n';
    }

    glDeleteShader(vertexShader);
    glDeleteShader(fragmentShader);

    return program;
}
