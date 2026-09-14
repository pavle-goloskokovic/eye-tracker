#include <chrono>
#include "Camera.h"
#include <limits>

#include <libcamera/libcamera.h>
#include <libcamera/formats.h>

#include <opencv2/opencv.hpp>
#include <opencv2/objdetect/face.hpp>

#include <sys/mman.h>

#include <atomic>
#include <iostream>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

// ============================================================
// SETTINGS
// ============================================================

// Full-FOV IMX219 mode.
//
// Your camera reported:
//
// 1640x1232
// crop: (0,0) / 3280x2464
//
// so this uses the full sensor field of view.

static constexpr int CAMERA_WIDTH  = 1640;
static constexpr int CAMERA_HEIGHT = 1232;

// We don't need to run YuNet at 1640x1232.
// 640x480 is much lighter for the Pi.

static constexpr int DETECT_WIDTH  = 320;
static constexpr int DETECT_HEIGHT = 240;

static const char* YUNET_MODEL =
	"/home/user/EyeTracker/models/face_detection_yunet_2023mar.onnx";
// ============================================================
// IMPLEMENTATION
// ============================================================

struct Camera::Impl
{

    bool targetLocked = false;

    float lockedCenterX = 0.0f;
    float lockedCenterY = 0.0f;

    int missedDetections = 0;

    static constexpr int MAX_MISSED_DETECTIONS = 8;

    // Run YuNet only once every 4 camera frames.
    int detectionFrameCounter = 0;
    static constexpr int DETECT_EVERY_N_FRAMES = 3;
    // --------------------------------------------------------
    // libcamera
    // --------------------------------------------------------

    libcamera::CameraManager cameraManager;

    std::shared_ptr<libcamera::Camera> camera;

    std::unique_ptr<
        libcamera::CameraConfiguration
    > configuration;

    std::unique_ptr<
        libcamera::FrameBufferAllocator
    > allocator;

    libcamera::Stream* stream = nullptr;

    std::vector<
        std::unique_ptr<libcamera::Request>
    > requests;

    // --------------------------------------------------------
    // Buffer mappings
    // --------------------------------------------------------

    struct BufferMapping
    {
        void* base = nullptr;

        unsigned char* data = nullptr;

        std::size_t length = 0;
    };

    std::unordered_map<
        libcamera::FrameBuffer*,
        BufferMapping
    > mappings;

    // --------------------------------------------------------
    // OpenCV / YuNet
    // --------------------------------------------------------

    cv::Ptr<cv::FaceDetectorYN> detector;

    // --------------------------------------------------------
    // Image information
    // --------------------------------------------------------

    int width = 0;
    int height = 0;
    int stride = 0;

    // --------------------------------------------------------
    // Face result
    // --------------------------------------------------------

    FacePosition latestFace;

    std::mutex faceMutex;

    std::atomic<bool> running{false};

    std::mutex previewMutex;
    
    cv::Mat previewFrame;

    std::chrono::steady_clock::time_point lastFpsTime =
        std::chrono::steady_clock::now();
    
    std::chrono::steady_clock::time_point lastFaceSeen =
        std::chrono::steady_clock::now();

    static constexpr float FACE_TIMEOUT_SECONDS = 1.0f;
    
    int frameCounter = 0;
    float fps = 0.0f;

    // ========================================================
    // Start camera
    // ========================================================

