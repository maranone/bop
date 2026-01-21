// Google Drive API Module

const Drive = (() => {
    const API_BASE = 'https://www.googleapis.com/drive/v3';
    const FOLDER_MIME = 'application/vnd.google-apps.folder';

    // Cache for folder IDs to reduce API calls
    const folderCache = new Map();

    /**
     * Make authenticated API request
     */
    async function apiRequest(endpoint, params = {}) {
        const token = Auth.getToken();
        if (!token) {
            throw new Error('Not authenticated');
        }

        // Build URL with query params
        const url = new URL(`${API_BASE}${endpoint}`);
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                url.searchParams.append(key, value);
            }
        });

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'API request failed');
        }

        return response.json();
    }

    /**
     * Download file content
     */
    async function downloadFile(fileId) {
        const token = Auth.getToken();
        if (!token) {
            throw new Error('Not authenticated');
        }

        const response = await fetch(
            `${API_BASE}/files/${fileId}?alt=media`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        if (!response.ok) {
            throw new Error('Failed to download file');
        }

        return response.json();
    }

    /**
     * Search for files/folders
     */
    async function search(query, fields = 'files(id,name,mimeType,modifiedTime)') {
        return apiRequest('/files', {
            q: query,
            fields: fields,
            pageSize: 1000,
            orderBy: 'name'
        });
    }

    /**
     * Find BOP folder structure and list available stores
     */
    async function findStores() {
        // Find the BOP folder
        const bopResult = await search(
            `name = 'BOP' and mimeType = '${FOLDER_MIME}' and trashed = false`
        );

        if (!bopResult.files || bopResult.files.length === 0) {
            throw new Error('BOP folder not found in Google Drive');
        }

        const bopFolderId = bopResult.files[0].id;
        folderCache.set('BOP', bopFolderId);

        // Find store folders (subfolders of BOP)
        const storesResult = await search(
            `'${bopFolderId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`
        );

        const stores = [];

        for (const storeFolder of storesResult.files || []) {
            // Check if this folder has a Dashboard subfolder
            const dashboardResult = await search(
                `'${storeFolder.id}' in parents and name = 'Dashboard' and mimeType = '${FOLDER_MIME}' and trashed = false`
            );

            if (dashboardResult.files && dashboardResult.files.length > 0) {
                stores.push({
                    id: storeFolder.id,
                    name: storeFolder.name,
                    dashboardId: dashboardResult.files[0].id
                });

                // Cache the folder IDs
                folderCache.set(`store_${storeFolder.name}`, storeFolder.id);
                folderCache.set(`dashboard_${storeFolder.name}`, dashboardResult.files[0].id);
            }
        }

        return stores;
    }

    /**
     * Get folder IDs for Today and History folders for a store
     */
    async function getStoreFolders(storeName) {
        const dashboardId = folderCache.get(`dashboard_${storeName}`);
        if (!dashboardId) {
            throw new Error('Dashboard folder not found');
        }

        const result = {};

        // Find Today folder
        const todayResult = await search(
            `'${dashboardId}' in parents and name = 'Today' and mimeType = '${FOLDER_MIME}' and trashed = false`
        );
        if (todayResult.files && todayResult.files.length > 0) {
            result.todayId = todayResult.files[0].id;
            folderCache.set(`today_${storeName}`, result.todayId);
        }

        // Find History folder
        const historyResult = await search(
            `'${dashboardId}' in parents and name = 'History' and mimeType = '${FOLDER_MIME}' and trashed = false`
        );
        if (historyResult.files && historyResult.files.length > 0) {
            result.historyId = historyResult.files[0].id;
            folderCache.set(`history_${storeName}`, result.historyId);
        }

        return result;
    }

    /**
     * List available dates (JSON files) for a store
     */
    async function listAvailableDates(storeName) {
        const todayId = folderCache.get(`today_${storeName}`);
        const historyId = folderCache.get(`history_${storeName}`);

        const dates = new Set();

        // Get files from Today folder
        if (todayId) {
            const todayFiles = await search(
                `'${todayId}' in parents and name contains '.json' and trashed = false`,
                'files(id,name,modifiedTime)'
            );

            (todayFiles.files || []).forEach(file => {
                const dateName = file.name.replace('.json', '');
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateName)) {
                    dates.add(dateName);
                }
            });
        }

        // Get files from History folder
        if (historyId) {
            const historyFiles = await search(
                `'${historyId}' in parents and name contains '.json' and trashed = false`,
                'files(id,name,modifiedTime)'
            );

            (historyFiles.files || []).forEach(file => {
                const dateName = file.name.replace('.json', '');
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateName)) {
                    dates.add(dateName);
                }
            });
        }

        return Array.from(dates).sort().reverse();
    }

    /**
     * Get checklist data for a specific date
     */
    async function getChecklistForDate(storeName, dateStr) {
        const todayId = folderCache.get(`today_${storeName}`);
        const historyId = folderCache.get(`history_${storeName}`);

        const filename = `${dateStr}.json`;

        // Try Today folder first
        if (todayId) {
            const todaySearch = await search(
                `'${todayId}' in parents and name = '${filename}' and trashed = false`,
                'files(id,name)'
            );

            if (todaySearch.files && todaySearch.files.length > 0) {
                return downloadFile(todaySearch.files[0].id);
            }
        }

        // Try History folder
        if (historyId) {
            const historySearch = await search(
                `'${historyId}' in parents and name = '${filename}' and trashed = false`,
                'files(id,name)'
            );

            if (historySearch.files && historySearch.files.length > 0) {
                return downloadFile(historySearch.files[0].id);
            }
        }

        return null;
    }

    /**
     * Clear the folder cache
     */
    function clearCache() {
        folderCache.clear();
    }

    // Public API
    return {
        findStores,
        getStoreFolders,
        listAvailableDates,
        getChecklistForDate,
        clearCache
    };
})();
