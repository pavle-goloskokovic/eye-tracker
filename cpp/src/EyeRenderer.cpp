#include "EyeRenderer.h"

#include <cmath>

#include "Model.h"
#include "Shader.h"

#include <SDL2/SDL.h>
#include <SDL2/SDL_image.h>

#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtc/type_ptr.hpp>

#include <iostream>


static const char* backgroundVertexShaderSource = R"(

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


static const char* backgroundFragmentShaderSource = R"(

#version 300 es

precision highp float;

in vec2 TexCoord;

uniform sampler2D backgroundTexture;

out vec4 FragColor;

void main()
{
    FragColor =
        texture(
            backgroundTexture,
            TexCoord
        );
}

)";


static GLuint compileBackgroundShader(
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
            << "Background shader compilation failed:\n"
            << log
            << '\n';
    }

    return shader;
}


// ============================================================
// Constructor / Destructor
// ============================================================

EyeRenderer::EyeRenderer()
{
}

EyeRenderer::~EyeRenderer()
{
    stop();
}



bool EyeRenderer::createBackgroundResources()
{
    SDL_GL_MakeCurrent(
        eyes[0].window,
        eyes[0].context
    );

    // --------------------------------------------------------
    // Background shader
    // --------------------------------------------------------

    GLuint vertexShader =
        compileBackgroundShader(
            GL_VERTEX_SHADER,
            backgroundVertexShaderSource
        );

    GLuint fragmentShader =
        compileBackgroundShader(
            GL_FRAGMENT_SHADER,
            backgroundFragmentShaderSource
        );

    backgroundShader =
        glCreateProgram();

    glAttachShader(
        backgroundShader,
        vertexShader
    );

    glAttachShader(
        backgroundShader,
        fragmentShader
    );

    glLinkProgram(
        backgroundShader
    );

    GLint success = 0;

    glGetProgramiv(
        backgroundShader,
        GL_LINK_STATUS,
        &success
    );

    if (!success)
    {
        char log[2048];

        glGetProgramInfoLog(
            backgroundShader,
            sizeof(log),
            nullptr,
            log
        );

        std::cerr
            << "Background shader linking failed:\n"
            << log
            << '\n';

        glDeleteShader(vertexShader);
        glDeleteShader(fragmentShader);

        return false;
    }

    glDeleteShader(vertexShader);
    glDeleteShader(fragmentShader);

    // --------------------------------------------------------
    // Fullscreen quad
    // --------------------------------------------------------

    float quadVertices[] =
    {
        // position    // uv

        -1.0f, -1.0f,  0.0f, 1.0f,
         1.0f, -1.0f,  1.0f, 1.0f,
         1.0f,  1.0f,  1.0f, 0.0f,

        -1.0f, -1.0f,  0.0f, 1.0f,
         1.0f,  1.0f,  1.0f, 0.0f,
        -1.0f,  1.0f,  0.0f, 0.0f
    };

    glGenVertexArrays(
        1,
        &backgroundVAO
    );

    glGenBuffers(
        1,
        &backgroundVBO
    );

    glBindVertexArray(
        backgroundVAO
    );

    glBindBuffer(
        GL_ARRAY_BUFFER,
        backgroundVBO
    );

    glBufferData(
        GL_ARRAY_BUFFER,
        sizeof(quadVertices),
        quadVertices,
        GL_STATIC_DRAW
    );

    // position
    glVertexAttribPointer(
        0,
        2,
        GL_FLOAT,
        GL_FALSE,
        4 * sizeof(float),
        reinterpret_cast<void*>(0)
    );

    glEnableVertexAttribArray(0);

    // uv
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

    glBindVertexArray(0);

    return true;
}


