#include "Mesh.h"

#include <cstddef>

void createVAOForContext(
    Mesh& mesh,
    EyeWindow& eye
)
{
    SDL_GL_MakeCurrent(
        eye.window,
        eye.context
    );

    GLuint vao = 0;

    glGenVertexArrays(
        1,
        &vao
    );

    glBindVertexArray(
        vao
    );

    // ------------------------------------------------
    // Shared VBO
    // ------------------------------------------------

    glBindBuffer(
        GL_ARRAY_BUFFER,
        mesh.VBO
    );

    // ------------------------------------------------
    // Shared EBO
    // ------------------------------------------------

    glBindBuffer(
        GL_ELEMENT_ARRAY_BUFFER,
        mesh.EBO
    );

    // ------------------------------------------------
    // Position
    // ------------------------------------------------

    glVertexAttribPointer(
        0,
        3,
        GL_FLOAT,
        GL_FALSE,
        sizeof(Vertex),
        reinterpret_cast<void*>(
            offsetof(
                Vertex,
                position
            )
        )
    );

    glEnableVertexAttribArray(0);

    // ------------------------------------------------
    // Normal
    // ------------------------------------------------

    glVertexAttribPointer(
        1,
        3,
        GL_FLOAT,
        GL_FALSE,
        sizeof(Vertex),
        reinterpret_cast<void*>(
            offsetof(
                Vertex,
                normal
            )
        )
    );

    glEnableVertexAttribArray(1);

    // ------------------------------------------------
    // UV
    // ------------------------------------------------

    glVertexAttribPointer(
        2,
        2,
        GL_FLOAT,
        GL_FALSE,
        sizeof(Vertex),
        reinterpret_cast<void*>(
            offsetof(
                Vertex,
                uv
            )
        )
    );

    glEnableVertexAttribArray(2);

    // ------------------------------------------------
    // Tangent
    // ------------------------------------------------

    glVertexAttribPointer(
        3,
        3,
        GL_FLOAT,
        GL_FALSE,
        sizeof(Vertex),
        reinterpret_cast<void*>(
            offsetof(
                Vertex,
                tangent
            )
        )
    );

    glEnableVertexAttribArray(3);

    glBindVertexArray(0);

    mesh.VAOs.push_back(
        vao
    );
}
