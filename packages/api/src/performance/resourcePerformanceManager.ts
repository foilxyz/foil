import { ResourcePerformance } from './resourcePerformance';
import { Resource } from 'src/models/Resource';

export class ResourcePerformanceManager {
  private static _instance: ResourcePerformanceManager;
  private static _initialized: boolean = false;
  private static _initializing: boolean = false;

  private resources: Resource[] = [];
  private resourcePerformances: {
    [resourceSlug: string]: ResourcePerformance;
  } = {};

  private constructor() {}

  public static getInstance() {
    if (!ResourcePerformanceManager._instance) {
      ResourcePerformanceManager._instance = new ResourcePerformanceManager();
    }
    return ResourcePerformanceManager._instance;
  }

  public async initialize(resources: Resource[]) {
    if (ResourcePerformanceManager._initialized) {
      return;
    }
    if (ResourcePerformanceManager._initializing) {
      return;
    }
    console.time('ResourcePerformanceManager.initialize');
    ResourcePerformanceManager._initializing = true;
    await this.initializeResources(resources, false);
    ResourcePerformanceManager._initialized = true;
    ResourcePerformanceManager._initializing = false;
    console.timeEnd('ResourcePerformanceManager.initialize');
  }

  private async initializeResources(
    resources: Resource[],
    hardInitialize: boolean
  ) {
    this.resources = resources;
    for (const resource of this.resources) {
      // if (resource.slug != 'ethereum-gas') {
      //   continue;
      // }
      this.resourcePerformances[resource.slug] = new ResourcePerformance(
        resource
      );
      if (hardInitialize) {
        console.log(
          `ResourcePerformanceManager Hard initializing resource ${resource.slug}`
        );
        await this.resourcePerformances[resource.slug].hardInitialize();
      } else {
        console.log(
          `ResourcePerformanceManager Soft initializing resource ${resource.slug}`
        );
        await this.resourcePerformances[resource.slug].softInitialize();
      }
      console.log(`ResourcePerformanceManager Resource ${resource.slug} done`);
    }
  }

  public async hardRefresh(resources: Resource[]) {
    console.log('ResourcePerformanceManager Hard Refresh');
    await this.initializeResources(resources, true);
  }

  public async softRefresh(resources: Resource[]) {
    console.log('ResourcePerformanceManager Soft Refresh');
    await this.initializeResources(resources, false);
  }

  public getResourcePerformance(resourceSlug: string) {
    if (
      !this.resourcePerformances[resourceSlug] &&
      !ResourcePerformanceManager._initialized
    ) {
      throw new Error(
        `Resource performance not initialized for ${resourceSlug}`
      );
    }
    return this.resourcePerformances[resourceSlug];
  }

  public getResourcePerformanceFromChainAndAddress(
    chainId: number,
    address: string
  ) {
    for (const resource of this.resources) {
      const slug = resource.slug;
      const rp = this.resourcePerformances[slug];
      if (rp.getMarketFromChainAndAddress(chainId, address)) {
        return rp;
      }
    }

    throw new Error(
      `Resource performance not initialized for ${chainId}-${address}`
    );
  }

  public getResourcePerformances() {
    if (!ResourcePerformanceManager._initialized) {
      throw new Error('Resource performance not initialized');
    }
    return this.resourcePerformances;
  }
}
