import { useState } from 'react';
import { Image, View } from 'react-native';
import { T } from './ui';
import type { Make } from '@/lib/catalogue';
import { colors } from '@/lib/theme';
import { t } from '@/lib/i18n';

/**
 * A make's logo on a white tile, always the same size. Logos are uploaded from the management app;
 * until one is uploaded (or if it fails to load) the tile shows the make's name instead.
 */
export function MakeLogo({ make, size = 56 }: { make: Pick<Make, 'name_ar' | 'name_en' | 'logo_url'> | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const url = make?.logo_url && !broken ? make.logo_url : '';
  const name = make?.name_en || make?.name_ar || '';
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {url ? (
        <Image source={{ uri: url }} onError={() => setBroken(true)} resizeMode="contain" accessibilityLabel={make?.name_ar}
          style={{ width: size * 0.7, height: size * 0.7 }} />
      ) : (
        <T w="bold" size={Math.max(9, Math.min(size * 0.2, name.length > 8 ? size * 0.15 : size * 0.22))} color={colors.ink} center numberOfLines={2}
          style={{ paddingHorizontal: 4, lineHeight: size * 0.26 }}>{name || t('؟')}</T>
      )}
    </View>
  );
}
