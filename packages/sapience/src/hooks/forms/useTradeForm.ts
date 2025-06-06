import { useForm } from 'react-hook-form';

// Define the shape of the form values
export interface TradeFormValues {
  direction: 'Long' | 'Short';
  size: string;
  slippage: string;
}

// Default values for the form
const defaultValues: TradeFormValues = {
  direction: 'Long', // Default direction
  size: '',
  slippage: '0.5', // Default slippage 0.5%
};

interface UseTradeFormOptions {
  defaultValues?: Partial<TradeFormValues>;
}

/**
 * Hook for managing the trade form state and validation using react-hook-form.
 */
export function useTradeForm(options?: UseTradeFormOptions) {
  const form = useForm<TradeFormValues>({
    defaultValues: {
      ...defaultValues,
      ...options?.defaultValues,
    },
    mode: 'onChange', // Validate on change for better UX
  });

  // Register fields with validation rules
  form.register('direction', { required: 'Direction is required' });

  form.register('size', {
    required: 'Size is required',
    validate: {
      positive: (value) =>
        parseFloat(value) >= 0 || 'Size must be zero or greater',
      isNumber: (value) =>
        !Number.isNaN(parseFloat(value)) || 'Size must be a valid number',
    },
  });

  form.register('slippage', {
    required: 'Slippage is required',
    validate: {
      isNumber: (value) =>
        !Number.isNaN(parseFloat(value)) || 'Slippage must be a valid number',
      range: (value) =>
        (parseFloat(value) >= 0 && parseFloat(value) <= 100) ||
        'Slippage must be between 0% and 100%',
    },
  });
  return form;
}
