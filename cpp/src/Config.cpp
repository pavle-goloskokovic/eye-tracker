#include "Config.h"

#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

bool Config::load(
    const std::string& path
)
{
    std::ifstream file(path);

    if (!file.is_open())
    {
        std::cerr
            << "Could not open config file: "
            << path
            << '\n';

        return false;
    }

    std::string section;
    std::string line;

    while (std::getline(file, line))
    {
        if (line.empty())
        {
            continue;
        }

        if (line[0] == '#')
        {
            continue;
        }

        if (line.front() == '[' &&
            line.back() == ']')
        {
            section =
                line.substr(
                    1,
                    line.size() - 2
                );

            continue;
        }

        std::size_t equals =
            line.find('=');

        if (equals ==
            std::string::npos)
        {
            continue;
        }

        std::string key =
            line.substr(
                0,
                equals
            );

        std::string value =
            line.substr(
                equals + 1
            );

        try
        {
            if (section == "Camera")
            {
                if (key == "offsetX")
                {
                    cameraOffsetX =
                        std::stof(value);
                }
                else if (key == "offsetY")
                {
                    cameraOffsetY =
                        std::stof(value);
                }
            }

            else if (section == "Tracking")
            {
                if (key == "maxYaw")
                {
                    maxYaw =
                        std::stof(value);
                }
                else if (key == "maxPitch")
                {
                    maxPitch =
                        std::stof(value);
                }
            }

            else if (section == "Windows")
            {
                if (key == "width")
                {
                    windowWidth =
                        std::stoi(value);
                }
                else if (key == "height")
                {
                    windowHeight =
                        std::stoi(value);
                }
            }

            else if (section == "Background")
            {
                if (key == "r")
                {
                    backgroundR =
                        std::stof(value);
                }
                else if (key == "g")
                {
                    backgroundG =
                        std::stof(value);
                }
                else if (key == "b")
                {
                    backgroundB =
                        std::stof(value);
                }
            }
        }
        catch (...)
        {
            std::cerr
                << "Invalid config value: "
                << line
                << '\n';
        }
    }

    std::cout
        << "Loaded config: "
        << path
        << '\n';

    return true;
}
