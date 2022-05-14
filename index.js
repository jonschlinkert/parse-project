const fs = require('fs');
const path = require('path');
const pico = require('picomatch');
const readdir = require('@folder/readdir');
const parseGitignore = require('/Users/jonschlinkert/dev/git-utils/parse-gitignore-master/index.js');

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

const partitionPatterns = (dir, options = {}) => {
  const ignorePath = path.resolve(dir, '.gitignore');
  const exists = fs.existsSync(ignorePath);

  if (!exists && !options.ignore && !options.unignore) {
    return { positive: [], negative: [] };
  }

  const parsed = exists && parseGitignore.file(ignorePath, { path: ignorePath });
  const positive = [].concat(options.ignore || []);
  const negative = [].concat(options.unignore || []);

  if (exists) {
    for (const { type, patterns } of parsed.globs()) {
      if (type === 'unignore') {
        negative.push(...patterns);
      } else {
        positive.push(...patterns);
      }
    }
  }

  return {
    positive: [...new Set(positive)],
    negative: [...new Set(negative)]
  };
};

const getIgnored = (dir, options = {}) => {
  const { positive = [], negative = [] } = partitionPatterns(dir, options);

  if (positive.length === 0 && negative.length === 0) {
    return () => false;
  }

  return pico(positive, { ignore: negative });
};

const getIncluded = (dir, options) => {
  const pkgPath = path.resolve(dir, 'package.json');
  const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath)) : {};
  const included = [];

  const expand = (type, relative) => {
    const file = { type, path: path.resolve(dir, relative), relative };
    if (file.type !== 'glob' && fs.existsSync(file.path)) {
      const stat = fs.statSync(file.path);
      file.type = stat.isDirectory() ? 'dir' : 'file';
    } else {
      file.type = 'glob';
      file.isMatch = pico(file.relative, options);
    }
    return file;
  };

  for (const file of [].concat(pkg.files || [])) included.push(expand('file', file));
  for (const file of [].concat(pkg.directories || [])) included.push(expand('dir', file));

  if (typeof pkg.main === 'string') included.push(expand('file', pkg.main));
  if (typeof pkg.bin === 'string') included.push(expand('file', pkg.bin));

  if (pkg.bin && typeof pkg.bin === 'object') {
    for (const file of Object.values(pkg.bin)) {
      included.push(expand('file', file));
    }
  }

  if (pkg.workspaces) {
    for (const pattern of [].concat(pkg.workspaces)) {
      included.push(expand('glob', pattern.replace(/\/\*$/, '/**')));
    }
  }

  return included;
};

const isIncluded = (file, { exts = [], included = [] }) => {
  if (!exts.includes(file.extname)) return false;

  for (const ele of included) {
    if (ele.type === 'file' && file.isFile() && ele.relative === file.relative) {
      return true;
    }

    if (ele.type === 'dir' && file.path.startsWith(ele.path + path.sep)) {
      return true;
    }

    if (ele.type === 'glob' && ele.isMatch(file.relative)) {
      return true;
    }
  }

  return included.length === 0;
};

const shouldKeep = (file, { exts, included, isMatch, isIgnored, isIncluded, options }) => {
  file.extname ||= path.extname(file.name);

  if (!isIncluded(file, { exts, included })) {
    return false;
  }

  if (!isMatch(file.relative)) {
    return false;
  }

  const base_folder = file.relative.split(path.sep)[0];
  return !isIgnored(base_folder) && !isIgnored(file.path) && !file.skip && !file.ignore;
};

const createMatchers = (dir, pattern, options = {}) => {
  if (isObject(pattern)) {
    options = pattern || {};
    pattern = null;
  }

  const included = getIncluded(dir, options);
  const isIgnored = getIgnored(dir, options);

  const exts = options.exts || ['.jsx', '.js', '.mjs', '.ts', '.tsx'];
  const isMatch = pattern ? pico(pattern, options) : () => true;

  return {
    dirIsMatch: file => !isIgnored(file.path),
    fileIsMatch: file => shouldKeep(file, { exts, included, isMatch, isIgnored, isIncluded, options })
  };
};

const projectFiles = async (dir, pattern, options = {}) => {
  if (isObject(pattern)) {
    return projectFiles(dir, undefined, pattern);
  }

  const { fileIsMatch, dirIsMatch } = createMatchers(dir, pattern, options);
  const opts = { recursive: true, objects: true, base: options.cwd || dir, ...options };

  const files = [];

  const onDirectory = dirent => {
    dirent.keep = dirent.recurse = dirIsMatch(dirent);

    if (dirent.keep && options.onDirectory) {
      options.onDirectory(dirent);
    }
  };

  const onFile = async file => {
    const match = fileIsMatch(file);
    if (match) {
      options.onFile?.(file);
      files.push(file);
    }
  };

  await readdir(dir, { ...opts, onDirectory, onFile });
  // console.log(files.map(file => file.relative));
  return files;
};

module.exports = projectFiles;
module.exports.createMatchers = createMatchers;
module.exports.getIgnored = getIgnored;
module.exports.getIncluded = getIncluded;
module.exports.projectFiles = projectFiles;

// const dir = '/Users/jonschlinkert/dev/@brandscale/api/packages/react-ui';

// projectFiles(dir, '**/*.{ts,mjs}', { ignore: 'cypress' });

// const project = {
//   files: () => {},
//   metadata: () => {},
//   dotfiles: () => {},
//   git: () => {},
//   tests: () => {},
//   junk: () => {}
// };