void EyeRenderer::drawBackground()
{
    if (backgroundShader == 0 ||
        backgroundVAO == 0)
    {
        return;
    }

    glDisable(
        GL_DEPTH_TEST
    );

    glDisable(
        GL_BLEND
    );

    glUseProgram(
        backgroundShader
    );

    glActiveTexture(
        GL_TEXTURE0
    );

    glBindTexture(
        GL_TEXTURE_2D,
        backgroundVideo.getTexture()
    );

    glUniform1i(
        glGetUniformLocation(
            backgroundShader,
            "backgroundTexture"
        ),
        0
    );

    glBindVertexArray(
        backgroundVAO
    );

    glDrawArrays(
        GL_TRIANGLES,
        0,
        6
    );

    glBindVertexArray(0);

    glEnable(
        GL_DEPTH_TEST
    );
}


// ============================================================
// Texture loading
// ============================================================

GLuint EyeRenderer::loadTexture(
    const char* path
)
{
    SDL_Surface* surface =
        IMG_Load(path);

    if (!surface)
    {
        std::cerr
            << "Could not load texture: "
            << path
            << '\n';

        return 0;
    }

    SDL_Surface* converted =
        SDL_ConvertSurfaceFormat(
            surface,
            SDL_PIXELFORMAT_RGBA32,
            0
        );

    SDL_FreeSurface(surface);

    if (!converted)
    {
        std::cerr
            << "Texture conversion failed: "
            << path
            << '\n';

        return 0;
    }

    GLuint texture = 0;

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
        GL_LINEAR_MIPMAP_LINEAR
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

    glTexImage2D(
        GL_TEXTURE_2D,
        0,
        GL_RGBA,
        converted->w,
        converted->h,
        0,
        GL_RGBA,
        GL_UNSIGNED_BYTE,
        converted->pixels
    );

    glGenerateMipmap(
        GL_TEXTURE_2D
    );

    glBindTexture(
        GL_TEXTURE_2D,
        0
    );

    SDL_FreeSurface(
        converted
    );

    std::cout
        << "Loaded texture: "
        << path
        << '\n';

    return texture;
}


// ============================================================
// Create four eye windows
// ============================================================

void EyeRenderer::createWindows()
{
    eyes.resize(1);

    const int eyeWidth = config.windowWidth;
    const int eyeHeight = config.windowHeight;

    //int positions[4][2] =
    //{
        //{100, 100},
        //{500, 100},
        //{100, 500},
        //{500, 500}
    //};

    // --------------------------------------------------------
    // First window/context
    // --------------------------------------------------------

    eyes[0].width =
        eyeWidth;

    eyes[0].height =
        eyeHeight;

    //eyes[0].window =
        //SDL_CreateWindow(
            //"Eye 1",
            //positions[0][0],
            //positions[0][1],
            //eyeWidth,
            //eyeHeight,
             //SDL_WINDOW_OPENGL |
            //SDL_WINDOW_RESIZABLE
        //);
    eyes[0].window =
        SDL_CreateWindow(
        "Eye",
        SDL_WINDOWPOS_CENTERED,
        SDL_WINDOWPOS_CENTERED,
        eyeWidth,
        eyeHeight,
        SDL_WINDOW_OPENGL |
        SDL_WINDOW_FULLSCREEN_DESKTOP
    );

    if (!eyes[0].window)
    {
        std::cerr
            << "Could not create Eye 1 window: "
            << SDL_GetError()
            << '\n';

        return;
    }

    eyes[0].context =
        SDL_GL_CreateContext(
            eyes[0].window
        );

    if (!eyes[0].context)
    {
        std::cerr
            << "Could not create Eye 1 context: "
            << SDL_GetError()
            << '\n';

        return;
    }

    SDL_GL_MakeCurrent(
        eyes[0].window,
        eyes[0].context
    );
    
    // Enable VSync
    if (SDL_GL_SetSwapInterval(1) != 0){
        std::cerr
        << "Could not enable VSync: "
        << SDL_GetError()
        << '\n';
    }
    
    else{
    std::cout
        << "VSync enabled\n";
    }

    // Contexts created after this share GL resources.
    SDL_GL_SetAttribute(
        SDL_GL_SHARE_WITH_CURRENT_CONTEXT,
        1
    );

    // --------------------------------------------------------
    // Remaining windows
    // --------------------------------------------------------

    //for (int i = 1;
         //i < 4;
         //++i)
    //{
        //eyes[i].width =
            //eyeWidth;

        //eyes[i].height =
            //eyeHeight;

        //eyes[i].window =
            //SDL_CreateWindow(
                //"Eye",
                //positions[i][0],
                //positions[i][1],
                //eyeWidth,
                //eyeHeight,
                //SDL_WINDOW_OPENGL |
                //SDL_WINDOW_RESIZABLE
            //);

        //if (!eyes[i].window)
        //{
            //std::cerr
                //<< "Could not create eye window "
                //<< i
                //<< ": "
                //<< SDL_GetError()
                //<< '\n';

            //return;
        //}

        //eyes[i].context =
            //SDL_GL_CreateContext(
                //eyes[i].window
            //);

        //if (!eyes[i].context)
        //{
            //std::cerr
                //<< "Could not create eye context "
                //<< i
                //<< ": "
                //<< SDL_GetError()
                //<< '\n';

            //return;
        //}
    //}
	
    // Return to first shared context.
    SDL_GL_MakeCurrent(
        eyes[0].window,
        eyes[0].context
    );
}


