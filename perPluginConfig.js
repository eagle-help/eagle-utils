const { JsonCache } = require('./base');
const path = require('path');
const { getLibraryId, LibraryIDToPath } = require('./base');
const fs = require('fs');

class PerPluginConfigInternal {
    
    static _path = path.join(path.dirname(__dirname), "config.json");
    static _settingsCache = new JsonCache(
        PerPluginConfigInternal._path,
        true
    );

    // Key structure: $${type}||{id}//{key}
    static scopeMarker = "$$";
    static typeSeparator = "||";
    static idSeparator = "//";
    
    // Lock configuration (same as pluginConfig)
    static useLock = false;
    static lockRetryInterval = 100;
    static lockMaxAge = 30;
    static #lockPath = path.join(path.dirname(__dirname), "perPluginConfig.lock");
    static #lockTimeout = 10000;
    static #lockHolder = null;

    
    
    static async getRaw() {
        await this.#acquireLock();
        try {
            return this._settingsCache.data;
        } finally {
            this.#releaseLock();
        }
    }

    static async setRaw(key, value) {
        await this.#acquireLock();
        try {
            this._settingsCache.data[key] = value;
            await this._settingsCache.save();
        } finally {
            this.#releaseLock();
        }
    }

    static async #acquireLock() {
        if (!this.useLock) return;
        if (this.#lockHolder === process.pid) return;
        
        const start = Date.now();
        while (fs.existsSync(this.#lockPath)) {
            const stats = fs.statSync(this.#lockPath);
            const lockAge = Date.now() - stats.ctimeMs;

            if (lockAge > this.lockMaxAge * 1000) {
                fs.unlinkSync(this.#lockPath);
                break;
            }

            await new Promise(resolve => setImmediate(resolve));
            if (Date.now() - start > this.#lockTimeout) {
                throw new Error(`Lock timeout after ${this.#lockTimeout}ms`);
            }
            await new Promise(resolve => setTimeout(resolve, this.lockRetryInterval));
        }
        
        try {
            fs.writeFileSync(this.#lockPath, '', { flag: 'wx' });
        } catch (error) {
            if (error.code === 'EEXIST') return this.#acquireLock();
            throw error;
        }
        this.#lockHolder = process.pid;
    }

    static #releaseLock() {
        if (!this.useLock) return;
        try {
            if (this.#lockHolder === process.pid) {
                fs.unlinkSync(this.#lockPath);
                this.#lockHolder = null;
            }
        } catch (error) {
            console.error('Lock release error:', error);
        }
    }
}

class PerPluginConfig {
    /**
     * Build scoped key based on hierarchy level
     * @param {string} type - 'item', 'folder', or 'library'
     * @param {string} pathOrId - ID or path of the target entity
     * @param {string} key - Configuration key
     */
    static #buildKey(type, pathOrId, key) {
        let id = pathOrId;
        
        if (type === 'library') {
            // Use existing getLibraryId function that maintains the map
            id = getLibraryId(pathOrId);
        }

        return [
            PerPluginConfigInternal.scopeMarker,
            type,
            PerPluginConfigInternal.typeSeparator,
            id,
            PerPluginConfigInternal.idSeparator,
            eagle.plugin.manifest.id,
            PerPluginConfigInternal.idSeparator,
            key
        ].join('');
    }

    /**
     * Get value with priority: item > folder > library > global
     * @param {string} key - Configuration key
     * @param {object} [context] - Optional context with itemId, folderId, libraryId
     */
    static async get(key, context = {}) {
        const data = await PerPluginConfigInternal.getRaw();
        
        // Check in priority order
        const scopes = [
            context.itemId && this.#buildKey('item', context.itemId, key),
            context.folderId && this.#buildKey('folder', context.folderId, key),
            context.libraryId && this.#buildKey('library', context.libraryId, key),
            key // Global fallback
        ].filter(Boolean);

        for (const scopeKey of scopes) {
            if (scopeKey in data) {
                return data[scopeKey];
            }
        }
        return undefined;
    }

    // Scoped setters
    static async setItem(itemId, key, value) {
        const fullKey = this.#buildKey('item', itemId, key);
        return PerPluginConfigInternal.setRaw(fullKey, value);
    }

    static async setFolder(folderId, key, value) {
        const fullKey = this.#buildKey('folder', folderId, key);
        return PerPluginConfigInternal.setRaw(fullKey, value);
    }

    static async setLibrary(libraryPath, key, value) {
        const fullKey = this.#buildKey('library', libraryPath, key);
        return PerPluginConfigInternal.setRaw(fullKey, value);
    }

    static async setGlobal(key, value) {
        return PerPluginConfigInternal.setRaw(key, value);
    }

    static async set(key, value) {
        return PerPluginConfigInternal.setRaw(key, value);
    }

    // Bulk operations
    static async getForItem(itemId, key) {
        const fullKey = this.#buildKey('item', itemId, key);
        return PerPluginConfigInternal.getRaw()[fullKey];
    }

    static async getForFolder(folderId, key) {
        const fullKey = this.#buildKey('folder', folderId, key);
        return PerPluginConfigInternal.getRaw()[fullKey];
    }

    static async getForLibrary(libraryPath, key) {
        const fullKey = this.#buildKey('library', libraryPath, key);
        return PerPluginConfigInternal.getRaw()[fullKey];
    }

    // Add method to get path from ID
    static getLibraryPath(id) {
        return LibraryIDToPath.get(id);
    }
}

module.exports = { PerPluginConfig };
