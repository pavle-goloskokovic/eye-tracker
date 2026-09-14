#pragma once

#include "Mesh.h"

#include <string>
#include <vector>

// Loads a GLB/GLTF model and returns all of its meshes.
std::vector<Mesh> loadModel(
    const std::string& path
);
