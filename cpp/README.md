# EyeTracker

EyeTracker is a Raspberry Pi based interactive display that renders a 3D eye which follows people detected by a camera.

The project combines real-time face detection, OpenGL ES rendering, background video playback, and animated text overlays to create an eye that appears to watch people as they move in front of the display.

When nobody is detected, the eye performs a slow idle animation. When a face is detected, the eye locks onto the person and follows their position.

## Features

- Real-time face detection using YuNet
- IMX219 Raspberry Pi camera support
- 3D eye rendering with OpenGL ES
- GLB model loading
- Base color and normal-map textures
- Smooth eye tracking
- Automatic idle eye movement when no face is visible
- Fullscreen SDL2 display
- Background video playback
- Automatic background playlist
- Hot-reloading of newly added background videos
- Priority background videos using the `01_` filename prefix
- Typewriter-style text when a face is detected
- Keyboard control for skipping to the next background
- Configurable tracking angles
- Designed to run on a Raspberry Pi 4

## Hardware

The current system was developed for:

- Raspberry Pi 4
- Raspberry Pi IMX219 camera
- HDMI display / HDMI splitter
- Raspberry Pi OS / Debian 13 (Trixie)

The HDMI splitter can be used to mirror the same rendered eye across multiple displays.

## Software

The project is written in C++17 and uses:

- SDL2
- SDL2_ttf
- OpenGL ES 3
- OpenCV
- YuNet face detection
- GLM
- Assimp
- SDL2_image
- libcamera

## Project Structure

```text
EyeTracker/
├── CMakeLists.txt
├── config.ini
│
├── assets/
│   ├── eye.glb
│   ├── eye_basecolor.png
│   ├── eye_normal.png
│   │
│   ├── backgrounds/
│   │   ├── background1.mp4
│   │   ├── background2.mp4
│   │   └── ...
│   │
│   └── fonts/
│       └── pixel.ttf
│
├── models/
│   └── face_detection_yunet_2023mar.onnx
│
├── src/
│   ├── main.cpp
│   ├── EyeRenderer.cpp
│   ├── EyeRenderer.h
│   ├── BackgroundVideo.cpp
│   ├── BackgroundVideo.h
│   ├── TextOverlay.cpp
│   ├── TextOverlay.h
│   ├── Camera.cpp
│   ├── Camera.h
│   ├── Model.cpp
│   ├── Model.h
│   ├── Mesh.cpp
│   ├── Mesh.h
│   ├── Shader.cpp
│   ├── Shader.h
│   ├── Config.cpp
│   └── Config.h
│
└── build/