    bool start()
    {
        // ----------------------------------------------------
        // YuNet
        // ----------------------------------------------------

        detector =
            cv::FaceDetectorYN::create(
                YUNET_MODEL,
                "",
                cv::Size(
                    DETECT_WIDTH,
                    DETECT_HEIGHT
                ),
                0.6f,   // score threshold
                0.3f,   // NMS threshold
                10
            );

        if (detector.empty())
        {
            std::cerr
                << "Could not create YuNet detector.\n";

            return false;
        }

        std::cout
            << "YuNet loaded: "
            << YUNET_MODEL
            << '\n';

        // ----------------------------------------------------
        // Start CameraManager
        // ----------------------------------------------------

        int ret =
            cameraManager.start();

        if (ret)
        {
            std::cerr
                << "Could not start CameraManager: "
                << ret
                << '\n';

            return false;
        }

        // ----------------------------------------------------
        // Find camera
        // ----------------------------------------------------

        if (cameraManager.cameras().empty())
        {
            std::cerr
                << "No camera found.\n";

            cameraManager.stop();

            return false;
        }

        camera =
            cameraManager.cameras()[0];

        std::cout
            << "Camera: "
            << camera->id()
            << '\n';

        // ----------------------------------------------------
        // Acquire camera
        // ----------------------------------------------------

        ret =
            camera->acquire();

        if (ret)
        {
            std::cerr
                << "Could not acquire camera: "
                << ret
                << '\n';

            camera.reset();
            cameraManager.stop();

            return false;
        }

        // ----------------------------------------------------
        // Generate configuration
        // ----------------------------------------------------

        configuration =
            camera->generateConfiguration(
                {
                    libcamera::StreamRole::Viewfinder
                }
            );

        if (!configuration ||
            configuration->empty())
        {
            std::cerr
                << "Could not generate camera configuration.\n";

            stop();

            return false;
        }

        libcamera::StreamConfiguration& cfg =
            configuration->at(0);

        // ----------------------------------------------------
        // Request the full-FOV 4:3 mode
        // ----------------------------------------------------

        cfg.size.width =
            CAMERA_WIDTH;

        cfg.size.height =
            CAMERA_HEIGHT;

        // RGB makes conversion into an OpenCV image simple.

        cfg.pixelFormat =
            libcamera::formats::RGB888;

        // A few buffers lets capture continue smoothly.

        cfg.bufferCount = 4;

        // ----------------------------------------------------
        // Validate
        // ----------------------------------------------------

        libcamera::CameraConfiguration::Status status =
            configuration->validate();

        if (status ==
            libcamera::CameraConfiguration::Invalid)
        {
            std::cerr
                << "Camera configuration is invalid.\n";

            stop();

            return false;
        }

        std::cout
            << "Requested camera: "
            << CAMERA_WIDTH
            << "x"
            << CAMERA_HEIGHT
            << '\n';

        std::cout
            << "Actual configuration: "
            << cfg.toString()
            << '\n';

        // ----------------------------------------------------
        // Configure
        // ----------------------------------------------------

        ret =
            camera->configure(
                configuration.get()
            );

        if (ret)
        {
            std::cerr
                << "Camera configuration failed: "
                << ret
                << '\n';

            stop();

            return false;
        }

        stream =
            cfg.stream();

        width =
            cfg.size.width;

        height =
            cfg.size.height;

        stride =
            cfg.stride;

        std::cout
            << "Camera configured: "
            << width
            << "x"
            << height
            << " stride="
            << stride
            << '\n';

        // ----------------------------------------------------
        // Allocate buffers
        // ----------------------------------------------------

        allocator =
            std::make_unique<
                libcamera::FrameBufferAllocator
            >(camera);

        ret =
            allocator->allocate(
                stream
            );

        if (ret < 0)
        {
            std::cerr
                << "Could not allocate camera buffers.\n";

            stop();

            return false;
        }

        const auto& buffers =
            allocator->buffers(
                stream
            );

        std::cout
            << "Camera buffers: "
            << buffers.size()
            << '\n';

        // ----------------------------------------------------
        // mmap buffers
        // ----------------------------------------------------

        for (const auto& buffer : buffers)
        {
            const auto& planes =
                buffer->planes();

            if (planes.empty())
            {
                std::cerr
                    << "Camera buffer has no planes.\n";

                stop();

                return false;
            }

            // RGB888 should be one image plane.
            const auto& plane =
                planes[0];

            std::size_t mapLength =
                plane.offset +
                plane.length;

            void* base =
                mmap(
                    nullptr,
                    mapLength,
                    PROT_READ |
                    PROT_WRITE,
                    MAP_SHARED,
                    plane.fd.get(),
                    0
                );

            if (base == MAP_FAILED)
            {
                std::cerr
                    << "mmap() failed for camera buffer.\n";

                stop();

                return false;
            }

            BufferMapping mapping;

            mapping.base =
                base;

            mapping.data =
                static_cast<unsigned char*>(
                    base
                ) +
                plane.offset;

            mapping.length =
                mapLength;

            mappings[
                buffer.get()
            ] = mapping;
        }

        // ----------------------------------------------------
        // Create capture requests
        // ----------------------------------------------------

        for (const auto& buffer : buffers)
        {
            std::unique_ptr<
                libcamera::Request
            > request =
                camera->createRequest();

            if (!request)
            {
                std::cerr
                    << "Could not create camera request.\n";

                stop();

                return false;
            }

            ret =
                request->addBuffer(
                    stream,
                    buffer.get()
                );

            if (ret)
            {
                std::cerr
                    << "Could not add buffer to request.\n";

                stop();

                return false;
            }

            requests.push_back(
                std::move(request)
            );
        }

        // ----------------------------------------------------
        // Completion callback
        // ----------------------------------------------------

        camera->requestCompleted.connect(
            this,
            &Camera::Impl::requestComplete
        );

        // ----------------------------------------------------
        // Start capture
        // ----------------------------------------------------

        running = true;

        ret =
            camera->start();

        if (ret)
        {
            std::cerr
                << "Could not start camera: "
                << ret
                << '\n';

            running = false;

            stop();

            return false;
        }

        // Queue all buffers.

        for (auto& request : requests)
        {
            ret =
                camera->queueRequest(
                    request.get()
                );

            if (ret)
            {
                std::cerr
                    << "Could not queue camera request: "
                    << ret
                    << '\n';

                stop();

                return false;
            }
        }

        std::cout
            << "Camera face tracking started.\n";

        return true;
    }

