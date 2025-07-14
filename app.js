require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { Issuer, generators } = require('openid-client');
const axios = require('axios');
const https = require('https');
const dnscache = require('dns-cache');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs').promises;
const multer = require('multer');
const path = require('path');
const app = express();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });

// AWS Configuration (not used for presigned URL but kept for potential use)
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    signatureVersion: 'v4'
});

// Enable DNS caching
dnscache(300000); // Cache DNS for 5 minutes

// Create a custom HTTPS agent
const httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 3000,
    maxSockets: 2,
    timeout: 60000,
    family: 4 // Force IPv4
});

// Create axios instance with defaults
const axiosInstance = axios.create({
    timeout: 60000,
    httpsAgent: httpsAgent,
    maxRedirects: 0,
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
    }
});

// Configure view engine
app.set('view engine', 'ejs');

// Serve static files
app.use(express.static('public'));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add CORS headers for video streaming
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    next();
});

// Configure session middleware
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

// Increase default max listeners
require('events').EventEmitter.defaultMaxListeners = 15;

// Global configuration
const region = process.env.AWS_REGION;
const userPoolId = process.env.COGNITO_USER_POOL_ID;
const cognitoDomain = process.env.COGNITO_DOMAIN;

let client;

// Initialize OpenID Client
async function initializeClient() {
    try {
        console.log('Setting up OpenID Client with manual configuration...');
        const issuer = new Issuer({
            issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
            authorization_endpoint: `${cognitoDomain}/oauth2/authorize`,
            token_endpoint: `${cognitoDomain}/oauth2/token`,
            userinfo_endpoint: `${cognitoDomain}/oauth2/userInfo`,
            end_session_endpoint: `https://${cognitoDomain}/logout`,
            jwks_uri: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`,
            token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
            grant_types_supported: ['authorization_code', 'refresh_token'],
            response_types_supported: ['code']
        });
        redirect_uri = `${process.env.REDIRECT_UR}/callback`;

        console.log('Successfully configured issuer');

        client = new issuer.Client({
            client_id: process.env.COGNITO_CLIENT_ID,
            client_secret: process.env.COGNITO_CLIENT_SECRET,
            redirect_uris: [redirect_uri],
            response_types: ['code'],
            token_endpoint_auth_method: 'client_secret_post',
            http_options: {
                timeout: 30000,
                retry: 2
            }
        });

        return client;
    } catch (error) {
        console.error('Error during OpenID Client initialization:', error);
        throw error;
    }
}

// Authentication middleware
const checkAuth = (req, res, next) => {
    req.isAuthenticated = !!req.session.userInfo;
    next();
};

// JWT verification middleware
const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'No token provided' });
        }
        req.user = { token: authHeader };
        next();
    } catch (error) {
        console.error('Token verification error:', error);
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Home route
app.get('/', checkAuth, (req, res) => {
    res.render('home', {
        isAuthenticated: req.isAuthenticated,
        userInfo: req.session.userInfo
    });
});

// Callback route
app.get('/callback', async (req, res) => {
    if (!req.query.code) {
        console.warn('No code provided in callback');
        return res.redirect('/');
    }
    try {
        console.log('Processing callback with code...');
        const params = client.callbackParams(req);
        console.log('Callback params:', params);

        if (!client) {
            throw new Error('OpenID client not initialized');
        }

        if (req.session.state && params.state !== req.session.state) {
            throw new Error('State mismatch in callback');
        }
        console.log('Exchanging code for tokens...');
        const tokenEndpoint = `${cognitoDomain}/oauth2/token`;
        const basicAuth = Buffer.from(`${client.client_id}:${client.client_secret}`).toString('base64');
      redirect_uri = `${process.env.REDIRECT_UR}/callback`;
        const tokenParams = new URLSearchParams({
            grant_type: 'authorization_code',
            code: params.code,
            client_id: client.client_id,
            redirect_uri: redirect_uri
        }).toString();

        console.log('Making token request to:', tokenEndpoint);
        const tokenResponse = await axiosInstance.post(tokenEndpoint, tokenParams, {
            headers: {
                'Authorization': `Basic ${basicAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        if (!tokenResponse.data || !tokenResponse.data.access_token) {
            throw new Error('No access token received from authentication server');
        }

        console.log('Token received, fetching user info...');
        const userInfoResponse = await axiosInstance.get(`${cognitoDomain}/oauth2/userInfo`, {
            headers: {
                'Authorization': `Bearer ${tokenResponse.data.access_token}`
            }
        });

        if (!userInfoResponse.data) {
            throw new Error('Failed to fetch user information');
        }

        req.session.userInfo = userInfoResponse.data;
        req.session.tokenSet = tokenResponse.data;
        console.log('User info and tokens stored in session');

        return res.redirect('/');
    } catch (err) {
        console.error('Callback error:', err);
        let errorMessage = 'Authentication failed. ';
        if (axios.isAxiosError(err)) {
            console.error('Detailed Axios error:', {
                message: err.message,
                code: err.code,
                name: err.name,
                stack: err.stack,
                status: err.response?.status,
                statusText: err.response?.statusText,
                headers: err.response?.headers,
                data: err.response?.data,
                config: {
                    url: err.config?.url,
                    method: err.config?.method,
                    timeout: err.config?.timeout,
                    headers: err.config?.headers
                }
            });

            if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
                console.log('Attempting to resolve DNS manually...');
                const dns = require('dns').promises;
                try {
                    const addresses = await dns.resolve4('us-east-1bvbdgpdwd.auth.us-east-1.amazoncognito.com');
                    console.log('Available IPv4 addresses:', addresses);
                } catch (dnsErr) {
                    console.error('DNS resolution failed:', dnsErr);
                }
                errorMessage += 'Connection timed out. Please check your connection and try again.';
            } else if (err.response?.status === 401) {
                errorMessage += 'Invalid client credentials. Please check your client ID and secret.';
            } else if (err.response?.data?.error_description) {
                errorMessage += err.response.data.error_description;
            } else if (err.response?.data?.message) {
                errorMessage += err.response.data.message;
            } else {
                errorMessage += `Network error: ${err.message}. Please try again.`;
            }
        } else {
            console.error('Error details:', {
                message: err.message,
                name: err.name
            });
            errorMessage += err.message || 'Please try again.';
        }
        return res.render('error', { error: errorMessage });
    }
});

// Login route
app.get('/login', (req, res) => {
    if (!client) {
        console.error('OpenID client not initialized');
        return res.status(500).send('Authentication service not available');
    }
    const state = generators.state();
    req.session.state = state;

    const authUrl = client.authorizationUrl({
        scope: 'email openid phone',
        state: state,
        response_type: 'code'
    });

    res.redirect(authUrl);
});

// Logout route
app.get('/logout', (req, res) => {
        redirect_uri = `${process.env.REDIRECT_UR}`;
    req.session.destroy(() => {
        const redirectUri = redirect_uri;
        const logoutUrl = `${cognitoDomain}/logout?client_id=${process.env.COGNITO_CLIENT_ID}&logout_uri=${encodeURIComponent(redirectUri)}`;
        res.redirect(logoutUrl);
    });
});

// Upload page route
app.get('/upload', checkAuth, (req, res) => {
    if (!req.isAuthenticated) {
        return res.redirect('/login');
    }
    
    
    console.log('Rendering upload page with user info:', req.session);


    res.render('upload', {
        token: req.session.tokenSet?.id_token || '',
        email: req.session.userInfo?.email || '',
        userId: req.session.userInfo?.sub || ''
    });
});
// API endpoint for getting presigned URL and uploading file
app.post('/api/presigned-url', verifyToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const token = req.headers.authorization;
        console.log('Received token:', req.headers);
        const email = req.headers['x-email-id'];
        const userId = req.headers['x-sub-id'];

        console.log('Received userId:', userId);

        const result = await uploadFileWithPresignedUrl(
            req.file.originalname,
            req.file.path,
            token,
            email,
            userId
        );

        if (!result.success) {
            throw new Error(result.message);
        }

        // Clean up temporary file
        try {
            await fs.unlink(req.file.path);
            console.log('Temporary file deleted:', req.file.path);
        } catch (unlinkError) {
            console.error('Failed to delete temporary file:', unlinkError);
        }

        return res.json({
            message: 'File uploaded successfully',
            uploadUrl: result.presignedUrl,
            data: result.response
        });
    } catch (error) {
        console.error('Upload error:', error);
        return res.status(500).json({
            error: 'Failed to upload file',
            details: error.message
        });
    }
});

