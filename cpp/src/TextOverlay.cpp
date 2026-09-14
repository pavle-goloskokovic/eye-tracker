#include "TextOverlay.h"

#include <SDL2/SDL.h>

#include <iostream>

static const char* textVertexShaderSource = R"(

#version 300 es

precision highp float;

layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec2 aTexCoord;

out vec2 TexCoord;

void main()
{
    TexCoord = aTexCoord;

    gl_Position =
        vec4(
            aPosition,
            0.0,
            1.0
        );
}

)";


static const char* textFragmentShaderSource = R"(

#version 300 es

precision highp float;

in vec2 TexCoord;

uniform sampler2D textTexture;

out vec4 FragColor;

void main()
{
    FragColor =
        texture(
            textTexture,
            TexCoord
        );
}

)";


static GLuint compileTextShader(
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
        char log[1024];

        glGetShaderInfoLog(
            shader,
            sizeof(log),
            nullptr,
            log
        );

        std::cerr
            << "Text shader compile failed:\n"
            << log
            << '\n';
    }

    return shader;
}


TextOverlay::TextOverlay()
{
}


TextOverlay::~TextOverlay()
{
    stop();
}


bool TextOverlay::start(
    const std::string& fontPath,
    int fontSize
)
{
    if (TTF_WasInit() == 0)
    {
        if (TTF_Init() != 0)
        {
            std::cerr
                << "TTF_Init failed: "
                << TTF_GetError()
                << '\n';

            return false;
        }
    }

    font =
        TTF_OpenFont(
            fontPath.c_str(),
            fontSize
        );

    if (!font)
    {
        std::cerr
            << "Could not load font: "
            << fontPath
            << '\n';

        return false;
    }

    GLuint vertexShader =
        compileTextShader(
            GL_VERTEX_SHADER,
            textVertexShaderSource
        );

    GLuint fragmentShader =
        compileTextShader(
            GL_FRAGMENT_SHADER,
            textFragmentShaderSource
        );

    shaderProgram =
        glCreateProgram();

    glAttachShader(
        shaderProgram,
        vertexShader
    );

    glAttachShader(
        shaderProgram,
        fragmentShader
    );

    glLinkProgram(
        shaderProgram
    );

    glDeleteShader(vertexShader);
    glDeleteShader(fragmentShader);

    glGenVertexArrays(
        1,
        &vao
    );

    glGenBuffers(
        1,
        &vbo
    );

    glGenTextures(
        1,
        &texture
    );

    glBindTexture(
        GL_TEXTURE_2D,
        texture
    );

    glTexParameteri(
        GL_TEXTURE_2D,
        GL_TEXTURE_MIN_FILTER,
        GL_LINEAR
    );

    glTexParameteri(
        GL_TEXTURE_2D,
        GL_TEXTURE_MAG_FILTER,
        GL_LINEAR
    );

    glTexParameteri(
        GL_TEXTURE_2D,
        GL_TEXTURE_WRAP_S,
        GL_CLAMP_TO_EDGE
    );

    glTexParameteri(
        GL_TEXTURE_2D,
        GL_TEXTURE_WRAP_T,
        GL_CLAMP_TO_EDGE
    );

    glBindTexture(
        GL_TEXTURE_2D,
        0
    );

    lastCharacterTime =
        std::chrono::steady_clock::now();

    return true;
}


void TextOverlay::setVisible(
    bool newVisible
)
{
    if (visible == newVisible)
    {
        return;
    }

    visible =
        newVisible;

    if (!visible)
    {
        visibleText.clear();
        targetText.clear();
        dirty = true;
    }

    lastCharacterTime =
        std::chrono::steady_clock::now();
}


void TextOverlay::update(
    const std::string& fullText
)
{
    if (!visible)
    {
        return;
    }

    if (targetText != fullText)
    {
        targetText =
            fullText;

        visibleText.clear();

        dirty = true;

        lastCharacterTime =
            std::chrono::steady_clock::now();
    }

    if (visibleText.size() >=
        targetText.size())
    {
        return;
    }

    auto now =
        std::chrono::steady_clock::now();

    float elapsed =
        std::chrono::duration<float>(
            now - lastCharacterTime
        ).count();

    if (elapsed >= characterDelay)
    {
        visibleText.push_back(
            targetText[
                visibleText.size()
            ]
        );

        lastCharacterTime =
            now;

        dirty = true;
    }

    if (dirty)
    {
        rebuildTexture();
    }
}