    // ========================================================
    // Request completed
    // ========================================================

    void requestComplete(
        libcamera::Request* request)
    {
        if (request->status() ==
            libcamera::Request::RequestCancelled)
        {
            return;
        }

        if (!running)
        {
            return;
        }

        auto bufferIt =
            request->buffers().find(
                stream
            );

        if (bufferIt ==
            request->buffers().end())
        {
            return;
        }

        libcamera::FrameBuffer* buffer =
            bufferIt->second;

        auto mapIt =
            mappings.find(
                buffer
            );

        if (mapIt ==
            mappings.end())
        {
            return;
        }

        unsigned char* data =
            mapIt->second.data;

        // ----------------------------------------------------
        // Camera image
        // ----------------------------------------------------

        cv::Mat rgb(
            height,
            width,
            CV_8UC3,
            data,
            stride
        );

        // ----------------------------------------------------
        // Resize for YuNet
        // ----------------------------------------------------

        cv::Mat smallRgb;

        cv::resize(
            rgb,
            smallRgb,
            cv::Size(
                DETECT_WIDTH,
                DETECT_HEIGHT
            ),
            0.0,
            0.0,
            cv::INTER_LINEAR
        );

        // YuNet/OpenCV pipeline:
        // convert camera RGB -> BGR.

        cv::Mat bgr;

        cv::cvtColor(
            smallRgb,
            bgr,
            cv::COLOR_RGB2BGR
        );

	// Mirror horizontally
	cv::flip(
	    bgr,
	    bgr,
	    1
	);

        // ----------------------------------------------------
        // Detect faces
        // ----------------------------------------------------
        
        detectionFrameCounter++;

        bool runDetection =
            //!targetLocked ||
            detectionFrameCounter >= DETECT_EVERY_N_FRAMES;

	cv::Mat faces;

	if (runDetection)
	{
	    detectionFrameCounter = 0;

	    detector->detect(
		bgr,
		faces
	    );
	}
	
	FacePosition result;

	{
	    std::lock_guard<std::mutex> lock(faceMutex);
	    result = latestFace;
	}

        // ----------------------------------------------------
        // Pick a face
        // ----------------------------------------------------
        //
        // For now:
        // pick the biggest detected face.
        //
        // That's usually the closest person and avoids
        // jumping randomly between several faces.
        // ----------------------------------------------------
	if (runDetection)
	{
	    if (faces.rows > 0)
	    {
		int bestFace = -1;

		// ----------------------------------------------------
		// No target yet:
		// choose the biggest face.
		// ----------------------------------------------------

		if (!targetLocked)
		{
		    float bestArea = 0.0f;

		    for (int i = 0;
			 i < faces.rows;
			 ++i)
		    {
			float w =
			    faces.at<float>(i, 2);

			float h =
			    faces.at<float>(i, 3);

			float area =
			    w * h;

			if (area > bestArea)
			{
			    bestArea = area;
			    bestFace = i;
			}
		    }
		}

		// ----------------------------------------------------
		// Already tracking:
		// choose the face closest to the previous face.
		// ----------------------------------------------------

		else
		{
		    float bestDistance =
			std::numeric_limits<float>::max();

		    for (int i = 0;
			 i < faces.rows;
			 ++i)
		    {
			float x =
			    faces.at<float>(i, 0);

			float y =
			    faces.at<float>(i, 1);

			float w =
			    faces.at<float>(i, 2);

			float h =
			    faces.at<float>(i, 3);

			float centerX =
			    x + w * 0.5f;

			float centerY =
			    y + h * 0.5f;

			float dx =
			    centerX - lockedCenterX;

			float dy =
			    centerY - lockedCenterY;

			float distance =
			    dx * dx +
			    dy * dy;

			if (distance < bestDistance)
			{
			    bestDistance = distance;
			    bestFace = i;
			}
		    }
		}

		// ----------------------------------------------------
		// Update locked target
		// ----------------------------------------------------

		if (bestFace >= 0)
		{
		    float x =
			faces.at<float>(
			    bestFace,
			    0
			);

		    float y =
			faces.at<float>(
			    bestFace,
			    1
			);

		    float w =
			faces.at<float>(
			    bestFace,
			    2
			);

		    float h =
			faces.at<float>(
			    bestFace,
			    3
			);

		    float centerX =
			x + w * 0.5f;

		    float centerY =
			y + h * 0.5f;

		    lockedCenterX =
			centerX;

		    lockedCenterY =
			centerY;

		    lastFaceSeen =
                         std::chrono::steady_clock::now();

		    targetLocked = true;

		    missedDetections = 0;

		    result.detected = true;


		    result.x =
			(
			    centerX /
			    static_cast<float>(
				DETECT_WIDTH
			    )
			) * 2.0f - 1.0f;

		    result.y =
			(
			    centerY /
			    static_cast<float>(
				DETECT_HEIGHT
			    )
			) * 2.0f - 1.0f;

		    result.size =
			w /
			static_cast<float>(
			    DETECT_WIDTH
			);

		    result.boxX =
			static_cast<int>(x);

		    result.boxY =
			static_cast<int>(y);

		    result.boxW =
			static_cast<int>(w);

		    result.boxH =
			static_cast<int>(h);
		}
	    }
	    else
	    {
		missedDetections++;

		if (missedDetections >=
		    MAX_MISSED_DETECTIONS)
		{
		    targetLocked = false;

		    missedDetections = 0;

		    std::cout
			<< "\nTarget lost - searching again\n";
		}
	    }
	}

	auto currentTime =
	    std::chrono::steady_clock::now();

	float timeSinceFace =
	    std::chrono::duration<float>(
		currentTime - lastFaceSeen
	    ).count();

	if (targetLocked &&
	    timeSinceFace >= FACE_TIMEOUT_SECONDS)
	{
	    std::cout
		<< "\nFace timeout - target cleared\n";

	    targetLocked = false;
	    missedDetections = 0;

	    lockedCenterX = 0.0f;
	    lockedCenterY = 0.0f;

	    // THIS clears detected + old rectangle + coordinates.
	    result = FacePosition{};
	}

	// ----------------------------------------------------
	// Create debug preview
	// ----------------------------------------------------

	cv::Mat debugFrame =
	    bgr.clone();

	if (result.detected)
	{
	    cv::rectangle(
		debugFrame,
		cv::Rect(
		    result.boxX,
		    result.boxY,
		    result.boxW,
		    result.boxH
		),
		cv::Scalar(0, 255, 0),
		2
	    );

	    int centerX =
		result.boxX +
		result.boxW / 2;

	    int centerY =
		result.boxY +
		result.boxH / 2;

	    cv::circle(
		debugFrame,
		cv::Point(centerX, centerY),
		5,
		cv::Scalar(0, 0, 255),
		-1
	    );
	}

	// ----------------------------------------------------
	// Calculate detection FPS
	// ----------------------------------------------------

	frameCounter++;

	auto now =
	    std::chrono::steady_clock::now();

	float elapsed =
	    std::chrono::duration<float>(
		now - lastFpsTime
	    ).count();

	if (elapsed >= 1.0f)
	{
	    fps =
		static_cast<float>(frameCounter) /
		elapsed;

	    frameCounter = 0;

	    lastFpsTime = now;
	}

	// ----------------------------------------------------
	// Draw FPS
	// ----------------------------------------------------

	cv::putText(
	    debugFrame,
	    "FPS: " +
		std::to_string(
		    static_cast<int>(fps)
		),
	    cv::Point(15, 30),
	    cv::FONT_HERSHEY_SIMPLEX,
	    0.8,
	    cv::Scalar(0, 255, 0),
	    2
	);

	// ----------------------------------------------------
	// Save preview for main thread
	// ----------------------------------------------------

	{
	    std::lock_guard<std::mutex>
		lock(previewMutex);

	    previewFrame =
		debugFrame;
	}

        // ----------------------------------------------------
        // Save latest result
        // ----------------------------------------------------

        {
            std::lock_guard<std::mutex>
                lock(faceMutex);

            latestFace =
                result;
        }

        // ----------------------------------------------------
        // Reuse this request
        // ----------------------------------------------------

        if (running)
        {
            request->reuse(
                libcamera::Request::ReuseBuffers
            );

            camera->queueRequest(
                request
            );
        }
    }

