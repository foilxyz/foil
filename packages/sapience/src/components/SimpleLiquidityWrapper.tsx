import type { LiquidityFormValues } from '@foil/ui';
import { LiquidityForm } from '@foil/ui';
import { useToast } from '@foil/ui/hooks/use-toast';
import { useState } from 'react';
import type React from 'react';

interface SimpleLiquidityWrapperProps {
  collateralAssetTicker: string;
  baseTokenName: string;
  quoteTokenName: string;
}

const SimpleLiquidityWrapper: React.FC<SimpleLiquidityWrapperProps> = ({
  collateralAssetTicker,
  baseTokenName,
  quoteTokenName,
}) => {
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);

  const handleLiquiditySubmit = (data: LiquidityFormValues) => {
    toast({
      title: 'Liquidity Added',
      description: `Deposit: ${data.depositAmount} ${collateralAssetTicker}, Low Price: ${data.lowPrice}, High Price: ${data.highPrice}, Slippage: ${data.slippage}%`,
    });
  };

  const handleConnectWallet = () => {
    // In a real implementation, this would connect to a wallet
    setIsConnected(true);
    toast({
      title: 'Wallet Connected',
      description: 'Your wallet has been successfully connected',
    });
  };

  return (
    <div className="h-full">
      <LiquidityForm
        onLiquiditySubmit={handleLiquiditySubmit}
        collateralAssetTicker={collateralAssetTicker}
        virtualBaseTokensName={baseTokenName}
        virtualQuoteTokensName={quoteTokenName}
        isConnected={isConnected}
        onConnectWallet={handleConnectWallet}
      />
    </div>
  );
};

export default SimpleLiquidityWrapper;
