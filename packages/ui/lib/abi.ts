import type { Abi } from 'abitype';
import sapience from '../../protocol/deployments/Sapience.json';
import sapienceFactory from '../../protocol/deployments/SapienceFactory.json';

export const sapienceAbi = () => {
  const abi: Abi = sapience.abi as Abi;

  return { abi };
};

export const sapienceFactoryAbi = () => {
  const abi: Abi = sapienceFactory.abi as Abi;

  return { abi };
};
