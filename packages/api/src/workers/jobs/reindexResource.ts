import { INDEXERS } from 'src/fixtures';
import type { Resource } from '../../../generated/prisma';

export const reindexResource = async (
  resource: Resource,
  startTimestamp: number,
  endTimestamp?: number
) => {
  const indexer = INDEXERS[resource.slug];

  const result = await indexer?.indexBlockPriceFromTimestamp(
    resource,
    startTimestamp,
    endTimestamp
  );
  return result;
};
