import fs from 'fs';
import { resolve } from 'path';
import { normalizePath } from 'vite';

interface InputSource{
    input: string;
    output: {
        inlineDynamicImports: boolean;
    }
}

/**
 *
 * @param {String} path  source 的path；如："./src/Resources/chrome", "./src/Resources/"
 * @param {String} dir   source及下面的文件或文件夹; 如："source"
 * @param {String} type  类型，source或lib；默认source, source为source目录下的文件或文件夹会构建输出，lib为lib目录下的文件或文件夹只是拷贝输出
 * @returns
 */
function addSourceEntry(path:string, dir:string, sourceConfigMap:Record<string, string>, type:string = "source") {
    if(!path){
        return sourceConfigMap;
    }
    // console.log("path------------", `${path}/${dir}`)
    if(!fs.existsSync(`${path}/${dir}`)){
        return sourceConfigMap;
    }
    
    let fileOrDir = fs.readdirSync(`${path}/${dir}`);
    fileOrDir.forEach(function(file) {
        // spaces 文件夹下内容和service-worker不构建，会单独构建
        // console.log('file------------', file)
        if(file === 'search' || file === 'service-worker.ts'){
            return;
        }
        let entryName = `${dir}/${file}`;
        let newDir = `${path}/${dir}/${file}`;
        if (fs.statSync(newDir).isDirectory()) {
            addSourceEntry(path, `${dir}/${file}`, sourceConfigMap, type);
        }else{
          let sourceKey = entryName;
          if(type === "source"){
            sourceKey = entryName.replace(/\.[^/.]+$/, "");
          }
          if (sourceConfigMap[sourceKey] && type === "source") {
                throw new Error("有名字重复的页面:" + dir);
            }else{
                sourceConfigMap[sourceKey] = newDir
            }
        }
    });
    // console.log('sourceConfig-------------', JSON.stringify(sourceConfigMap));
    // return sourceConfigMap;
}


/** Open 构建不打包的 Pro-only 页面脚本（广告标记 / 视频嗅探 / Stay 桥） */
const OPEN_EXCLUDED_SOURCE_PREFIXES = [
  'source/inject/tag',
  'source/inject/official.bridge',
  'source/downloader/',
];

function isOpenExcludedSourceKey(sourceKey: string): boolean {
  return OPEN_EXCLUDED_SOURCE_PREFIXES.some(
    (prefix) => sourceKey === prefix || sourceKey.startsWith(prefix),
  );
}

export const inputSourceConfig = (
  platformName: string,
  browserName: string,
  buildEdition = 'pro',
) => {
  const sourceConfigMap: Record<string, string> = {};
  addSourceEntry(`./src/resources`, 'source', sourceConfigMap, 'source');
  addSourceEntry(
    `./src/resources/platform/${platformName}/${browserName}`,
    'source',
    sourceConfigMap,
    'source',
  );
  if (buildEdition === 'open') {
    for (const key of Object.keys(sourceConfigMap)) {
      if (isOpenExcludedSourceKey(key)) {
        delete sourceConfigMap[key];
      }
    }
  }
  return sourceConfigMap;
};

const hasFilesInDirectorySync = (dirPath: string): boolean => {
    try {
        // 检查路径是否存在
        if (fs.existsSync(dirPath)) {
            // 读取目录内容
            const files = fs.readdirSync(dirPath);
            // 判断目录是否有文件
            return files.length > 0;
        }
        return false;
    } catch (error) {
        console.error('Error checking directory:', error);
        return false;
    }
}

export const copyFilesConfig = (OUTPUT_DIR:string, platformName:string, browserName:string, buildEdition = 'pro') => {
    const manifestFile = buildEdition === 'open' ? 'manifest.open.json' : 'manifest.json';
    const extensionImgDir =
      buildEdition === 'open' ? 'src/assets/extension-img-open' : 'src/assets/extension-img';
    const faviconFile =
      buildEdition === 'open' ? 'src/assets/favicon.open.ico' : 'src/assets/favicon.ico';
    const targets = [
        {
            src: normalizePath(resolve(`src/resources/platform/${platformName}/${browserName}/${manifestFile}`)), // 源路径
            dest: resolve(`${OUTPUT_DIR}/`), // 目标路径
            rename: 'manifest.json',
        },
        {
            src: normalizePath(resolve(extensionImgDir)),
            dest: resolve(`${OUTPUT_DIR}/`),
            rename: 'extension-img',
        },
        {
            src: normalizePath(resolve(faviconFile)),
            dest: resolve(`${OUTPUT_DIR}/`),
            rename: 'favicon.ico',
        },
        {
            src: normalizePath(resolve(`src/resources/_locales`)),
            dest: resolve(`${OUTPUT_DIR}/`)
        },
        {
            src: normalizePath(resolve(`src/resources/config`)),
            dest: resolve(OUTPUT_DIR + '/source/dark')
        }
    ];

    if (browserName === 'safari') {
      // 外置 boot：扩展页 CSP 禁内联 script，必须用 self 文件
      targets.push({
        src: resolve(`src/resources/platform/${platformName}/${browserName}/popup/safari-panel-boot.js`),
        dest: resolve(`${OUTPUT_DIR}/popup`),
        rename: 'safari-panel-boot.js',
      });
      // Safari：无 default_popup 时 action.onClicked 常不触发；用极简 popup 转发 toggle
      targets.push({
        src: resolve(`src/resources/platform/${platformName}/${browserName}/popup/safari-action.html`),
        dest: resolve(`${OUTPUT_DIR}/popup`),
        rename: 'safari-action.html',
      });
      targets.push({
        src: resolve(`src/resources/platform/${platformName}/${browserName}/popup/safari-action.js`),
        dest: resolve(`${OUTPUT_DIR}/popup`),
        rename: 'safari-action.js',
      });
    }

    const libConfigMap:Record<string, string> = {};
    addSourceEntry(`src/resources`, 'lib', libConfigMap, "lib");
    addSourceEntry(`src/resources/${platformName}/${browserName}`, 'lib', libConfigMap, "lib");
    // console.log("libConfigMap-----values--------", Object.values(libConfigMap));
    // console.log("libConfigMap-----keys--------", Object.keys(libConfigMap));
    
    Object.keys(libConfigMap).forEach((key) => {
      const pathRegex = /^(.*\/)/;
      const pathMatch = key.match(pathRegex) || '';
      const path = pathMatch ? pathMatch[1] : '';
      targets.push({
        src: normalizePath(resolve(libConfigMap[key])),
        dest: resolve(OUTPUT_DIR + '/source/'+ path)
      });
    });
    
    return targets;
};
