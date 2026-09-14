#include "BackgroundVideo.h"
#include <random>
#include <algorithm>
#include <filesystem>
#include <iostream>

BackgroundVideo::BackgroundVideo()
{
}

BackgroundVideo::~BackgroundVideo()
{
    close();
}

bool BackgroundVideo::nextVideo()
{
    if (playlist.empty())
    {
        return false;
    }

    currentVideoIndex++;

    if (currentVideoIndex >= playlist.size())
    {
        currentVideoIndex = 0;
    }

    return openCurrentVideo();
}


void BackgroundVideo::rescanFolder()
{
    namespace fs = std::filesystem;

    if (backgroundFolder.empty())
    {
        return;
    }

    if (!fs::exists(backgroundFolder))
    {
        return;
    }

    std::vector<std::string> foundVideos;

    // --------------------------------------------------------
    // Scan folder
    // --------------------------------------------------------

    for (const auto& entry :
         fs::directory_iterator(backgroundFolder))
    {
        if (!entry.is_regular_file())
        {
            continue;
        }

        std::string extension =
            entry.path()
                .extension()
                .string();

        std::transform(
            extension.begin(),
            extension.end(),
            extension.begin(),
            [](unsigned char c)
            {
                return std::tolower(c);
            }
        );

        if (extension == ".mp4")
        {
            foundVideos.push_back(
                entry.path().string()
            );
        }
    }

    // Sort ONLY the scanned copy.
    // This makes comparison reliable.
    std::sort(
        foundVideos.begin(),
        foundVideos.end()
    );

    // --------------------------------------------------------
    // Create a sorted copy of our EXISTING playlist
    // --------------------------------------------------------

    std::vector<std::string> existingVideos =
        playlist;

    std::sort(
        existingVideos.begin(),
        existingVideos.end()
    );

    // --------------------------------------------------------
    // Same files still exist -> DO NOTHING
    //
    // This is the important part:
    // playlist keeps its shuffled order.
    // --------------------------------------------------------

    if (foundVideos == existingVideos)
    {
        return;
    }

    // --------------------------------------------------------
    // Folder genuinely changed
    // --------------------------------------------------------

    std::cout
        << "Background folder changed. Found "
        << foundVideos.size()
        << " videos.\n";

    // Remember the currently playing file.
    std::string currentPath;

    if (!playlist.empty() &&
        currentVideoIndex < playlist.size())
    {
        currentPath =
            playlist[currentVideoIndex];
    }

    // --------------------------------------------------------
    // Keep existing shuffled order for videos that still exist
    // --------------------------------------------------------

    std::vector<std::string> newPlaylist;

    for (const std::string& oldVideo : playlist)
    {
        auto it =
            std::find(
                foundVideos.begin(),
                foundVideos.end(),
                oldVideo
            );

        if (it != foundVideos.end())
        {
            newPlaylist.push_back(
                oldVideo
            );
        }
    }

    // --------------------------------------------------------
    // Append newly discovered videos
    // --------------------------------------------------------

	for (const std::string& newVideo : foundVideos)
	{
	    auto it =
		std::find(
		    newPlaylist.begin(),
		    newPlaylist.end(),
		    newVideo
		);

	    if (it == newPlaylist.end())
	    {
		std::cout
		    << "New background added: "
		    << newVideo
		    << '\n';

		std::filesystem::path videoPath =
		    newVideo;

		std::string filename =
		    videoPath.filename().string();

		// ----------------------------------------------------
		// Files starting with "01_" should play NEXT
		// ----------------------------------------------------

		if (filename.rfind("01_", 0) == 0)
		{
		    std::size_t insertPosition =
			currentVideoIndex + 1;

		    if (insertPosition >
			newPlaylist.size())
		    {
			insertPosition =
			    newPlaylist.size();
		    }

		    newPlaylist.insert(
			newPlaylist.begin() +
			    insertPosition,
			newVideo
		    );

		    std::cout
			<< "Priority background queued next: "
			<< filename
			<< '\n';
		}
		else
		{
		    newPlaylist.push_back(
			newVideo
		    );
		}
	    }
	}

    playlist =
        newPlaylist;

    // --------------------------------------------------------
    // Find the currently playing video again
    // --------------------------------------------------------

    if (!currentPath.empty())
    {
        auto it =
            std::find(
                playlist.begin(),
                playlist.end(),
                currentPath
            );

        if (it != playlist.end())
        {
            currentVideoIndex =
                static_cast<std::size_t>(
                    std::distance(
                        playlist.begin(),
                        it
                    )
                );
        }
        else
        {
            currentVideoIndex = 0;
        }
    }
    else
    {
        currentVideoIndex = 0;
    }
}
// ============================================================
// Scan folder and create playlist
// ============================================================
bool BackgroundVideo::openFolder(
    const std::string& folderPath
)
{
    backgroundFolder =
        folderPath;

    playlist.clear();

    rescanFolder();

    if (playlist.empty())
    {
        std::cerr
            << "No MP4 videos found in: "
            << folderPath
            << '\n';

        return false;
    }

    // Randomize playlist once when program starts.
    std::random_device rd;
    std::mt19937 rng(rd());

    std::shuffle(
        playlist.begin(),
        playlist.end(),
        rng
    );

    currentVideoIndex = 0;

    lastFolderScanTime =
        std::chrono::steady_clock::now();

    return openCurrentVideo();
}

