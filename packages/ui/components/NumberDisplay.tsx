import { Minus } from 'lucide-react';
import type React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

export interface NumberDisplayProps {
  value: number | string | bigint;
  precision?: number;
}

export const NumberDisplay: React.FC<NumberDisplayProps> = ({
  value,
  precision = 4,
}) => {
  const formatNumber = (val: bigint | number | string): string => {
    let numValue: number;

    if (typeof val === 'bigint') {
      numValue = Number(val) / 10 ** 18;
    } else if (typeof val === 'number') {
      numValue = val;
    } else if (typeof val === 'string') {
      numValue = parseFloat(val);
    } else {
      return 'Invalid input';
    }

    if (isNaN(numValue)) {
      return 'Invalid number';
    }

    if (Math.abs(numValue) < 1 / 10 ** precision && numValue !== 0) {
      return `<${1 / 10 ** precision}`;
    }

    const factor = 10 ** precision;
    const roundedValue = Math.floor(numValue * factor) / factor;

    return roundedValue.toString();
  };

  const displayValue = formatNumber(value || 0);
  
  // Format original value for tooltip as a decimal if it's a BigInt
  const tooltipValue = typeof value === 'bigint' 
    ? (Number(value) / 10 ** 18).toString()
    : value?.toString() || '0';

  if (!displayValue.length) {
    return <Minus className="opacity-20" />;
  }

  if (displayValue === tooltipValue) {
    return <span className="cursor-default">{displayValue}</span>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger type="button" className="cursor-default">
          {displayValue}
        </TooltipTrigger>
        <TooltipContent className="font-normal">{tooltipValue}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}; 