const express = require('express');
const session = require('express-session');
const { Issuer, generators } = require('openid-client');
const axios = require('axios');
const https = require('https');
const dnscache = require('dns-cache');
const app = express();

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
    timeout: 60000, // 60 second timeout
    httpsAgent: httpsAgent,
    maxRedirects: 0, // Disable redirects
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
    }
});

// Configure view engine
app.set('view engine', 'ejs');

// Configure session middleware with a strong secret
app.use(session({
    secret: 'your-secure-random-secret-1234567890', // Replace with a strong secret
    resave: false,
    saveUninitialized: false
}));

// Increase default max listeners to prevent warning
require('events').EventEmitter.defaultMaxListeners = 15;

let client;
// Initialize OpenID Client
// Global configuration
const region = 'us-east-1';
const userPoolId = 'us-east-1_bVbdGpdWd';
const cognitoDomain = 'https://us-east-1bvbdgpdwd.auth.us-east-1.amazoncognito.com';

async function initializeClient() {
    try {
        console.log('Setting up OpenID Client with manual configuration...');

        // Manually create the issuer with Cognito endpoints
        const issuer = new Issuer({
            issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
            authorization_endpoint: `${cognitoDomain}/oauth2/authorize`,
            token_endpoint: `${cognitoDomain}/oauth2/token`,
            userinfo_endpoint: `${cognitoDomain}/oauth2/userInfo`,
            end_session_endpoint: `${cognitoDomain}/logout`,
            jwks_uri: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`,
            token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
            grant_types_supported: ['authorization_code', 'refresh_token'],
            response_types_supported: ['code']
        });

        console.log('Successfully configured issuer');

        client = new issuer.Client({
            client_id: '7mcc0trmggj5145u6jd1sg919a',
            client_secret: '19a622dctb4ibb8evppl6rp4rga41ho3qk0qu9elnl4on9ksu2bb',
            redirect_uris: ['http://localhost:3000/callback'],
            response_types: ['code'],
            token_endpoint_auth_method: 'client_secret_post',
            http_options: {
                timeout: 30000, // 30 seconds timeout for all HTTP requests
                retry: 2 // Retry failed requests twice
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

        // Verify state if it was stored in session
        if (req.session.state && params.state !== req.session.state) {
            throw new Error('State mismatch in callback');
        }

        console.log('Exchanging code for tokens...');
        const tokenEndpoint = `${cognitoDomain}/oauth2/token`;
        
        // Create authorization header
        const basicAuth = Buffer.from(`${client.client_id}:${client.client_secret}`).toString('base64');
        
        const tokenParams = new URLSearchParams({
            grant_type: 'authorization_code',
            code: params.code,
            client_id: client.client_id,
            redirect_uri: 'http://localhost:3000/callback'
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
            // Log detailed error information
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
                errorMessage += 'Connection timed out. This might be due to network issues. Please check your connection and try again.';
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
    req.session.destroy(() => {
        // Use the same Cognito domain as in initializeClient
        const cognitoDomain = 'myapp.auth.us-east-1.amazoncognito.com'; // Verify this
        const logoutUrl = `https://${cognitoDomain}/logout?client_id=7mcc0trmggj5145u6jd1sg919a&logout_uri=http://localhost:3000`;
        res.redirect(logoutUrl);
    });
});

// Start server after initializing the client
const port = 3000;
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