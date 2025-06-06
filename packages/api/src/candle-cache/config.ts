import { TIME_INTERVALS } from 'src/fixtures';

export const CANDLE_CACHE_CONFIG = {
  logPrefix: '[CANDLE_CACHE]',
  batchSize: 500_000,
  batchLogInterval: 10_000, // 10 seconds
  intervals: [
    TIME_INTERVALS.intervals.INTERVAL_1_MINUTE,
    TIME_INTERVALS.intervals.INTERVAL_5_MINUTES,
    TIME_INTERVALS.intervals.INTERVAL_15_MINUTES,
    TIME_INTERVALS.intervals.INTERVAL_30_MINUTES,
    TIME_INTERVALS.intervals.INTERVAL_4_HOURS,
    TIME_INTERVALS.intervals.INTERVAL_1_DAY,
    TIME_INTERVALS.intervals.INTERVAL_7_DAYS,
    TIME_INTERVALS.intervals.INTERVAL_28_DAYS,
  ],
  trailingAvgTime: [
    TIME_INTERVALS.intervals.INTERVAL_7_DAYS,
    TIME_INTERVALS.intervals.INTERVAL_28_DAYS,
  ],
  preTrailingAvgTime: TIME_INTERVALS.intervals.INTERVAL_28_DAYS,
};

export const CANDLE_CACHE_IPC_KEYS = {
  lastProcessedResourcePrice: 'lastProcessedResourcePrice',
  lastProcessedMarketPrice: 'lastProcessedMarketPrice',
  hardRefresh: 'hardRefresh',
  rebuildTrailingAvgHistory: 'rebuildTrailingAvgHistory',
  // String-based keys for process management - separated by builder type
  candleCacheBuilderStatus: 'candleCacheBuilderStatus', // For CandleCacheBuilder
  candleCacheReBuilderStatus: 'candleCacheReBuilderStatus', // For CandleCacheReBuilder
};

export const CANDLE_TYPES = {
  RESOURCE: 'resource',
  MARKET: 'market',
  TRAILING_AVG: 'trailingAvg',
  INDEX: 'index',
};

export const REBUILD_PROCESS_TYPES = {
  ALL_CANDLES: 'all_candles',
  RESOURCE_CANDLES: 'resource_candles',
};