// ============================================================
// Open current video from playlist
// ============================================================
bool BackgroundVideo::openCurrentVideo()
{
    if (playlist.empty())
    {
        return false;
    }

    if (video.isOpened())
    {
        video.release();
    }

    std::string path =
        playlist[currentVideoIndex];

    namespace fs = std::filesystem;

    fs::path videoPath =
        path;

    std::string filename =
        videoPath.filename().string();

    if (filename.rfind("01_", 0) == 0)
    {
        std::string newFilename =
            filename.substr(3);

        fs::path newPath =
            videoPath.parent_path() /
            newFilename;

        try
        {
            fs::rename(
                videoPath,
                newPath
            );

            path =
                newPath.string();

            playlist[currentVideoIndex] =
                path;

            std::cout
                << "Priority video started: "
                << newFilename
                << '\n';
        }
        catch (const fs::filesystem_error& e)
        {
            std::cerr
                << "Could not rename priority video: "
                << e.what()
                << '\n';
        }
    }

    video.open(path);

    if (!video.isOpened())
    {
        std::cerr
            << "Could not open background video: "
            << path
            << '\n';

        return false;
    }

    videoFPS =
        video.get(
            cv::CAP_PROP_FPS
        );

    if (videoFPS <= 0.0)
    {
        videoFPS = 24.0;
    }

    std::cout
        << "Playing background video "
        << currentVideoIndex + 1
        << "/"
        << playlist.size()
        << ": "
        << path
        << '\n';

    std::cout
        << "Background FPS: "
        << videoFPS
        << '\n';

    // --------------------------------------------------------
    // Read first frame
    // --------------------------------------------------------

    if (!video.read(frame))
    {
        std::cerr
            << "Could not read first frame from: "
            << path
            << '\n';

        return false;
    }

    cv::cvtColor(
        frame,
        rgbFrame,
        cv::COLOR_BGR2RGB
    );

    width =
        rgbFrame.cols;

    height =
        rgbFrame.rows;


    if (!video.read(frame))
    {
        std::cerr
            << "Could not read first frame from: "
            << path
            << '\n';

        return false;
    }

    cv::cvtColor(
        frame,
        rgbFrame,
        cv::COLOR_BGR2RGB
    );

    width =
        rgbFrame.cols;

    height =
        rgbFrame.rows;

    // --------------------------------------------------------
    // Create texture only once
    // --------------------------------------------------------

    if (texture == 0)
    {
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
    }
    else
    {
        glBindTexture(
            GL_TEXTURE_2D,
            texture
        );
    }

    // --------------------------------------------------------
    // Upload first frame
    // --------------------------------------------------------

    glTexImage2D(
        GL_TEXTURE_2D,
        0,
        GL_RGB,
        rgbFrame.cols,
        rgbFrame.rows,
        0,
        GL_RGB,
        GL_UNSIGNED_BYTE,
        rgbFrame.data
    );

    glBindTexture(
        GL_TEXTURE_2D,
        0
    );

    lastFrameTime =
        std::chrono::steady_clock::now();

    opened = true;

    return true;
}


// ============================================================
// Update current frame / change video when finished
// ============================================================

bool BackgroundVideo::update()
{
    if (!opened)
    {
        return false;
    }

    auto now =
        std::chrono::steady_clock::now();

    // --------------------------------------------------------
    // Periodically check folder for new videos
    // --------------------------------------------------------

    double folderScanElapsed =
        std::chrono::duration<double>(
            now - lastFolderScanTime
        ).count();

    if (folderScanElapsed >=
        folderScanIntervalSeconds)
    {
        lastFolderScanTime = now;

        rescanFolder();
    }

    // --------------------------------------------------------
    // Video frame timing
    // --------------------------------------------------------

    double elapsed =
        std::chrono::duration<double>(
            now - lastFrameTime
        ).count();

    double frameDuration =
        1.0 / videoFPS;

    if (elapsed < frameDuration)
    {
        return true;
    }

    lastFrameTime = now;

    // --------------------------------------------------------
    // Read next frame
    // --------------------------------------------------------

    if (!video.read(frame))
    {
        currentVideoIndex++;

        if (currentVideoIndex >= playlist.size())
        {
            currentVideoIndex = 0;
        }

        return openCurrentVideo();
    }

    cv::cvtColor(
        frame,
        rgbFrame,
        cv::COLOR_BGR2RGB
    );

    // --------------------------------------------------------
    // Upload video frame
    // --------------------------------------------------------

    glBindTexture(
        GL_TEXTURE_2D,
        texture
    );

    glTexSubImage2D(
        GL_TEXTURE_2D,
        0,
        0,
        0,
        rgbFrame.cols,
        rgbFrame.rows,
        GL_RGB,
        GL_UNSIGNED_BYTE,
        rgbFrame.data
    );

    glBindTexture(
        GL_TEXTURE_2D,
        0
    );

    return true;
}


// ============================================================
// Getters
// ============================================================

GLuint BackgroundVideo::getTexture() const
{
    return texture;
}

int BackgroundVideo::getWidth() const
{
    return width;
}

int BackgroundVideo::getHeight() const
{
    return height;
}


// ============================================================
// Cleanup
// ============================================================

void BackgroundVideo::close()
{
    if (video.isOpened())
    {
        video.release();
    }

    if (texture != 0)
    {
        glDeleteTextures(
            1,
            &texture
        );

        texture = 0;
    }

    frame.release();
    rgbFrame.release();

    playlist.clear();

    currentVideoIndex = 0;

    opened = false;
}
