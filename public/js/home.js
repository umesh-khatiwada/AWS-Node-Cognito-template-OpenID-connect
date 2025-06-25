// Header scroll effect
            window.addEventListener('scroll', () => {
                const header = document.getElementById('header');
                if (window.scrollY > 50) {
                    header.classList.add('scrolled');
                } else {
                    header.classList.remove('scrolled');
                }
            });

            async function fetchVideos() {
                try {
                    const userId = '<%= userInfo.sub %>';
                    const response = await fetch(`/api/videos/${userId}`);
                    if (!response.ok) {
                        throw new Error('Failed to fetch videos');
                    }
                    const videos = await response.json();
                    console.log('Fetched videos:', videos); // Debug log
                    displayNetflixStyleVideos(videos);
                } catch (error) {
                    console.error('Error fetching videos:', error);
                    showEmptyState();
                }
            }

            function displayNetflixStyleVideos(videos) {
                const recentContainer = document.getElementById('recentVideos');
                const processingContainer = document.getElementById('processingVideos');
                const completedContainer = document.getElementById('completedVideos');

                if (!videos || videos.length === 0) {
                    showEmptyState();
                    return;
                }

                // Sort videos by upload date
                const sortedVideos = videos.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
                const recentVideos = sortedVideos.slice(0, 6);
                
                // Group videos by playability rather than just status
                const playableVideos = videos.filter(v => v.playbackUrls?.[0] && v.playbackUrls[0].trim() !== '');
                const processingVideos = videos.filter(v => !v.playbackUrls?.[0] || v.playbackUrls[0].trim() === '');

                recentContainer.innerHTML = createVideoCards(recentVideos);
                processingContainer.innerHTML = createVideoCards(processingVideos);
                completedContainer.innerHTML = createVideoCards(playableVideos);

                // Update section titles and hide empty sections
                if (processingVideos.length === 0) {
                    processingContainer.parentElement.style.display = 'none';
                } else {
                    processingContainer.parentElement.querySelector('.section-title').textContent = `Processing (${processingVideos.length})`;
                }
                
                if (playableVideos.length === 0) {
                    completedContainer.parentElement.style.display = 'none';
                } else {
                    completedContainer.parentElement.querySelector('.section-title').textContent = `Ready to Stream (${playableVideos.length})`;
                }
            }

            function createVideoCards(videos) {
                return videos.map((video, index) => {
                    console.log('Creating card for video:', video); // Debug log
                    const playbackUrl = video.playbackUrls?.[0] || video.streamingUrl || video.videoUrl || '';
                    console.log('Playback URL:', playbackUrl); // Debug log
                    
                    // Check if video is playable (has playback URL) regardless of status
                    const isPlayable = playbackUrl && playbackUrl.trim() !== '';

                    // Loader and fallback logic
                    let thumbnailSrc = video.thumbnail || video.thumbnailUrl;
                    if (!thumbnailSrc || thumbnailSrc.trim() === '') {
                        thumbnailSrc = '/img/loader.gif';
                    }

                    return `
                        <div class="video-card" onclick="handleVideoClick('${playbackUrl}', '${video.fileName}', '${video.status}', ${isPlayable})">
                            <img src="${thumbnailSrc}" 
                                 alt="${video.fileName}" 
                                 class="video-thumbnail"
                                 onerror="this.onerror=null;this.src='/img/video-processing.png'">
                            
                            <div class="video-overlay">
                                <div class="video-info">
                                    <div class="video-status status-${video.status}">${video.status.toUpperCase()}</div>
                                    <div class="video-title">${video.fileName}</div>
                                    <div class="video-actions">
                                        ${isPlayable ? 
                                            '<div class="action-btn play-btn">▶</div>' : 
                                            '<div class="action-btn">⏳</div>'
                                        }
                                        <div class="action-btn">+</div>
                                        <div class="action-btn">👍</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }

            function handleVideoClick(playbackUrl, title, status, isPlayable) {
                console.log('Video clicked:', { playbackUrl, title, status, isPlayable });
                
                if (isPlayable && playbackUrl) {
                    // Navigate to separate video player page in the same tab
                    const playerUrl = `/player?url=${encodeURIComponent(playbackUrl)}&title=${encodeURIComponent(title)}`;
                    console.log('Opening player URL:', playerUrl); // Debug log
                    window.location.href = playerUrl;
                } else if (!playbackUrl) {
                    alert(`Video "${title}" doesn't have a playback URL available yet. Current status: ${status}`);
                } else {
                    alert(`Video "${title}" is still processing. Current status: ${status}. Please wait for processing to complete.`);
                }
            }
    
            function playVideo(playbackUrl, title) {
                console.log('Attempting to play video:', playbackUrl);
                console.log('User agent:', navigator.userAgent);
                console.log('HLS.js available:', typeof Hls !== 'undefined');
                console.log('HLS.js supported:', typeof Hls !== 'undefined' ? Hls.isSupported() : false);
                
                const modal = document.getElementById('videoModal');
                const video = document.getElementById('modalVideo');
                
                // Show modal
                modal.style.display = 'flex';
                
                // Clean up any existing HLS instance
                if (video.hlsInstance) {
                    video.hlsInstance.destroy();
                    video.hlsInstance = null;
                }
                
                // Clear any existing src
                video.src = '';
                video.load();
                
                // Check if it's an HLS stream (.m3u8)
                if (playbackUrl.includes('.m3u8')) {
                    console.log('Detected HLS stream');
                    
                    // Check if Safari (has native HLS support)
                    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
                    
                    if (isSafari) {
                        console.log('Using Safari native HLS support');
                        video.src = playbackUrl;
                        video.play().catch(e => console.error('Safari native play failed:', e));
                    } else if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                        console.log('Using HLS.js for cross-browser support');
                        
                        const hls = new Hls({
                            startLevel: -1,
                            capLevelToPlayerSize: true,
                            enableWorker: true,
                            lowLatencyMode: true,
                            backBufferLength: 90,
                            maxBufferLength: 30,
                            enableSoftwareAES: true,
                            manifestLoadingTimeOut: 10000,
                            manifestLoadingMaxRetry: 4,
                            levelLoadingTimeOut: 10000,
                            levelLoadingMaxRetry: 4,
                            fragLoadingTimeOut: 20000,
                            fragLoadingMaxRetry: 6
                        });

                        hls.loadSource(playbackUrl);
                        hls.attachMedia(video);
                        
                        hls.on(Hls.Events.MANIFEST_PARSED, function () {
                            console.log('HLS manifest parsed, starting playback');
                            video.play().catch(e => console.error('HLS.js play failed:', e));
                        });
                        
                        hls.on(Hls.Events.ERROR, function (event, data) {
                            console.error('HLS error:', data);
                            if (data.fatal) {
                                switch (data.type) {
                                    case Hls.ErrorTypes.NETWORK_ERROR:
                                        console.log('Fatal network error, trying to recover');
                                        hls.startLoad();
                                        break;
                                    case Hls.ErrorTypes.MEDIA_ERROR:
                                        console.log('Fatal media error, trying to recover');
                                        hls.recoverMediaError();
                                        break;
                                    default:
                                        console.log('Fatal error, cannot recover');
                                        alert('Video streaming error. Please try refreshing the page.');
                                        hls.destroy();
                                        break;
                                }
                            }
                        });

                        video.hlsInstance = hls;
                    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                        console.log('Using native HLS support fallback');
                        video.src = playbackUrl;
                        video.play().catch(e => console.error('Native HLS fallback failed:', e));
                    } else {
                        alert('HLS streaming is not supported in this browser. Please try Safari, Chrome, or Firefox with a recent version.');
                    }
                } else {
                    console.log('Direct video file, using native player');
                    video.src = playbackUrl;
                    video.play().catch(e => {
                        console.error('Direct play failed:', e);
                        alert('Failed to play video. The video format might not be supported.');
                    });
                }
                
                // Enhanced error handling
                video.onerror = function(e) {
                    console.error('Video element error:', e);
                    console.error('Video error details:', {
                        error: video.error,
                        networkState: video.networkState,
                        readyState: video.readyState,
                        currentSrc: video.currentSrc
                    });
                    alert('Error loading video. Please check your internet connection and try again.');
                };
                
                video.onloadstart = function() {
                    console.log('Video loading started');
                };
                
                video.oncanplay = function() {
                    console.log('Video can start playing');
                };

                video.onloadeddata = function() {
                    console.log('Video data loaded');
                };
            }

            function closeVideoModal() {
                const modal = document.getElementById('videoModal');
                const video = document.getElementById('modalVideo');
                
                modal.style.display = 'none';
                video.pause();
                
                // Clean up HLS instance
                if (video.hlsInstance) {
                    video.hlsInstance.destroy();
                    video.hlsInstance = null;
                }
                
                // Clear video source
                video.src = '';
                video.load();
            }

            function showEmptyState() {
                const recentContainer = document.getElementById('recentVideos');
                recentContainer.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">🎬</div>
                        <div class="empty-title">No videos yet</div>
                        <div class="empty-subtitle">Upload your first video to get started</div>
                        <a href="/upload" class="btn-hero btn-primary-hero" style="margin-top: 20px;">
                            ▶ Upload Your First Video
                        </a>
                `;
            }

            // Show loader skeletons in all video rows
function showLoaderSkeletons() {
    const skeletonHTML = Array(6).fill(`
        <div class="video-card skeleton">
            <div class="video-thumbnail-skeleton"></div>
            <div class="video-info-skeleton">
                <div class="video-title-skeleton"></div>
                <div class="video-meta-skeleton"></div>
            </div>
        </div>
    `).join('');
    document.getElementById('recentVideos').innerHTML = skeletonHTML;
    document.getElementById('processingVideos').innerHTML = skeletonHTML;
    document.getElementById('completedVideos').innerHTML = skeletonHTML;
}

// Remove skeletons (optional, handled by replacing innerHTML in displayNetflixStyleVideos/showEmptyState)
function removeLoaderSkeletons() {
    document.getElementById('recentVideos').innerHTML = '';
    document.getElementById('processingVideos').innerHTML = '';
    document.getElementById('completedVideos').innerHTML = '';
}

// Call showLoaderSkeletons before fetching videos
document.addEventListener('DOMContentLoaded', () => {
    showLoaderSkeletons();
    fetchVideos();
});

// Add CSS for skeletons (inject if not present)
(function injectSkeletonCSS() {
    if (document.getElementById('video-skeleton-style')) return;
    const style = document.createElement('style');
    style.id = 'video-skeleton-style';
    style.innerHTML = `
    .video-card.skeleton {
        background: #181818;
        border-radius: 12px;
        padding: 0;
        margin: 0 10px 20px 0;
        width: 220px;
        min-width: 220px;
        height: 180px;
        display: flex;
        flex-direction: column;
        box-shadow: none;
        animation: skeletonPulse 1.5s infinite ease-in-out;
    }
    .video-thumbnail-skeleton {
        width: 100%;
        height: 120px;
        background: linear-gradient(90deg, #222 25%, #333 50%, #222 75%);
        border-radius: 12px 12px 0 0;
        margin-bottom: 10px;
        animation: skeletonPulse 1.5s infinite ease-in-out;
    }
    .video-info-skeleton {
        padding: 10px;
    }
    .video-title-skeleton, .video-meta-skeleton {
        height: 14px;
        background: linear-gradient(90deg, #222 25%, #333 50%, #222 75%);
        border-radius: 6px;
        margin-bottom: 8px;
        animation: skeletonPulse 1.5s infinite ease-in-out;
    }
    .video-title-skeleton {
        width: 70%;
    }
    .video-meta-skeleton {
        width: 40%;
        margin-bottom: 0;
    }
    @keyframes skeletonPulse {
        0% { background-position: -200px 0; }
        100% { background-position: 200px 0; }
    }
    `;
    document.head.appendChild(style);
})();

// Close modal when clicking outside
            document.addEventListener('click', function(event) {
                const modal = document.getElementById('videoModal');
                if (event.target === modal) {
                    closeVideoModal();
                }
            });

            // Fetch videos when page loads
            document.addEventListener('DOMContentLoaded', fetchVideos);