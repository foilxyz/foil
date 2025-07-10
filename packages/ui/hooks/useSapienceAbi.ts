import type { Abi } from 'abitype';
import sapience from '../../protocol/deployments/Sapience.json';

export const useSapienceAbi = () => {
  const abi: Abi = sapience.abi as Abi;

  return { abi };
};
