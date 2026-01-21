// Google OAuth2 Authentication Module

const Auth = (() => {
    // IMPORTANT: Replace with your actual Client ID from Google Cloud Console
    const CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
    const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

    let tokenClient = null;
    let accessToken = null;
    let isInitialized = false;

    // Callbacks
    let onAuthSuccess = null;
    let onAuthError = null;
    let onLogout = null;

    /**
     * Initialize Google Identity Services
     */
    function init(callbacks = {}) {
        onAuthSuccess = callbacks.onSuccess || (() => {});
        onAuthError = callbacks.onError || (() => {});
        onLogout = callbacks.onLogout || (() => {});

        // Check for saved token
        const savedToken = localStorage.getItem('bop_access_token');
        const tokenExpiry = localStorage.getItem('bop_token_expiry');

        if (savedToken && tokenExpiry && Date.now() < parseInt(tokenExpiry)) {
            accessToken = savedToken;
            onAuthSuccess(accessToken);
        }

        // Wait for Google Identity Services to load
        if (typeof google !== 'undefined' && google.accounts) {
            initTokenClient();
        } else {
            // Wait for script to load
            const checkGoogle = setInterval(() => {
                if (typeof google !== 'undefined' && google.accounts) {
                    clearInterval(checkGoogle);
                    initTokenClient();
                }
            }, 100);

            // Timeout after 10 seconds
            setTimeout(() => clearInterval(checkGoogle), 10000);
        }
    }

    /**
     * Initialize the token client
     */
    function initTokenClient() {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: handleTokenResponse,
            error_callback: handleTokenError
        });
        isInitialized = true;
        console.log('Google Auth initialized');
    }

    /**
     * Handle successful token response
     */
    function handleTokenResponse(response) {
        if (response.access_token) {
            accessToken = response.access_token;

            // Calculate expiry (default 1 hour)
            const expiresIn = response.expires_in || 3600;
            const expiryTime = Date.now() + (expiresIn * 1000);

            // Save to localStorage
            localStorage.setItem('bop_access_token', accessToken);
            localStorage.setItem('bop_token_expiry', expiryTime.toString());

            onAuthSuccess(accessToken);
        }
    }

    /**
     * Handle token error
     */
    function handleTokenError(error) {
        console.error('Auth error:', error);
        onAuthError(error);
    }

    /**
     * Trigger login flow
     */
    function login() {
        if (!isInitialized) {
            console.error('Auth not initialized');
            onAuthError({ message: 'Auth not initialized. Please refresh the page.' });
            return;
        }

        // Check if we have a valid token
        if (accessToken) {
            onAuthSuccess(accessToken);
            return;
        }

        // Request new token
        tokenClient.requestAccessToken({ prompt: 'consent' });
    }

    /**
     * Logout and clear tokens
     */
    function logout() {
        if (accessToken) {
            // Revoke the token
            google.accounts.oauth2.revoke(accessToken, () => {
                console.log('Token revoked');
            });
        }

        // Clear stored data
        accessToken = null;
        localStorage.removeItem('bop_access_token');
        localStorage.removeItem('bop_token_expiry');
        localStorage.removeItem('bop_selected_store');

        onLogout();
    }

    /**
     * Get current access token
     */
    function getToken() {
        return accessToken;
    }

    /**
     * Check if user is authenticated
     */
    function isAuthenticated() {
        const tokenExpiry = localStorage.getItem('bop_token_expiry');
        return accessToken && tokenExpiry && Date.now() < parseInt(tokenExpiry);
    }

    /**
     * Refresh token if needed
     */
    function refreshTokenIfNeeded() {
        return new Promise((resolve, reject) => {
            const tokenExpiry = localStorage.getItem('bop_token_expiry');

            // If token expires in less than 5 minutes, refresh it
            if (!tokenExpiry || Date.now() > parseInt(tokenExpiry) - (5 * 60 * 1000)) {
                if (!isInitialized) {
                    reject(new Error('Auth not initialized'));
                    return;
                }

                // Set up one-time callback for refresh
                const originalCallback = onAuthSuccess;
                onAuthSuccess = (token) => {
                    onAuthSuccess = originalCallback;
                    originalCallback(token);
                    resolve(token);
                };

                const originalErrorCallback = onAuthError;
                onAuthError = (error) => {
                    onAuthError = originalErrorCallback;
                    originalErrorCallback(error);
                    reject(error);
                };

                tokenClient.requestAccessToken({ prompt: '' });
            } else {
                resolve(accessToken);
            }
        });
    }

    // Public API
    return {
        init,
        login,
        logout,
        getToken,
        isAuthenticated,
        refreshTokenIfNeeded
    };
})();
