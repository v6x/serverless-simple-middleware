import * as dirTree from 'directory-tree';
import * as disk from 'diskusage';

import { getLogger } from '../utils';
import { HandlerAuxBase, HandlerPluginBase } from './base';

const logger = getLogger(__filename);

type IDiskInfoError = Error | string;

interface IDiskInfo {
  total: number;
  available: number;
  free: number;
}

interface IDirTreeItem {
  path: string;
}

const printDirectoryStat = async (directory: string) =>
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

export interface StatPluginAux extends HandlerAuxBase {
  printDirectoryStat: typeof printDirectoryStat;
}

export class StatPlugin extends HandlerPluginBase<StatPluginAux> {
  public create = async () => {
    return { printDirectoryStat };
  };
}

const build = () => new StatPlugin();
export default build;