// Utility function for file uploads
async function uploadFileWithPresignedUrl(fileName, filePath, token,email, userId) {
    try {
        console.log('Getting presigned URL for:', fileName);

        // Step 1: Get presigned URL from API Gateway
        const presignedUrlResponse = await axios.post(
            `${process.env.API_GATEWAY_URL}/`,
            {
                body: JSON.stringify({ file_name: fileName })
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token
                }
            }
        );

        if (presignedUrlResponse.status !== 200) {
            throw new Error(`Failed to get presigned URL: ${presignedUrlResponse.status}`);
        }

        // Parse the response body
        console.log('Presigned URL Response:', JSON.stringify(presignedUrlResponse.data, null, 2));
        const responseBody = JSON.parse(presignedUrlResponse.data.body);
        const uploadUrl = responseBody.upload_url;
        console.log('Presigned URL:', uploadUrl);

        if (!uploadUrl) {
            throw new Error('No upload URL in response');
        }

        // Log URL query parameters for debugging
        const urlObj = new URL(uploadUrl);
        console.log('Presigned URL query params:', Object.fromEntries(urlObj.searchParams));

        // Step 2: Upload file to S3
        if (filePath) {
            const absoluteFilePath = path.resolve(filePath);
            console.log('Reading file from (relative path):', filePath);
            console.log('Reading file from (absolute path):', absoluteFilePath);
            const fileBuffer = await fs.readFile(absoluteFilePath);

            // Try with video/mp4 first
            let uploadResponse;
            try {
                uploadResponse = await axios.put(uploadUrl, fileBuffer, {
                    headers: {
                        'Content-Type': 'video/mp4' // Primary attempt
                    },
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity
                });
                console.log('Upload attempt with video/mp4 succeeded');
                
                // After successful upload (status code 200)
                if (uploadResponse.status === 200) {
                    const postUrl = `https://brz8v7rkb1.execute-api.us-east-1.amazonaws.com/dev/${uploadResponse.data.id}`;

                    const postPayload = {
                        Item: {
                            fileName: fileName,
                            userId: userId,
                            userEmail: email
                        }
                    };
                    
                    try {
                        const postResponse = await axios.post(postUrl, postPayload,{
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': token
                            }
                        });
                        if (postResponse.status === 200) {
                            console.log("Post-upload request successful");
                        } else {
                            console.warn("Post-upload request failed with status code:", postResponse.status);
                        }
                    } catch (postError) {
                        console.error("Error making post-upload request:", postError.message);
                    }
                }
                
            } catch (err) {
                console.error('Upload attempt with video/mp4 failed:', err.response?.data || err.message);
                // Fallback to application/octet-stream
                console.log('Retrying with Content-Type: application/octet-stream');
                uploadResponse = await axios.put(uploadUrl, fileBuffer, {
                    headers: {
                        'Content-Type': 'application/octet-stream' // Fallback
                    },
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity
                });
            }

            if (uploadResponse.status !== 200) {
                console.error('Upload failed with status:', uploadResponse.status, 'Response:', uploadResponse.data);
                throw new Error(`Upload failed with status ${uploadResponse.status}`);
            }

            console.log('File uploaded successfully');
            return {
                success: true,
                message: 'File uploaded successfully',
                presignedUrl: uploadUrl,
                response: uploadResponse.data
            };
        }

        return {
            success: true,
            message: 'Presigned URL generated successfully',
            presignedUrl: uploadUrl,
            response: null
        };
    } catch (error) {
        console.error('Error in uploadFileWithPresignedUrl:', error);
        if (error.response) {
            console.error('Error response:', {
                status: error.response.status,
                statusText: error.response.statusText,
                headers: error.response.headers,
                data: error.response.data
            });
        }
        return {
            success: false,
            message: error.response?.data?.Message || error.message,
            error: error
        };
    }
}