// ============================================================
// Load OpenGL resources
// ============================================================

void EyeRenderer::createResources()
{
    SDL_GL_MakeCurrent(
        eyes[0].window,
        eyes[0].context
    );

    shaderProgram =
        createShaderProgram();

    baseColorTexture =
        loadTexture(
            "assets/eye_basecolor.png"
        );

    normalTexture =
        loadTexture(
            "assets/eye_normal.png"
        );

    meshes =
        loadModel(
            "assets/eye.glb"
        );

    // --------------------------------------------------------
    // One VAO per mesh per context
    // --------------------------------------------------------

    for (Mesh& mesh : meshes)
    {
        mesh.VAOs.clear();

        for (EyeWindow& eye : eyes)
        {
            createVAOForContext(
                mesh,
                eye
            );
        }
    }

    SDL_GL_MakeCurrent(
        eyes[0].window,
        eyes[0].context
    );
}


// ============================================================
// Start renderer
// ============================================================

bool EyeRenderer::start(const Config& newConfig)
{   

    lastIdleChange = std::chrono::steady_clock::now();
    config = newConfig;
    
    if (started)
    {
        return true;
    }

    if (SDL_Init(SDL_INIT_VIDEO) != 0)
    {
        std::cerr
            << "SDL_Init failed: "
            << SDL_GetError()
            << '\n';

        return false;
    }

    // --------------------------------------------------------
    // OpenGL ES settings MUST be set before contexts exist
    // --------------------------------------------------------

    SDL_GL_SetAttribute(
        SDL_GL_CONTEXT_MAJOR_VERSION,
        3
    );

    SDL_GL_SetAttribute(
        SDL_GL_CONTEXT_MINOR_VERSION,
        0
    );

    SDL_GL_SetAttribute(
        SDL_GL_CONTEXT_PROFILE_MASK,
        SDL_GL_CONTEXT_PROFILE_ES
    );

    SDL_GL_SetAttribute(
        SDL_GL_DOUBLEBUFFER,
        1
    );

    SDL_GL_SetAttribute(
        SDL_GL_DEPTH_SIZE,
        24
    );

    if (!(IMG_Init(IMG_INIT_PNG) &
          IMG_INIT_PNG))
    {
        std::cerr
            << "IMG_Init failed: "
            << IMG_GetError()
            << '\n';

        SDL_Quit();

        return false;
    }

    createWindows();

    if (eyes.empty() ||
        !eyes[0].window ||
        !eyes[0].context)
    {
        stop();

        return false;
    }

    std::cout
        << "OpenGL ES version: "
        << glGetString(GL_VERSION)
        << '\n';

    createResources();
    
      if (!shaderProgram ||
        !baseColorTexture ||
        !normalTexture ||
        meshes.empty())
    {
        std::cerr
            << "Failed to create rendering resources.\n";

        stop();

        return false;
    }

    if (!createBackgroundResources()){
    std::cerr << "Could not create background resources.\n";
    stop();
    return false;
           }

    if (!backgroundVideo.openFolder(
        "assets/backgrounds")){
    std::cerr << "Could not open background video.\n";
    stop();
    return false;
           }
    
    if (!textOverlay.start(
          "assets/fonts/pixel.ttf",
          48
       ))
    {
       std::cerr << "Could not start text overlay.\n";

       stop();

       return false;
    }


    // --------------------------------------------------------
    // OpenGL view camera
    // --------------------------------------------------------

    renderCameraPosition =
        glm::vec3(
            0.0f,
            0.0f,
            3.0f
        );

    view =
        glm::lookAt(
            renderCameraPosition,
            glm::vec3(
                0.0f,
                0.0f,
                0.0f
            ),
            glm::vec3(
                0.0f,
                1.0f,
                0.0f
            )
        );

    // --------------------------------------------------------
    // Desktop
    // --------------------------------------------------------

    SDL_DisplayMode displayMode;

    if (SDL_GetCurrentDisplayMode(
            0,
            &displayMode
        ) != 0)
    {
        std::cerr
            << "Could not get display mode: "
            << SDL_GetError()
            << '\n';

        stop();

        return false;
    }

    desktopWidth =
        displayMode.w;

    desktopHeight =
        displayMode.h;

    // --------------------------------------------------------
    // Physical camera calibration
    // --------------------------------------------------------


    const float cameraOffsetX = config.cameraOffsetX;
    const float cameraOffsetY = config.cameraOffsetY;

    cameraX =
        desktopWidth * 0.5f +
        cameraOffsetX;

    cameraY =
        desktopHeight * 0.5f +
        cameraOffsetY;

    std::cout
        << "Desktop: "
        << desktopWidth
        << " x "
        << desktopHeight
        << '\n';

    std::cout
        << "Camera assumed at: "
        << cameraX
        << ", "
        << cameraY
        << '\n';

    started = true;

    return true;
}


