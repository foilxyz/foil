import { Switch } from '@foil/ui/components/ui/switch';
import { Loader2 } from 'lucide-react';
import type React from 'react';

import type { PublicCellProps } from './types';

const PublicCell: React.FC<PublicCellProps> = ({
  isPublic,
  marketGroup,
  loading,
  onUpdate,
  marketId,
}) => (
  <div className="flex items-center gap-2">
    <Switch
      checked={isPublic}
      onCheckedChange={() => onUpdate(marketGroup, marketId)}
      disabled={loading}
      aria-label="Toggle market public status"
    />
    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
  </div>
);

export default PublicCell;
