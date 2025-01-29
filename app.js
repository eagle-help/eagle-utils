const { JsonCache } = require('./base');
const path = require('path');
const fs = require('fs');

function importUtil(name){
    if (!name.endsWith('.js')){
        name += '.js';
    }

    if (fs.existsSync(path.join(path.dirname(eagle.plugin.path), 'utils', name))){
        return require(path.join(path.dirname(eagle.plugin.path), 'utils', name));
    } else if (fs.existsSync(path.join(eagle.plugin.path, 'utils', name))){
        return require(path.join(eagle.plugin.path, 'utils', name));
    } else {
        throw new Error(`${name} not found`);
    }
}

function _getRecursTree(p, ignores = ["^\\..*", "pyenv", "pyvenv"]){
    const arr = [];
    for (const file of fs.readdirSync(p, {recursive: true, withFileTypes: true})){
        if (ignores.some(ignore => file.name.match(new RegExp(ignore)))){
            continue;
        }
        if (file.isDirectory()){
            const subArr = _getRecursTree(path.join(p, file.name));
            for (const sub of subArr){
                arr.push(path.join(file.name, sub));
            }
        } else {
            arr.push(file.name);
        }
    }
    return arr.sort((a, b) => a.length - b.length);
}

function importPath(filePath) {
    if (!filePath.endsWith('.js')){
        filePath += '.js';
    }
    filePath = filePath.split('/').join(path.sep);

    let pluginPath = path.dirname(eagle.plugin.path);
    let files = _getRecursTree(pluginPath);
    console.log(files);
    let matchedFile;
    for (const file of files){
        if (file.includes(filePath)){
            matchedFile = file;
            break;
        }
    }

    if (matchedFile) {
        return require(path.join(pluginPath, matchedFile));
    } else {
        throw new Error(`${filePath} not found in ${pluginPath}`);
    }
}

function _roamingPath() { 
	let roamingPath;
	if (eagle.app.isWindows) {
		roamingPath = path.join(process.env.APPDATA, 'Eagle');
	} else if (eagle.app.isMac) {
		roamingPath = path.join(process.env.HOME, 'Library', 'Application Support', 'Eagle');
	} else {
		roamingPath = path.join(process.env.HOME, '.config', 'eagle');
	}
	return roamingPath;
}
const roamingPath = _roamingPath();

class PluginConfig {
    static _settingsCache = null;

    static _path = null;


    static get path() {
        if (!this._path) {
            this._path = path.join(roamingPath, 'pluginConfig.json');
            console.log("Plugin config path: ", this._path);
        }
        return this._path;

    }

    static get() {
        if (!this._settingsCache) {
            this._settingsCache = new JsonCache(this.path, true);
        }
        return this._settingsCache.data;
    }

    static set(key, value) {
        _settingsCache.set(key, value);
        _settingsCache.save();
    }

    static set_default(key, defaultValue) {
        _settingsCache.set_default(key, defaultValue);
        _settingsCache.save();
    }

    static save() {
        _settingsCache.save();
    }
}

module.exports = {
    PluginConfig,
    roamingPath,
    importUtil,
    importPath
}