// ============================================================
// SDL events
// ============================================================

void EyeRenderer::handleEvents(
    bool& running
)
{
    SDL_Event event;

    while (SDL_PollEvent(
        &event
    ))
    {
        if (event.type ==
            SDL_QUIT)
        {
            running = false;
        }

        if (event.type ==
                SDL_KEYDOWN &&
            event.key.keysym.sym ==
                SDLK_ESCAPE)
        {
            running = false;
        }
	if (event.type == SDL_KEYDOWN)
	{
		if (event.key.keysym.sym == SDLK_RIGHT)
		{
			backgroundVideo.nextVideo();
		}
}
    }
}


// ============================================================
// Render all four eyes
// ============================================================

void EyeRenderer::render(
    bool faceDetected,
    float faceX,
    float faceY
)
{
    if (!started)
    {
        return;
    }
    
    textOverlay.setVisible(faceDetected);
    
    if (faceDetected){
        
	    textOverlay.update("IM LOOKING AT YOU.");
    }

    backgroundVideo.update();

    for (std::size_t eyeIndex = 0;
         eyeIndex < eyes.size();
         ++eyeIndex)
    {
        EyeWindow& eye =
            eyes[eyeIndex];

        // ----------------------------------------------------
        // Current window size
        // ----------------------------------------------------

        SDL_GetWindowSize(
            eye.window,
            &eye.width,
            &eye.height
        );

        // Avoid division by zero while minimized.
        if (eye.width <= 0 ||
            eye.height <= 0)
        {
            continue;
        }

        // ----------------------------------------------------
        // Window position on desktop
        // ----------------------------------------------------

        int windowX = 0;
        int windowY = 0;

        SDL_GetWindowPosition(
            eye.window,
            &windowX,
            &windowY
        );

        const float eyeCenterX =
            windowX +
            eye.width * 0.5f;

        const float eyeCenterY =
            windowY +
            eye.height * 0.5f;

        // ----------------------------------------------------
        // Face target
        // ----------------------------------------------------

        //float targetDesktopX =
            //cameraX;

        //float targetDesktopY =
            //cameraY;

        //if (faceDetected)
        //{
            //targetDesktopX =
                //cameraX +
                //faceX *
                //(desktopWidth * 0.5f);

            //targetDesktopY =
                //cameraY +
                //faceY *
                //(desktopHeight * 0.5f);
        //}

        //const float dx =
            //targetDesktopX -
            //eyeCenterX;

        //const float dy =
            //targetDesktopY -
            //eyeCenterY;

        //float lookX =
            //dx /
            //(desktopWidth * 0.5f);

        //float lookY =
            //dy /
            //(desktopHeight * 0.5f);

        //lookX =
            //glm::clamp(
                //lookX,
                //-1.0f,
                //1.0f
            //);

        //lookY =
            //glm::clamp(
                //lookY,
                //-1.0f,
                //1.0f
            //);
	float targetX = 0.0f;
	float targetY = 0.0f;

	if (faceDetected)
	{
	    // Normal face tracking
	    targetX = faceX;
	    targetY = faceY;
	}
	else
	{
	    auto now =
		std::chrono::steady_clock::now();

	    float elapsed =
		std::chrono::duration<float>(
		    now - lastIdleChange
		).count();

	    if (elapsed >= idleChangeInterval)
	    {
		lastIdleChange = now;

		// Pick a new random idle direction
		idleTargetX =
		    static_cast<float>(
			(std::rand() % 101) - 50
		    ) / 100.0f;

		idleTargetY =
		    static_cast<float>(
			(std::rand() % 61) - 30
		    ) / 100.0f;

		// Wait between roughly 1.5 and 3.5 seconds
		idleChangeInterval =
		    1.5f +
		    static_cast<float>(
			std::rand() % 200
		    ) / 100.0f;
	    }

	    targetX = idleTargetX;
	    targetY = idleTargetY;
	}


		// Small dead zone to ignore tiny detector jitter.
		const float deadZone = 0.03f;

		if (std::abs(targetX) < deadZone)
		{
			targetX = 0.0f;
		}

		if (std::abs(targetY) < deadZone)
		{
			targetY = 0.0f;
		}

		// Smooth movement.
		const float smoothing = 0.10f;

		smoothFaceX +=
			(targetX - smoothFaceX) *
			smoothing;

		smoothFaceY +=
			(targetY - smoothFaceY) *
			smoothing;

        //const float yaw =
            //lookX *
            //glm::radians(config.maxYaw);

        //const float pitch =
            //lookY *
            //glm::radians(config.maxPitch);
            
		float perspectiveX =
			smoothFaceX *
			(0.7f + 0.3f * std::abs(smoothFaceX));

		float perspectiveY =
			smoothFaceY *
			(0.7f + 0.3f * std::abs(smoothFaceY));

		const float yaw =
			perspectiveX *
			glm::radians(
				config.maxYaw
			);

		const float pitch =
			perspectiveY *
			glm::radians(
				config.maxPitch
			);

        // ----------------------------------------------------
        // Eye orientation
        // ----------------------------------------------------

        glm::mat4 trackingRotation(
            1.0f
        );

        trackingRotation =
            glm::rotate(
                trackingRotation,
                yaw,
                glm::vec3(
                    0.0f,
                    1.0f,
                    0.0f
                )
            );

        trackingRotation =
            glm::rotate(
                trackingRotation,
                pitch,
                glm::vec3(
                    1.0f,
                    0.0f,
                    0.0f
                )
            );

        glm::mat4 baseOrientation(
            1.0f
        );

        baseOrientation =
            glm::rotate(
                baseOrientation,
                glm::radians(-90.0f),
                glm::vec3(
                    0.0f,
                    1.0f,
                    0.0f
                )
            );

        const glm::mat4 eyeTransform =
            trackingRotation *
            baseOrientation;

        // ----------------------------------------------------
        // Switch context
        // ----------------------------------------------------

        if (SDL_GL_MakeCurrent(
                eye.window,
                eye.context
            ) != 0)
        {
            std::cerr
                << "MakeCurrent failed for eye "
                << eyeIndex
                << ": "
                << SDL_GetError()
                << '\n';

            continue;
        }

        // ----------------------------------------------------
        // Window rendering
        // ----------------------------------------------------

        glViewport(
            0,
            0,
            eye.width,
            eye.height
        );

        glEnable(
            GL_DEPTH_TEST
        );

        glDepthFunc(
            GL_LESS
        );

        glClearColor(
            config.backgroundR,
            config.backgroundG,
            config.backgroundB,
            1.0f
        );

        glClear(
            GL_COLOR_BUFFER_BIT |
            GL_DEPTH_BUFFER_BIT
        );
        
	drawBackground();

        glUseProgram(
            shaderProgram
        );

        glm::mat4 projection =
            glm::perspective(
                glm::radians(50.0f),
                static_cast<float>(
                    eye.width
                ) /
                static_cast<float>(
                    eye.height
                ),
                0.1f,
                100.0f
            );

        // ----------------------------------------------------
        // Common uniforms
        // ----------------------------------------------------

        glUniformMatrix4fv(
            glGetUniformLocation(
                shaderProgram,
                "view"
            ),
            1,
            GL_FALSE,
            glm::value_ptr(view)
        );

        glUniformMatrix4fv(
            glGetUniformLocation(
                shaderProgram,
                "projection"
            ),
            1,
            GL_FALSE,
            glm::value_ptr(
                projection
            )
        );

        glUniform3fv(
            glGetUniformLocation(
                shaderProgram,
                "cameraPosition"
            ),
            1,
            glm::value_ptr(
                renderCameraPosition
            )
        );

        // ----------------------------------------------------
        // Textures
        // ----------------------------------------------------

        glActiveTexture(
            GL_TEXTURE0
        );

        glBindTexture(
            GL_TEXTURE_2D,
            baseColorTexture
        );

        glUniform1i(
            glGetUniformLocation(
                shaderProgram,
                "baseColorTexture"
            ),
            0
        );

        glActiveTexture(
            GL_TEXTURE1
        );

        glBindTexture(
            GL_TEXTURE_2D,
            normalTexture
        );

        glUniform1i(
            glGetUniformLocation(
                shaderProgram,
                "normalTexture"
            ),
            1
        );

        // ====================================================
        // INNER EYEBALL
        // ====================================================

        glDisable(
            GL_BLEND
        );

        glDisable(
            GL_CULL_FACE
        );

        glDepthMask(
            GL_TRUE
        );

        for (const Mesh& mesh : meshes)
        {
            if (mesh.outerShell)
            {
                continue;
            }

            glm::mat4 model =
                eyeTransform *
                mesh.nodeTransform;

            glUniformMatrix4fv(
                glGetUniformLocation(
                    shaderProgram,
                    "model"
                ),
                1,
                GL_FALSE,
                glm::value_ptr(model)
            );

            glUniform1i(
                glGetUniformLocation(
                    shaderProgram,
                    "outerShell"
                ),
                0
            );

            glBindVertexArray(
                mesh.VAOs[eyeIndex]
            );

            glDrawElements(
                GL_TRIANGLES,
                mesh.indexCount,
                GL_UNSIGNED_INT,
                nullptr
            );
        }

        // ====================================================
        // OUTER SHELL
        // ====================================================

        glEnable(
            GL_BLEND
        );

        glBlendFuncSeparate(
            GL_SRC_ALPHA,
            GL_ONE_MINUS_SRC_ALPHA,
            GL_ONE,
            GL_ONE_MINUS_SRC_ALPHA
        );

        glEnable(
            GL_CULL_FACE
        );

        glCullFace(
            GL_BACK
        );

        glDepthMask(
            GL_FALSE
        );

        for (const Mesh& mesh : meshes)
        {
            if (!mesh.outerShell)
            {
                continue;
            }

            glm::mat4 model =
                eyeTransform *
                mesh.nodeTransform;

            glUniformMatrix4fv(
                glGetUniformLocation(
                    shaderProgram,
                    "model"
                ),
                1,
                GL_FALSE,
                glm::value_ptr(model)
            );

            glUniform1i(
                glGetUniformLocation(
                    shaderProgram,
                    "outerShell"
                ),
                1
            );

            glBindVertexArray(
                mesh.VAOs[eyeIndex]
            );

            glDrawElements(
                GL_TRIANGLES,
                mesh.indexCount,
                GL_UNSIGNED_INT,
                nullptr
            );
        }

        // ----------------------------------------------------
        // Restore
        // ----------------------------------------------------

        glDepthMask(
            GL_TRUE
        );

        glDisable(
            GL_CULL_FACE
        );

        glDisable(
            GL_BLEND
        );

        glBindVertexArray(0);
        
        textOverlay.render(
                  eye.width,
                  eye.height
		  );

        SDL_GL_SwapWindow(
            eye.window
        );
    }
}


