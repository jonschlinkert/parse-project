const { projectFiles } = require('.');

const onDirectory = dirent => {
  if (dirent.name === '.git') {
    dirent.keep = dirent.recurse = false;
  }
};

const onFile = dirent => {
  console.log(dirent.path);
};

projectFiles('.', '**/*.json', { ignore: ['.DS_Store'], onDirectory, onFile })
  .then(files => {
    console.log(files);
  })
  .catch(console.error);

// const project = {
//   files: () => {},
//   metadata: () => {},
//   dotfiles: () => {},
//   git: () => {},
//   tests: () => {},
//   junk: () => {}
// };

