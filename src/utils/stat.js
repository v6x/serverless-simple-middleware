const disk = require('diskusage');
const dirTree = require('directory-tree');
const logger = require('./logger')(__filename);

module.exports.printDirectoryStat = async directory =>
  new Promise(resolve => {
    disk.check(directory, (err, info) => {
      if (err) {
        logger.warn(`Cannot get disk space: ${err}`);
      } else {
        logger.debug(
          `Disk[${directory}] Total=${info.total}, Available=${
            info.available
          }, Free=${info.free}`,
        );
        logger.debug(`Start to list a files in ${directory}`);
        dirTree(directory, null, item => {
          logger.debug(item.path);
        });
        resolve();
      }
    });
  });
