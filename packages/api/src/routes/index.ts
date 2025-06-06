import { router as marketRoutes } from './markets';
import { router as estimateRoutes } from './estimate';
import { router as getStEthPerTokenAtTimestampsRoutes } from './getStEthPerTokenAtTimestamp';
import { router as missingBlocksRoutes } from './missing-blocks';
import { router as positionRoutes } from './positions';
import { router as reindexRoutes } from './reindex';
import { router as updateMarketPrivacyRoutes } from './updateMarketPrivacy';
import { router as volumeRoutes } from './volume';
import { router as transactionRoutes } from './transactions';
import { router as permitRoutes } from './permit';
import { router as cryptoPricesRoutes } from './crypto-prices';
import { router as refreshCacheRoutes } from './refreshCache';
import { router as quoterRoutes } from './quoter';
import { router as createMarketRoutes } from './createMarket';
import { Router } from 'express';

const router = Router();

router.use('/estimate', estimateRoutes);
router.use('/getStEthPerTokenAtTimestamps', getStEthPerTokenAtTimestampsRoutes);
router.use('/marketGroups', marketRoutes);
router.use('/missing-blocks', missingBlocksRoutes);
router.use('/positions', positionRoutes);
router.use('/reindex', reindexRoutes);
router.use('/transactions', transactionRoutes);
router.use('/updateMarketPrivacy', updateMarketPrivacyRoutes);
router.use('/volume', volumeRoutes);
router.use('/permit', permitRoutes);
router.use('/crypto-prices', cryptoPricesRoutes);
router.use('/cache', refreshCacheRoutes);
router.use('/quoter', quoterRoutes);
router.use('/create-market-group', createMarketRoutes);

export { router };
