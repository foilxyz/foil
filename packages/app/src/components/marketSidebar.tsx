import { useSearchParams } from 'next/navigation';
import { useContext, useEffect } from 'react';

import { ScrollArea } from '~/components/ui/scroll-area';
import { useAddEditPosition } from '~/lib/context/AddEditPositionContext';
import { PeriodContext } from '~/lib/context/PeriodProvider';

import AddEditTrade from './addEditTrade';
import LiquidityForm from './Liquidity/LiquidityForm';
import Settle from './settle';

export default function MarketSidebar({ isTrade }: { isTrade: boolean }) {
  const { endTime } = useContext(PeriodContext);
  const expired = endTime < Math.floor(Date.now() / 1000);
  const { setNftId } = useAddEditPosition();
  const searchParams = useSearchParams();

  useEffect(() => {
    const positionId = searchParams.get('positionId');
    if (positionId) {
      setNftId(Number(positionId));
    }
  }, [searchParams, setNftId]);

  if (endTime === 0) {
    return (
      <div className="h-full border border-border rounded-md w-full flex-1 flex flex-col my-8">
        <div className="h-full flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-border opacity-50" />
        </div>
      </div>
    );
  }

  const renderContent = () => {
    if (expired) {
      return <Settle />;
    }
    if (isTrade) {
      return <AddEditTrade />;
    }
    return <LiquidityForm />;
  };

  return (
    <ScrollArea className="h-full border border-border rounded-sm w-full flex-1 flex flex-col shadow-sm">
      <div className="py-5 px-6">{renderContent()}</div>
    </ScrollArea>
  );
}
