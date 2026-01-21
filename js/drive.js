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
     * Searches in Dashboard/Today, Dashboard/History, Dashboard/Admin/Today, Dashboard/Admin/History
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

        // Find Admin folder and its Today/History subfolders
        const adminResult = await search(
            `'${dashboardId}' in parents and name = 'Admin' and mimeType = '${FOLDER_MIME}' and trashed = false`
        );
        if (adminResult.files && adminResult.files.length > 0) {
            const adminId = adminResult.files[0].id;

            // Find Admin/Today folder
            const adminTodayResult = await search(
                `'${adminId}' in parents and name = 'Today' and mimeType = '${FOLDER_MIME}' and trashed = false`
            );
            if (adminTodayResult.files && adminTodayResult.files.length > 0) {
                folderCache.set(`admin_today_${storeName}`, adminTodayResult.files[0].id);
            }

            // Find Admin/History folder
            const adminHistoryResult = await search(
                `'${adminId}' in parents and name = 'History' and mimeType = '${FOLDER_MIME}' and trashed = false`
            );
            if (adminHistoryResult.files && adminHistoryResult.files.length > 0) {
                folderCache.set(`admin_history_${storeName}`, adminHistoryResult.files[0].id);
            }
        }

        return result;
    }

    /**
     * List all JSON files from a folder
     */
    async function listJsonFiles(folderId) {
        if (!folderId) return [];

        const result = await search(
            `'${folderId}' in parents and name contains '.json' and trashed = false`,
            'files(id,name,modifiedTime)'
        );

        return result.files || [];
    }

    /**
     * List available dates (JSON files) for a store
     * Includes daily, weekly, and monthly files from all folders
     */
    async function listAvailableDates(storeName) {
        const todayId = folderCache.get(`today_${storeName}`);
        const historyId = folderCache.get(`history_${storeName}`);
        const adminTodayId = folderCache.get(`admin_today_${storeName}`);
        const adminHistoryId = folderCache.get(`admin_history_${storeName}`);

        const dates = new Set();

        // Get files from all folders in parallel
        const [todayFiles, historyFiles, adminTodayFiles, adminHistoryFiles] = await Promise.all([
            listJsonFiles(todayId),
            listJsonFiles(historyId),
            listJsonFiles(adminTodayId),
            listJsonFiles(adminHistoryId)
        ]);

        const allFiles = [...todayFiles, ...historyFiles, ...adminTodayFiles, ...adminHistoryFiles];

        // Extract dates from filenames (daily files only for calendar display)
        allFiles.forEach(file => {
            // Match daily files: YYYY-MM-DD.json
            const dailyMatch = file.name.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
            if (dailyMatch) {
                dates.add(dailyMatch[1]);
            }
        });

        return Array.from(dates).sort().reverse();
    }

    /**
     * Find a file in a specific folder
     */
    async function findFileInFolder(folderId, filename) {
        if (!folderId) return null;

        const result = await search(
            `'${folderId}' in parents and name = '${filename}' and trashed = false`,
            'files(id,name)'
        );

        return (result.files && result.files.length > 0) ? result.files[0] : null;
    }

    /**
     * Find a file in Today, History, Admin/Today, or Admin/History folders
     */
    async function findFile(storeName, filename) {
        const todayId = folderCache.get(`today_${storeName}`);
        const historyId = folderCache.get(`history_${storeName}`);
        const adminTodayId = folderCache.get(`admin_today_${storeName}`);
        const adminHistoryId = folderCache.get(`admin_history_${storeName}`);

        // Search all folders in parallel
        const [todayFile, historyFile, adminTodayFile, adminHistoryFile] = await Promise.all([
            findFileInFolder(todayId, filename),
            findFileInFolder(historyId, filename),
            findFileInFolder(adminTodayId, filename),
            findFileInFolder(adminHistoryId, filename)
        ]);

        // Return the first found file (priority: Today > History > Admin/Today > Admin/History)
        return todayFile || historyFile || adminTodayFile || adminHistoryFile || null;
    }

    /**
     * Find all matching files across all folders (for combining checklists)
     * Returns files with isAdmin flag to allow proper ordering
     */
    async function findAllFiles(storeName, filename) {
        const todayId = folderCache.get(`today_${storeName}`);
        const historyId = folderCache.get(`history_${storeName}`);
        const adminTodayId = folderCache.get(`admin_today_${storeName}`);
        const adminHistoryId = folderCache.get(`admin_history_${storeName}`);

        // Search all folders in parallel
        const [todayFile, historyFile, adminTodayFile, adminHistoryFile] = await Promise.all([
            findFileInFolder(todayId, filename),
            findFileInFolder(historyId, filename),
            findFileInFolder(adminTodayId, filename),
            findFileInFolder(adminHistoryId, filename)
        ]);

        // Return all found files with isAdmin flag
        const results = [];
        if (todayFile) results.push({ ...todayFile, isAdmin: false });
        if (historyFile) results.push({ ...historyFile, isAdmin: false });
        if (adminTodayFile) results.push({ ...adminTodayFile, isAdmin: true });
        if (adminHistoryFile) results.push({ ...adminHistoryFile, isAdmin: true });
        return results;
    }

    /**
     * Get the Monday of the week for a given date
     */
    function getWeekStart(dateStr) {
        const [year, month, day] = dateStr.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        const dayOfWeek = date.getDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        date.setDate(date.getDate() + diff);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /**
     * Get the first day of the month for a given date
     */
    function getMonthStart(dateStr) {
        const [year, month] = dateStr.split('-').map(Number);
        return `${year}-${String(month).padStart(2, '0')}-01`;
    }

    /**
     * Get checklist data for a specific date
     * Returns combined daily + weekly + monthly checklists from all folders
     */
    async function getChecklistForDate(storeName, dateStr) {
        const dailyFilename = `${dateStr}.json`;
        const weeklyFilename = `${getWeekStart(dateStr)}_weekly.json`;
        const monthlyFilename = `${getMonthStart(dateStr)}_monthly.json`;

        console.log('Looking for files:', { dailyFilename, weeklyFilename, monthlyFilename });

        // Search for all files across all folders in parallel
        const [dailyFiles, weeklyFiles, monthlyFiles] = await Promise.all([
            findAllFiles(storeName, dailyFilename),
            findAllFiles(storeName, weeklyFilename),
            findAllFiles(storeName, monthlyFilename)
        ]);

        console.log('Found files:', {
            daily: dailyFiles.map(f => f.name),
            weekly: weeklyFiles.map(f => f.name),
            monthly: monthlyFiles.map(f => f.name)
        });

        // Collect all files to download (maintaining isAdmin flag)
        const allFiles = [...dailyFiles, ...weeklyFiles, ...monthlyFiles];

        if (allFiles.length === 0) {
            return null;
        }

        // Download all found files in parallel, keeping track of isAdmin
        const downloads = allFiles.map(file =>
            downloadFile(file.id)
                .then(data => ({ data, isAdmin: file.isAdmin }))
                .catch(err => {
                    console.error(`Error downloading ${file.name}:`, err);
                    return null;
                })
        );

        const results = await Promise.all(downloads);

        // Combine all checklists, marking admin ones with _isAdmin property
        const combined = {
            date: dateStr,
            checklists: {}
        };

        results.forEach(result => {
            if (result && result.data && result.data.checklists) {
                for (const [name, checklist] of Object.entries(result.data.checklists)) {
                    combined.checklists[name] = {
                        ...checklist,
                        _isAdmin: result.isAdmin
                    };
                }
            }
        });

        return Object.keys(combined.checklists).length > 0 ? combined : null;
    }

    /**
     * Clear the folder cache
     */
    function clearCache() {
        folderCache.clear();
    }

    // ==================== INVENTARIO FUNCTIONS ====================

    /**
     * Find Inventario folder for a store
     * Structure: BOP/{storeName}/Inventario/
     * Note: Folder is created by the inventory program, not by the PWA
     */
    async function findInventarioFolder(storeName) {
        const storeId = folderCache.get(`store_${storeName}`);
        if (!storeId) {
            throw new Error('Store folder not found');
        }

        // Check cache first
        const cachedId = folderCache.get(`inventario_${storeName}`);
        if (cachedId) {
            return cachedId;
        }

        // Search for existing Inventario folder
        const result = await search(
            `'${storeId}' in parents and name = 'Inventario' and mimeType = '${FOLDER_MIME}' and trashed = false`
        );

        if (result.files && result.files.length > 0) {
            folderCache.set(`inventario_${storeName}`, result.files[0].id);
            return result.files[0].id;
        }

        // Folder doesn't exist - will be created by inventory program
        return null;
    }

    /**
     * Find or create Inventario folder for a store (creates if needed for revisados.json)
     */
    async function findOrCreateInventarioFolder(storeName) {
        const existingId = await findInventarioFolder(storeName);
        if (existingId) {
            return existingId;
        }

        // Create folder if not exists (for storing revisados.json)
        const storeId = folderCache.get(`store_${storeName}`);
        const token = Auth.getToken();
        const createResponse = await fetch(`${API_BASE}/files`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: 'Inventario',
                mimeType: FOLDER_MIME,
                parents: [storeId]
            })
        });

        if (!createResponse.ok) {
            throw new Error('Failed to create Inventario folder');
        }

        const newFolder = await createResponse.json();
        folderCache.set(`inventario_${storeName}`, newFolder.id);
        return newFolder.id;
    }

    /**
     * Get discrepancias.csv content from Inventario folder
     * This file contains only items with stock differences pending admin review
     */
    async function getDiscrepancias(storeName) {
        const inventarioId = await findOrCreateInventarioFolder(storeName);

        // Find discrepancias.csv file
        const result = await search(
            `'${inventarioId}' in parents and name = 'discrepancias.csv' and trashed = false`,
            'files(id,name,modifiedTime)'
        );

        if (!result.files || result.files.length === 0) {
            return null;
        }

        // Download file content as text
        const token = Auth.getToken();
        const response = await fetch(
            `${API_BASE}/files/${result.files[0].id}?alt=media`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        if (!response.ok) {
            throw new Error('Failed to download discrepancias.csv');
        }

        return response.text();
    }

    /**
     * Remove an item from discrepancias.csv (mark as "done" by admin)
     * This downloads the CSV, removes the row for the given articulo, and re-uploads
     */
    async function removeDiscrepancia(storeName, articulo) {
        const inventarioId = await findOrCreateInventarioFolder(storeName);
        const token = Auth.getToken();

        // Find discrepancias.csv file
        const result = await search(
            `'${inventarioId}' in parents and name = 'discrepancias.csv' and trashed = false`,
            'files(id,name)'
        );

        if (!result.files || result.files.length === 0) {
            // File doesn't exist, nothing to remove
            console.log('discrepancias.csv not found, nothing to remove');
            return true;
        }

        const fileId = result.files[0].id;

        // Download current content
        const downloadResponse = await fetch(
            `${API_BASE}/files/${fileId}?alt=media`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        if (!downloadResponse.ok) {
            const errorText = await downloadResponse.text();
            console.error('Download error:', errorText);
            throw new Error('Failed to download discrepancias.csv');
        }

        const csvContent = await downloadResponse.text();
        console.log('Downloaded CSV content:', csvContent.substring(0, 200));

        // Parse CSV and filter out the articulo
        const lines = csvContent.trim().split('\n');
        if (lines.length < 2) {
            console.log('CSV has only header or is empty');
            return true; // Only header or empty, nothing to remove
        }

        const header = lines[0];
        const filteredLines = [header];

        // Find the Articulo column index
        const headerCols = header.split(',').map(h => h.trim().replace(/^\uFEFF/, ''));
        const articuloIndex = headerCols.findIndex(h => h === 'Articulo');

        console.log('Header columns:', headerCols, 'Articulo index:', articuloIndex);

        if (articuloIndex === -1) {
            throw new Error('Articulo column not found in discrepancias.csv');
        }

        // Filter out rows matching the articulo
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const cols = line.split(',');
            const rowArticulo = cols[articuloIndex] ? cols[articuloIndex].trim() : '';

            if (rowArticulo !== String(articulo)) {
                filteredLines.push(line);
            } else {
                console.log('Removing row for articulo:', articulo);
            }
        }

        // Re-upload the filtered CSV with BOM for UTF-8
        const newContent = '\uFEFF' + filteredLines.join('\n');

        const updateResponse = await fetch(
            `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
            {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'text/csv; charset=utf-8'
                },
                body: newContent
            }
        );

        if (!updateResponse.ok) {
            const errorData = await updateResponse.json().catch(() => ({}));
            console.error('Update error:', updateResponse.status, errorData);
            throw new Error(`Failed to update discrepancias.csv: ${errorData.error?.message || updateResponse.status}`);
        }

        console.log('Successfully updated discrepancias.csv');
        return true;
    }

    // Public API
    return {
        findStores,
        getStoreFolders,
        listAvailableDates,
        getChecklistForDate,
        clearCache,
        // Inventario functions
        findOrCreateInventarioFolder,
        getDiscrepancias,
        removeDiscrepancia
    };
})();