    // ========================================================
    // Read latest result
    // ========================================================

    FacePosition update()
    {
        std::lock_guard<std::mutex>
            lock(faceMutex);

        return latestFace;
    }

    // ========================================================
    // Stop
    // ========================================================

    void stop()
    {
        running = false;

        if (camera)
        {
            camera->stop();
        }

        requests.clear();

        // ----------------------------------------------------
        // Unmap camera buffers
        // ----------------------------------------------------

        for (auto& item : mappings)
        {
            BufferMapping& mapping =
                item.second;

            if (mapping.base &&
                mapping.base != MAP_FAILED)
            {
                munmap(
                    mapping.base,
                    mapping.length
                );
            }
        }

        mappings.clear();

        // ----------------------------------------------------
        // Free libcamera buffers
        // ----------------------------------------------------

        if (allocator &&
            stream)
        {
            allocator->free(
                stream
            );
        }

        allocator.reset();

        stream = nullptr;

        configuration.reset();

        if (camera)
        {
            camera->release();
            camera.reset();
        }

        cameraManager.stop();
    }
};

// ============================================================
// CAMERA PUBLIC API
// ============================================================

Camera::Camera()
    : impl(
        std::make_unique<Impl>()
    )
{
}

Camera::~Camera()
{
    if (impl)
    {
        impl->stop();
    }
}

bool Camera::start()
{
    return impl->start();
}

FacePosition Camera::update()
{
    return impl->update();
}

void Camera::stop()
{
    impl->stop();
}

void Camera::showPreview()
{
    std::lock_guard<std::mutex>
        lock(impl->previewMutex);

    if (!impl->previewFrame.empty())
    {
        cv::imshow(
            "Face Tracking",
            impl->previewFrame
        );

        cv::waitKey(1);
    }
}