// ============================================================
// Cleanup resources
// ============================================================

void EyeRenderer::cleanupResources()
{
    if (eyes.empty())
    {
        return;
    }

    // --------------------------------------------------------
    // Delete context-local VAOs
    // --------------------------------------------------------

    for (std::size_t eyeIndex = 0;
         eyeIndex < eyes.size();
         ++eyeIndex)
    {
        SDL_GL_MakeCurrent(
            eyes[eyeIndex].window,
            eyes[eyeIndex].context
        );

        for (Mesh& mesh : meshes)
        {
            if (eyeIndex <
                mesh.VAOs.size())
            {
                glDeleteVertexArrays(
                    1,
                    &mesh.VAOs[
                        eyeIndex
                    ]
                );
            }
        }
    }
    
    
    backgroundVideo.close();

    if (backgroundVAO){
       
        glDeleteVertexArrays(
           1,
           &backgroundVAO
	);
        backgroundVAO = 0;
    }

    if (backgroundVBO){
       glDeleteBuffers(
        1,
        &backgroundVBO
	);
       backgroundVBO = 0;
    }

    if (backgroundShader){
       glDeleteProgram(
        backgroundShader
	);
       backgroundShader = 0;
    }


    // --------------------------------------------------------
    // Shared objects
    // --------------------------------------------------------

    SDL_GL_MakeCurrent(
        eyes[0].window,
        eyes[0].context
    );

    for (Mesh& mesh : meshes)
    {
        glDeleteBuffers(
            1,
            &mesh.VBO
        );

        glDeleteBuffers(
            1,
            &mesh.EBO
        );
    }

    if (baseColorTexture)
    {
        glDeleteTextures(
            1,
            &baseColorTexture
        );

        baseColorTexture = 0;
    }

    if (normalTexture)
    {
        glDeleteTextures(
            1,
            &normalTexture
        );

        normalTexture = 0;
    }

    if (shaderProgram)
    {
        glDeleteProgram(
            shaderProgram
        );

        shaderProgram = 0;
    }

    meshes.clear();
}


// ============================================================
// Stop renderer
// ============================================================

void EyeRenderer::stop()
{
    if (!started &&
        eyes.empty())
    {
        return;
    }

    cleanupResources();

    for (EyeWindow& eye : eyes)
    {
        if (eye.context)
        {
            SDL_GL_DeleteContext(
                eye.context
            );

            eye.context =
                nullptr;
        }

        if (eye.window)
        {
            SDL_DestroyWindow(
                eye.window
            );

            eye.window =
                nullptr;
        }
    }
    textOverlay.stop();
    eyes.clear();

    IMG_Quit();
    SDL_Quit();

    started = false;
}
