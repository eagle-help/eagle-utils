const { JsonCache } = require('./base');
const path = require('path');
const { roamingPath } = require('./app');
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
    static lockRetryInterval = 100;
    static lockMaxAge = 30;
    static #lockPath = path.join(roamingPath, 'perPluginConfig.lock');
    static #lockTimeout = 10000;
    static #lockHolder = null;

    // Reuse lock implementation from pluginConfig
    static #acquireLock = PluginConfigInternal.#acquireLock;
    static #releaseLock = PluginConfigInternal.#releaseLock;

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
}

class PerPluginConfig {
    /**
     * Build scoped key based on hierarchy level
     * @param {string} type - 'item', 'folder', or 'library'
     * @param {string} id - ID of the target entity
     * @param {string} key - Configuration key
     */
    static #buildKey(type, id, key) {
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

    static async setLibrary(libraryId, key, value) {
        const fullKey = this.#buildKey('library', libraryId, key);
        return PerPluginConfigInternal.setRaw(fullKey, value);
    }

    static async setGlobal(key, value) {
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

    static async getForLibrary(libraryId, key) {
        const fullKey = this.#buildKey('library', libraryId, key);
        return PerPluginConfigInternal.getRaw()[fullKey];
    }
}

module.exports = { PerPluginConfig };