void TextOverlay::rebuildTexture()
{
    if (!font)
    {
        return;
    }

    if (visibleText.empty())
    {
        return;
    }

    SDL_Color outlineColor =
    {
        255,
        0,
        0,
        255
    };

    SDL_Color innerColor =
    {
        255,
        230,
        230,
        255
    };

    SDL_Surface* outline =
        TTF_RenderUTF8_Blended(
            font,
            visibleText.c_str(),
            outlineColor
        );

    SDL_Surface* inner =
        TTF_RenderUTF8_Blended(
            font,
            visibleText.c_str(),
            innerColor
        );

    if (!outline ||
        !inner)
    {
        if (outline)
        {
            SDL_FreeSurface(outline);
        }

        if (inner)
        {
            SDL_FreeSurface(inner);
        }

        return;
    }

    const int border = 3;

    textureWidth =
        outline->w +
        border * 2;

    textureHeight =
        outline->h +
        border * 2;

    SDL_Surface* combined =
        SDL_CreateRGBSurfaceWithFormat(
            0,
            textureWidth,
            textureHeight,
            32,
            SDL_PIXELFORMAT_RGBA32
        );

    SDL_FillRect(
        combined,
        nullptr,
        SDL_MapRGBA(
            combined->format,
            0,
            0,
            0,
            0
        )
    );

    SDL_Rect dst;

    const int offsets[][2] =
    {
        {-border, 0},
        { border, 0},
        {0, -border},
        {0,  border},
        {-border, -border},
        { border, -border},
        {-border,  border},
        { border,  border}
    };

    for (const auto& offset : offsets)
    {
        dst.x =
            border +
            offset[0];

        dst.y =
            border +
            offset[1];

        SDL_BlitSurface(
            outline,
            nullptr,
            combined,
            &dst
        );
    }

    dst.x = border;
    dst.y = border;

    SDL_BlitSurface(
        inner,
        nullptr,
        combined,
        &dst
    );

    glBindTexture(
        GL_TEXTURE_2D,
        texture
    );

    glTexImage2D(
        GL_TEXTURE_2D,
        0,
        GL_RGBA,
        combined->w,
        combined->h,
        0,
        GL_RGBA,
        GL_UNSIGNED_BYTE,
        combined->pixels
    );

    glBindTexture(
        GL_TEXTURE_2D,
        0
    );

    SDL_FreeSurface(outline);
    SDL_FreeSurface(inner);
    SDL_FreeSurface(combined);

    dirty = false;
}


void TextOverlay::render(
    int screenWidth,
    int screenHeight
)
{
    if (!visible ||
        visibleText.empty() ||
        textureWidth <= 0 ||
        textureHeight <= 0)
    {
        return;
    }

    float widthNdc =
        static_cast<float>(
            textureWidth
        ) /
        static_cast<float>(
            screenWidth
        ) *
        2.0f;

    float heightNdc =
        static_cast<float>(
            textureHeight
        ) /
        static_cast<float>(
            screenHeight
        ) *
        2.0f;

    float centerX = 0.0f;

    float bottomMargin =
        0.08f;

    float centerY =
        -1.0f +
        bottomMargin +
        heightNdc * 0.5f;

    float left =
        centerX -
        widthNdc * 0.5f;

    float right =
        centerX +
        widthNdc * 0.5f;

    float bottom =
        centerY -
        heightNdc * 0.5f;

    float top =
        centerY +
        heightNdc * 0.5f;

    float vertices[] =
    {
        left,  bottom,  0.0f, 1.0f,
        right, bottom,  1.0f, 1.0f,
        right, top,     1.0f, 0.0f,

        left,  bottom,  0.0f, 1.0f,
        right, top,     1.0f, 0.0f,
        left,  top,     0.0f, 0.0f
    };

    glDisable(
        GL_DEPTH_TEST
    );

    glEnable(
        GL_BLEND
    );

    glBlendFunc(
        GL_SRC_ALPHA,
        GL_ONE_MINUS_SRC_ALPHA
    );

    glUseProgram(
        shaderProgram
    );

    glActiveTexture(
        GL_TEXTURE0
    );

    glBindTexture(
        GL_TEXTURE_2D,
        texture
    );

    glUniform1i(
        glGetUniformLocation(
            shaderProgram,
            "textTexture"
        ),
        0
    );

    glBindVertexArray(
        vao
    );

    glBindBuffer(
        GL_ARRAY_BUFFER,
        vbo
    );

    glBufferData(
        GL_ARRAY_BUFFER,
        sizeof(vertices),
        vertices,
        GL_DYNAMIC_DRAW
    );

    glVertexAttribPointer(
        0,
        2,
        GL_FLOAT,
        GL_FALSE,
        4 * sizeof(float),
        reinterpret_cast<void*>(0)
    );

    glEnableVertexAttribArray(0);

    glVertexAttribPointer(
        1,
        2,
        GL_FLOAT,
        GL_FALSE,
        4 * sizeof(float),
        reinterpret_cast<void*>(
            2 * sizeof(float)
        )
    );

    glEnableVertexAttribArray(1);

    glDrawArrays(
        GL_TRIANGLES,
        0,
        6
    );

    glBindVertexArray(0);

    glDisable(
        GL_BLEND
    );

    glEnable(
        GL_DEPTH_TEST
    );
}


void TextOverlay::stop()
{
    if (texture)
    {
        glDeleteTextures(
            1,
            &texture
        );

        texture = 0;
    }

    if (vbo)
    {
        glDeleteBuffers(
            1,
            &vbo
        );

        vbo = 0;
    }

    if (vao)
    {
        glDeleteVertexArrays(
            1,
            &vao
        );

        vao = 0;
    }

    if (shaderProgram)
    {
        glDeleteProgram(
            shaderProgram
        );

        shaderProgram = 0;
    }

    if (font)
    {
        TTF_CloseFont(
            font
        );

        font = nullptr;
    }
}