// Add this new route before the server start
app.get('/api/videos/:userId', checkAuth, async (req, res) => {
    try {
        if (!req.session.tokenSet?.id_token) {
            return res.status(401).json({ error: 'No authentication token available' });
        }

        console.log('Fetching videos for user:', req.params.userId);
        
        const response = await axios.get(
            `https://brz8v7rkb1.execute-api.us-east-1.amazonaws.com/dev/${req.params.userId}`,
            {
                headers: {
                    'Authorization': req.session.tokenSet.id_token,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('API Response:', JSON.stringify(response.data, null, 2));
        
        // Transform the response to ensure proper video data structure
        let videos = response.data;
        if (Array.isArray(videos)) {
            videos = videos.map(video => {
                // Ensure all necessary fields are present
                return {
                    id: video.id || video.videoId,
                    fileName: video.fileName || video.filename || video.name,
                    status: video.status || 'unknown',
                    thumbnail: video.thumbnail || video.thumbnailUrl,
                    playbackUrls: video.playbackUrls || video.streamingUrls || (video.videoUrl ? [video.videoUrl] : []),
                    uploadedAt: video.uploadedAt || video.createdAt || new Date().toISOString(),
                    userId: video.userId,
                    userEmail: video.userEmail
                };
            });
        }
        
        console.log('Transformed videos:', JSON.stringify(videos, null, 2));
        res.json(videos);
    } catch (error) {
        console.error('Error fetching videos:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ 
            error: 'Failed to fetch videos',
            details: error.response?.data?.message || error.message
        });
    }
});

// Video player page route
app.get('/player', checkAuth, (req, res) => {
    if (!req.isAuthenticated) {
        return res.redirect('/login');
    }
    
    const videoUrl = req.query.url;
    const videoTitle = req.query.title || 'Video Player';
    
    if (!videoUrl) {
        return res.status(400).render('error', { 
            error: 'No video URL provided' 
        });
    }
    
    console.log('Video player request:', { videoUrl, videoTitle }); // Debug log
    
    res.render('video-player', {
        videoUrl: videoUrl,
        videoTitle: videoTitle,
        userInfo: req.session.userInfo
    });
});

// Start server
const port = process.env.PORT || 3000;
initializeClient()
    .then(() => {
        app.listen(port, () => {
            console.log(`Server running at http://localhost:${port}`);
        });
    })
    .catch(error => {
        console.error('Failed to initialize OpenID client:', error);
        process.exit(1);
    });