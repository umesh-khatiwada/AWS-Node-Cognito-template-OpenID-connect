
        class YouTubeStylePlayer {
            constructor() {
                this.player = null;
                this.hls = null;
                this.currentVideoUrl = null;
                this.isTheaterMode = false;
                this.qualities = [];
                this.currentQuality = 'auto';
                this.playbackSpeeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
                this.currentSpeedIndex = 3; // 1x speed
                
                this.init();
            }

            init() {
                console.log('Initializing YouTube-style Player...');
                this.loadVideoFromURL();
                this.setupEventListeners();
            }

            loadVideoFromURL() {
                const urlParams = new URLSearchParams(window.location.search);
                const videoUrl = urlParams.get('url');
                const videoTitle = urlParams.get('title');

                console.log('Loading video:', { videoUrl, videoTitle });

                if (videoTitle) {
                    document.getElementById('headerTitle').textContent = videoTitle;
                    document.getElementById('videoTitleMain').textContent = videoTitle;
                    document.title = `${videoTitle} - VideoHub`;
                }

                if (!videoUrl) {
                    this.showError('No video URL provided', 'Please check the video link and try again.');
                    return;
                }

                this.currentVideoUrl = decodeURIComponent(videoUrl);
                this.initializePlayer();
            }

            initializePlayer() {
                try {
                    this.showLoading(true);
                    
                    // Initialize Video.js player with YouTube-like configuration
                    this.player = videojs('youtube-player', {
                        fluid: false,
                        responsive: true,
                        aspectRatio: '16:9',
                        playbackRates: this.playbackSpeeds,
                        controls: true,
                        preload: 'auto',
                        autoplay: false,
                        html5: {
                            hls: {
                                enableLowInitialPlaylist: true,
                                smoothQualityChange: true,
                                overrideNative: !this.isSafari()
                            },
                            vhs: {
                                overrideNative: !this.isSafari(),
                                enableLowInitialPlaylist: true,
                                smoothQualityChange: true
                            }
                        },
                        techOrder: ['html5'],
                        liveui: true
                    });

                    this.player.ready(() => {
                        console.log('Player ready');
                        this.setupVideoSource();
                        this.setupPlayerEvents();
                        this.showLoading(false);
                    });

                } catch (error) {
                    console.error('Error initializing player:', error);
                    this.showError('Player Initialization Failed', error.message);
                }
            }

            isSafari() {
                return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
            }

            setupVideoSource() {
                const videoType = this.getVideoType(this.currentVideoUrl);
                console.log('Setting up video source:', { url: this.currentVideoUrl, type: videoType });

                if (videoType === 'application/x-mpegURL') {
                    this.setupHLSStream();
                } else {
                    this.setupDirectVideo();
                }
            }

            setupHLSStream() {
                console.log('Setting up HLS stream');
                
                if (this.hls) {
                    this.hls.destroy();
                    this.hls = null;
                }

                const videoElement = this.player.el().querySelector('video');
                
                if (this.isSafari()) {
                    console.log('Using Safari native HLS support');
                    this.player.src({
                        src: this.currentVideoUrl,
                        type: 'application/x-mpegURL'
                    });
                } else if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                    console.log('Using HLS.js for cross-browser support');
                    
                    this.hls = new Hls({
                        startLevel: -1,
                        capLevelToPlayerSize: true,
                        enableWorker: true,
                        lowLatencyMode: false,
                        backBufferLength: 90,
                        maxBufferLength: 30,
                        maxMaxBufferLength: 600,
                        liveSyncDurationCount: 3,
                        liveMaxLatencyDurationCount: 5,
                        enableSoftwareAES: true,
                        manifestLoadingTimeOut: 10000,
                        manifestLoadingMaxRetry: 4,
                        levelLoadingTimeOut: 10000,
                        levelLoadingMaxRetry: 4,
                        fragLoadingTimeOut: 20000,
                        fragLoadingMaxRetry: 6,
                        xhrSetup: function(xhr, url) {
                            xhr.withCredentials = false;
                        }
                    });

                    this.hls.loadSource(this.currentVideoUrl);
                    this.hls.attachMedia(videoElement);

                    this.setupHLSEvents();
                } else {
                    console.log('Trying native HLS fallback');
                    if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
                        this.player.src({
                            src: this.currentVideoUrl,
                            type: 'application/x-mpegURL'
                        });
                    } else {
                        this.showError('Browser Not Supported', 'HLS streaming is not supported in this browser. Please try Chrome, Firefox, Safari, or Edge.');
                    }
                }
            }

            setupDirectVideo() {
                console.log('Setting up direct video');
                this.player.src({
                    src: this.currentVideoUrl,
                    type: this.getVideoType(this.currentVideoUrl)
                });
            }

            setupHLSEvents() {
                this.hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                    console.log('HLS manifest parsed', data);
                    this.qualities = data.levels.map((level, index) => ({
                        index: index,
                        height: level.height,
                        width: level.width,
                        bitrate: level.bitrate,
                        label: `${level.height}p`
                    }));
                    this.updateQualityMenu();
                });

                this.hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
                    console.log('Quality level switched to:', data.level);
                    if (this.qualities[data.level]) {
                        document.getElementById('currentQuality').textContent = 
                            this.currentQuality === 'auto' ? 'Auto' : this.qualities[data.level].label;
                    }
                });

                this.hls.on(Hls.Events.ERROR, (event, data) => {
                    console.error('HLS error:', data);
                    
                    if (data.fatal) {
                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                console.log('Fatal network error, trying to recover...');
                                this.hls.startLoad();
                                break;
                                
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                console.log('Fatal media error, trying to recover...');
                                this.hls.recoverMediaError();
                                break;
                                
                            default:
                                console.log('Fatal error, cannot recover');
                                this.showError('Streaming Error', `Video streaming failed: ${data.details}`);
                                break;
                        }
                    } else {
                        console.warn('Non-fatal HLS error:', data.details);
                    }
                });

                this.hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
                    console.log('Fragment loaded successfully');
                });
            }

            setupPlayerEvents() {
                this.player.on('loadstart', () => {
                    console.log('Video loading started');
                    this.showLoading(true);
                });

                this.player.on('loadedmetadata', () => {
                    console.log('Video metadata loaded');
                    this.updateVideoInfo();
                });

                this.player.on('canplay', () => {
                    console.log('Video can start playing');
                    this.showLoading(false);
                });

                this.player.on('play', () => {
                    console.log('Video started playing');
                });

                this.player.on('pause', () => {
                    console.log('Video paused');
                });

                this.player.on('ended', () => {
                    console.log('Video ended');
                    this.onVideoEnded();
                });

                this.player.on('error', () => {
                    const error = this.player.error();
                    console.error('Player error:', error);
                    this.handlePlayerError(error);
                });

                this.player.on('waiting', () => {
                    this.showLoading(true);
                });

                this.player.on('playing', () => {
                    this.showLoading(false);
                });

                // Custom keyboard shortcuts
                this.player.on('keydown', (event) => {
                    this.handleKeyboardShortcuts(event.which || event.keyCode);
                });
            }

            setupEventListeners() {
                // Click outside to close menus
                document.addEventListener('click', (e) => {
                    if (!e.target.closest('.settings-menu') && !e.target.closest('.quality-menu')) {
                        this.hideAllMenus();
                    }
                });

                // Keyboard shortcuts
                document.addEventListener('keydown', (e) => {
                    this.handleKeyboardShortcuts(e.keyCode);
                });

                // Quality menu items
                document.querySelectorAll('.quality-item').forEach(item => {
                    item.addEventListener('click', (e) => {
                        this.setQuality(e.target.dataset.quality);
                    });
                });
            }

            handleKeyboardShortcuts(keyCode) {
                if (!this.player) return;

                switch (keyCode) {
                    case 32: // Space
                        if (this.player.paused()) {
                            this.player.play();
                        } else {
                            this.player.pause();
                        }
                        break;
                    case 37: // Left arrow
                        this.player.currentTime(Math.max(0, this.player.currentTime() - 10));
                        break;
                    case 39: // Right arrow
                        this.player.currentTime(Math.min(this.player.duration(), this.player.currentTime() + 10));
                        break;
                    case 38: // Up arrow
                        this.player.volume(Math.min(1, this.player.volume() + 0.1));
                        break;
                    case 40: // Down arrow
                        this.player.volume(Math.max(0, this.player.volume() - 0.1));
                        break;
                    case 70: // F key
                        this.toggleFullscreen();
                        break;
                    case 77: // M key
                        this.player.muted(!this.player.muted());
                        break;
                    case 84: // T key
                        this.toggleTheater();
                        break;
                }
            }

            getVideoType(url) {
                if (url.includes('.m3u8')) {
                    return 'application/x-mpegURL';
                } else if (url.includes('.mp4')) {
                    return 'video/mp4';
                } else if (url.includes('.webm')) {
                    return 'video/webm';
                } else if (url.includes('.mov')) {
                    return 'video/quicktime';
                } else if (url.includes('.avi')) {
                    return 'video/x-msvideo';
                } else {
                    return 'application/x-mpegURL';
                }
            }

            showLoading(show) {
                const spinner = document.getElementById('loadingSpinner');
                spinner.style.display = show ? 'block' : 'none';
            }

            showError(title, message) {
                const overlay = document.getElementById('errorOverlay');
                const messageEl = document.getElementById('errorMessage');
                
                overlay.querySelector('.error-title').textContent = title;
                messageEl.textContent = message;
                overlay.style.display = 'flex';
                
                this.showLoading(false);
            }

            hideError() {
                document.getElementById('errorOverlay').style.display = 'none';
            }

            updateVideoInfo() {
                const duration = this.player.duration();
                if (duration && !isNaN(duration)) {
                    // Update video metadata (placeholder for now)
                    document.getElementById('viewCount').textContent = 'Processing...';
                    document.getElementById('uploadDate').textContent = new Date().toLocaleDateString();
                }
            }

            updateQualityMenu() {
                const menu = document.getElementById('qualityMenu');
                const items = this.qualities.map((quality, index) => 
                    `<div class="quality-item" data-quality="${index}">${quality.label}</div>`
                ).join('');
                
                menu.innerHTML = `
                    <div class="quality-item active" data-quality="auto">Auto</div>
                    ${items}
                `;
                
                // Re-attach event listeners
                menu.querySelectorAll('.quality-item').forEach(item => {
                    item.addEventListener('click', (e) => {
                        this.setQuality(e.target.dataset.quality);
                    });
                });
            }

            setQuality(quality) {
                if (this.hls) {
                    if (quality === 'auto') {
                        this.hls.currentLevel = -1;
                        this.currentQuality = 'auto';
                    } else {
                        const levelIndex = parseInt(quality);
                        if (levelIndex >= 0 && levelIndex < this.qualities.length) {
                            this.hls.currentLevel = levelIndex;
                            this.currentQuality = this.qualities[levelIndex].label;
                        }
                    }
                    
                    document.getElementById('currentQuality').textContent = 
                        this.currentQuality === 'auto' ? 'Auto' : this.currentQuality;
                }
                
                this.hideAllMenus();
            }

            hideAllMenus() {
                document.getElementById('settingsMenu').style.display = 'none';
                document.getElementById('qualityMenu').style.display = 'none';
            }

            onVideoEnded() {
                // Handle video end (show related videos, etc.)
                console.log('Video playback completed');
            }

            handlePlayerError(error) {
                let title = 'Playback Error';
                let message = 'An error occurred while playing the video.';
                
                if (error) {
                    switch (error.code) {
                        case 1:
                            title = 'Video Loading Aborted';
                            message = 'Video loading was interrupted.';
                            break;
                        case 2:
                            title = 'Network Error';
                            message = 'A network error occurred while loading the video.';
                            break;
                        case 3:
                            title = 'Decoding Error';
                            message = 'The video could not be decoded.';
                            break;
                        case 4:
                            title = 'Format Not Supported';
                            message = 'The video format is not supported by this browser.';
                            break;
                        default:
                            message = error.message || 'Unknown error occurred.';
                    }
                }
                
                this.showError(title, message);
            }

            destroy() {
                if (this.hls) {
                    this.hls.destroy();
                    this.hls = null;
                }
                if (this.player) {
                    this.player.dispose();
                    this.player = null;
                }
            }
        }

        // Global functions
        function goBack() {
            window.history.back();
        }

        function toggleFullscreen() {
            if (window.youtubePlayer && window.youtubePlayer.player) {
                if (window.youtubePlayer.player.isFullscreen()) {
                    window.youtubePlayer.player.exitFullscreen();
                } else {
                    window.youtubePlayer.player.requestFullscreen();
                }
            }
        }

        function toggleTheater() {
            // Theater mode implementation
            const container = document.querySelector('.player-container');
            const wrapper = document.getElementById('videoWrapper');
            
            if (window.youtubePlayer.isTheaterMode) {
                container.style.maxWidth = '1280px';
                wrapper.style.height = 'auto';
                window.youtubePlayer.isTheaterMode = false;
            } else {
                container.style.maxWidth = '100%';
                wrapper.style.height = '70vh';
                window.youtubePlayer.isTheaterMode = true;
            }
        }

        function retryPlayback() {
            if (window.youtubePlayer) {
                window.youtubePlayer.hideError();
                window.youtubePlayer.setupVideoSource();
            }
        }

        function toggleQualityMenu() {
            const menu = document.getElementById('qualityMenu');
            menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
        }

        function togglePlaybackSpeed() {
            if (window.youtubePlayer && window.youtubePlayer.player) {
                window.youtubePlayer.currentSpeedIndex = 
                    (window.youtubePlayer.currentSpeedIndex + 1) % window.youtubePlayer.playbackSpeeds.length;
                
                const newSpeed = window.youtubePlayer.playbackSpeeds[window.youtubePlayer.currentSpeedIndex];
                window.youtubePlayer.player.playbackRate(newSpeed);
                
                document.getElementById('currentSpeed').textContent = 
                    newSpeed === 1 ? 'Normal' : `${newSpeed}x`;
            }
        }

        function toggleLike() {
            // Implement like functionality
            console.log('Like toggled');
        }

        function toggleDislike() {
            // Implement dislike functionality
            console.log('Dislike toggled');
        }

        function shareVideo() {
            if (navigator.share) {
                navigator.share({
                    title: document.getElementById('videoTitleMain').textContent,
                    url: window.location.href
                });
            } else {
                // Fallback: copy to clipboard
                navigator.clipboard.writeText(window.location.href);
                alert('Video link copied to clipboard!');
            }
        }

        function downloadVideo() {
            // Implement download functionality
            alert('Download feature coming soon!');
        }

        function reportVideo() {
            // Implement report functionality
            alert('Report submitted. Thank you for helping keep our platform safe.');
        }

        // Initialize player when page loads
        document.addEventListener('DOMContentLoaded', () => {
            console.log('DOM loaded, initializing YouTube-style player...');
            window.youtubePlayer = new YouTubeStylePlayer();
        });

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            if (window.youtubePlayer) {
                window.youtubePlayer.destroy();
            }
        });