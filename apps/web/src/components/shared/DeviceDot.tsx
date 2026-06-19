import clsx from 'clsx';
import type { DeviceSource } from '@vcc/shared';
import { deviceDotClass } from '../../lib/colors.js';

interface Props {
  source: DeviceSource;
  active?: boolean;
  size?: 'xs' | 'sm' | 'md';
  title?: string;
}

const sizeMap = { xs: 'w-1.5 h-1.5', sm: 'w-2 h-2', md: 'w-2.5 h-2.5' };

export function DeviceDot({ source, active = true, size = 'sm', title }: Props) {
  return (
    <span
      title={title ?? source}
      className={clsx(
        'rounded-full inline-block',
        sizeMap[size],
        active ? deviceDotClass(source) : 'border border-dashed border-hairline-strong bg-transparent',
      )}
    />
  );
}
