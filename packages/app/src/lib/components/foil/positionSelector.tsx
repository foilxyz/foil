import { FormControl, FormLabel, Select } from '@chakra-ui/react';
import {
  useContext,
  useEffect,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type React from 'react';
import { useReadContracts } from 'wagmi';

import { MarketContext } from '~/lib/context/MarketProvider';
import type { FoilPosition } from '~/lib/interfaces/interfaces';
import { PositionKind } from '~/lib/interfaces/interfaces';

interface PositionSelectorProps {
  isLP: boolean;
  onChange: Dispatch<SetStateAction<number>>;
  nftIds: number[];
  value: number;
  refreshTrigger: number;
}

const useIsLps = (ids: number[]) => {
  const { foilData } = useContext(MarketContext);

  const { data, refetch } = useReadContracts({
    contracts: ids.map((i) => {
      return {
        abi: foilData.abi,
        address: foilData.address as `0x${string}`,
        functionName: 'getPosition',
        args: [i],
      };
    }),
  });

  const isLps: boolean[] = useMemo(() => {
    if (!data) return [];
    return data.map((resp) => {
      const position = resp.result as FoilPosition;
      return position.kind === PositionKind.Liquidity;
    });
  }, [data]);

  return { isLps, refetch };
};

const PositionSelector: React.FC<PositionSelectorProps> = ({
  isLP,
  onChange,
  nftIds,
  value,
  refreshTrigger,
}) => {
  const { isLps, refetch } = useIsLps(nftIds);
  const filteredNfts = useMemo(
    () => nftIds.filter((_, index) => (isLP ? isLps[index] : !isLps[index])),
    [nftIds, isLps, isLP]
  );

  useEffect(() => {
    refetch();
  }, [refreshTrigger]);

  useEffect(() => {
    onChange(filteredNfts[filteredNfts.length - 1]);
  }, [filteredNfts]);

  const handleAccountChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedAccount = Number(event.target.value);
    onChange(selectedAccount);
  };

  return (
    <FormControl mb={6} display="flex" alignItems="center">
      <FormLabel mb={0} mr={3} flexShrink={0}>
        Position
      </FormLabel>
      <Select
        borderRadius="md"
        onChange={handleAccountChange}
        value={value}
        size="sm"
      >
        {filteredNfts.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
        <option key="new" value={0}>
          New Position
        </option>
      </Select>
    </FormControl>
  );
};

export default PositionSelector;
