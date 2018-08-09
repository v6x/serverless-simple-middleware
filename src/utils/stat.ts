import * as dirTree from 'directory-tree';
import * as disk from 'diskusage';
import { getLogger } from './logger';

const logger = getLogger(__filename);

export type IDiskInfoError = Error | string;

export interface IDiskInfo {
  total: number;
  available: number;
  free: number;
}

export interface IDirTreeItem {
  path: string;
}

export const printDirectoryStat = async (directory: string) =>
  new Promise(resolve => {
    disk.check(directory, (err: IDiskInfoError, info: IDiskInfo) => {
      if (err) {
        logger.warn(`Cannot get disk space: ${err}`);
      } else {
        logger.debug(
          `Disk[${directory}] Total=${info.total}, Available=${
            info.available
          }, Free=${info.free}`,
        );
        logger.debug(`Start to list a files in ${directory}`);
        dirTree(directory, null, (item: IDirTreeItem) => {
          logger.debug(item.path);
        });
        resolve();
      }
    });
  });
