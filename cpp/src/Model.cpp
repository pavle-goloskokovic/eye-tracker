#include "Model.h"

#include <assimp/Importer.hpp>
#include <assimp/scene.h>
#include <assimp/postprocess.h>

#include <glm/glm.hpp>

#include <iostream>
#include <vector>

// ----------------------------------------------------
// Convert Assimp matrix to GLM matrix
// ----------------------------------------------------

static glm::mat4 assimpToGlm(
    const aiMatrix4x4& m
)
{
    return glm::mat4(
        m.a1, m.b1, m.c1, m.d1,
        m.a2, m.b2, m.c2, m.d2,
        m.a3, m.b3, m.c3, m.d3,
        m.a4, m.b4, m.c4, m.d4
    );
}


// ----------------------------------------------------
// Convert one Assimp mesh into our Mesh structure
// ----------------------------------------------------

static Mesh loadMesh(
    aiMesh* assimpMesh,
    const glm::mat4& nodeTransform,
    bool outerShell
)
{
    Mesh mesh;

    mesh.name =
        assimpMesh->mName.C_Str();

    mesh.nodeTransform =
        nodeTransform;

    mesh.outerShell =
        outerShell;

    std::vector<Vertex> vertices;
    std::vector<unsigned int> indices;

    vertices.reserve(
        assimpMesh->mNumVertices
    );

    // ------------------------------------------------
    // Vertices
    // ------------------------------------------------

    for (unsigned int i = 0;
         i < assimpMesh->mNumVertices;
         ++i)
    {
        Vertex vertex{};

        vertex.position =
            glm::vec3(
                assimpMesh->mVertices[i].x,
                assimpMesh->mVertices[i].y,
                assimpMesh->mVertices[i].z
            );

        if (assimpMesh->HasNormals())
        {
            vertex.normal =
                glm::vec3(
                    assimpMesh->mNormals[i].x,
                    assimpMesh->mNormals[i].y,
                    assimpMesh->mNormals[i].z
                );
        }

        if (assimpMesh->HasTextureCoords(0))
        {
            vertex.uv =
                glm::vec2(
                    assimpMesh->mTextureCoords[0][i].x,
                    assimpMesh->mTextureCoords[0][i].y
                );
        }

        if (assimpMesh->HasTangentsAndBitangents())
        {
            vertex.tangent =
                glm::vec3(
                    assimpMesh->mTangents[i].x,
                    assimpMesh->mTangents[i].y,
                    assimpMesh->mTangents[i].z
                );
        }
        else
        {
            vertex.tangent =
                glm::vec3(
                    1.0f,
                    0.0f,
                    0.0f
                );
        }

        vertices.push_back(
            vertex
        );
    }

    // ------------------------------------------------
    // Indices
    // ------------------------------------------------

    for (unsigned int i = 0;
         i < assimpMesh->mNumFaces;
         ++i)
    {
        aiFace& face =
            assimpMesh->mFaces[i];

        for (unsigned int j = 0;
             j < face.mNumIndices;
             ++j)
        {
            indices.push_back(
                face.mIndices[j]
            );
        }
    }

    mesh.indexCount =
        static_cast<unsigned int>(
            indices.size()
        );

    // ------------------------------------------------
    // Shared VBO
    // ------------------------------------------------

    glGenBuffers(
        1,
        &mesh.VBO
    );

    glBindBuffer(
        GL_ARRAY_BUFFER,
        mesh.VBO
    );

    glBufferData(
        GL_ARRAY_BUFFER,
        vertices.size() * sizeof(Vertex),
        vertices.data(),
        GL_STATIC_DRAW
    );

    // ------------------------------------------------
    // Shared EBO
    // ------------------------------------------------

    glGenBuffers(
        1,
        &mesh.EBO
    );

    glBindBuffer(
        GL_ELEMENT_ARRAY_BUFFER,
        mesh.EBO
    );

    glBufferData(
        GL_ELEMENT_ARRAY_BUFFER,
        indices.size() * sizeof(unsigned int),
        indices.data(),
        GL_STATIC_DRAW
    );

    std::cout
        << "Loaded mesh: "
        << mesh.name
        << " | outer shell: "
        << (outerShell ? "yes" : "no")
        << '\n';

    return mesh;
}


// ----------------------------------------------------
// Recursively process GLB nodes
// ----------------------------------------------------

static void processNode(
    aiNode* node,
    const aiScene* scene,
    const glm::mat4& parentTransform,
    std::vector<Mesh>& meshes
)
{
    glm::mat4 localTransform =
        assimpToGlm(
            node->mTransformation
        );

    glm::mat4 worldTransform =
        parentTransform *
        localTransform;

    std::string nodeName =
        node->mName.C_Str();

    // Your GLB uses the node named "out"
    // for the transparent outer eye shell.
    bool outerShell =
        nodeName == "out";

    // ------------------------------------------------
    // Meshes belonging to this node
    // ------------------------------------------------

    for (unsigned int i = 0;
         i < node->mNumMeshes;
         ++i)
    {
        unsigned int meshIndex =
            node->mMeshes[i];

        aiMesh* assimpMesh =
            scene->mMeshes[
                meshIndex
            ];

        meshes.push_back(
            loadMesh(
                assimpMesh,
                worldTransform,
                outerShell
            )
        );
    }

    // ------------------------------------------------
    // Child nodes
    // ------------------------------------------------

    for (unsigned int i = 0;
         i < node->mNumChildren;
         ++i)
    {
        processNode(
            node->mChildren[i],
            scene,
            worldTransform,
            meshes
        );
    }
}


// ----------------------------------------------------
// Public model loading function
// ----------------------------------------------------

std::vector<Mesh> loadModel(
    const std::string& path
)
{
    Assimp::Importer importer;

    const aiScene* scene =
        importer.ReadFile(
            path,

            aiProcess_Triangulate |
            aiProcess_GenSmoothNormals |
            aiProcess_CalcTangentSpace |
            aiProcess_JoinIdenticalVertices |
            aiProcess_FlipUVs
        );

    if (!scene ||
        !scene->mRootNode ||
        (scene->mFlags &
         AI_SCENE_FLAGS_INCOMPLETE))
    {
        std::cerr
            << "Failed to load model:\n"
            << importer.GetErrorString()
            << '\n';

        return {};
    }

    std::vector<Mesh> meshes;

    processNode(
        scene->mRootNode,
        scene,
        glm::mat4(1.0f),
        meshes
    );

    std::cout
        << "Loaded model: "
        << path
        << '\n';

    std::cout
        << "Mesh count: "
        << meshes.size()
        << '\n';

    return meshes;
}
